import { getSupabaseClient, supabaseEnabled } from '@app/services/supabase'
import { cacheGet, cacheSet } from '@admin/services/memoryCache'

export type SellerStage = 'lead' | 'onboarding' | 'active' | 'at_risk' | 'churned' | 'sold' | 'lost'

export interface CrmSellerSummaryRow {
  seller_id: string
  seller_name: string
  email: string | null
  whatsapp_number: string | null
  is_store: boolean
  city: string | null
  province: string | null
  active_listings_count: number
  wa_clicks_7d: number
  wa_clicks_30d: number
  contacts_total_7d: number
  contacts_total_30d: number
  email_contacts_7d: number
  email_contacts_30d: number
  last_lead_at: string | null
  last_lead_listing_id?: string | null
  last_lead_listing_slug?: string | null
  last_lead_listing_title?: string | null
  last_outreach_at: string | null
  stage: SellerStage | string | null
  priority: number | null
  owner_admin_user_id: string | null
  whatsapp_opt_out: boolean
  email_opt_out: boolean
  cooldown_until: string | null
  last_contacted_at: string | null
  score: number
  tags?: string[]
}

export interface FetchSellerOpsInboxArgs {
  page: number
  pageSize: number
  filters?: Record<string, unknown>
  sort?: string
}

export interface FetchSellerOpsInboxResult {
  rows: CrmSellerSummaryRow[]
}

export interface SellerOpsStats {
  total: number
  withActiveListings: number
  stores: number
  atRisk: number
}

export async function fetchSellerOpsStats(): Promise<SellerOpsStats> {
  if (!supabaseEnabled) return { total: 0, withActiveListings: 0, stores: 0, atRisk: 0 }
  
  const cacheKey = 'sellerOps:stats'
  const cached = cacheGet<SellerOpsStats>(cacheKey)
  if (cached) return cached

  const supabase = getSupabaseClient()
  
  // Get counts in parallel - using count with different filters
  const [
    { count: total },
    { count: withActiveListings },
    { count: stores },
    { count: atRisk },
  ] = await Promise.all([
    supabase
      .from('crm_seller_summary')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('crm_seller_summary')
      .select('*', { count: 'exact', head: true })
      .gt('active_listings_count', 0),
    supabase
      .from('crm_seller_summary')
      .select('*', { count: 'exact', head: true })
      .eq('is_store', true),
    supabase
      .from('crm_seller_summary')
      .select('*', { count: 'exact', head: true })
      .eq('stage', 'at_risk'),
  ])

  const result: SellerOpsStats = {
    total: total ?? 0,
    withActiveListings: withActiveListings ?? 0,
    stores: stores ?? 0,
    atRisk: atRisk ?? 0,
  }
  
  cacheSet(cacheKey, result, 60_000) // 1 minute cache
  return result
}

export async function fetchSellerOpsInbox({ page, pageSize, filters = {}, sort }: FetchSellerOpsInboxArgs): Promise<FetchSellerOpsInboxResult> {
  if (!supabaseEnabled) return { rows: [] }
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))

  const cacheKey = `sellerOps:inbox:${safePage}:${safePageSize}:${sort || ''}:${JSON.stringify(filters)}`
  const cached = cacheGet<FetchSellerOpsInboxResult>(cacheKey)
  if (cached) return cached

  const supabase = getSupabaseClient()
  const rpcArgs: Record<string, unknown> = {
    p_filters: filters,
    p_page: safePage,
    p_page_size: safePageSize,
  }
  if (typeof sort === 'string' && sort.trim()) rpcArgs.p_sort = sort.trim()

  const { data, error } = await supabase
    .rpc('crm_fetch_seller_inbox', rpcArgs)

  if (error || !Array.isArray(data)) {
    console.warn('[seller-ops] fetch inbox failed', error)
    return { rows: [] }
  }

  const result = { rows: data as unknown as CrmSellerSummaryRow[] }
  cacheSet(cacheKey, result, 30_000)
  return result
}

export interface SellerProfileRow {
  id: string
  email: string | null
  full_name: string | null
  whatsapp_number: string | null
  verified: boolean | null
  created_at: string | null
  store_enabled: boolean | null
  store_name: string | null
  store_slug: string | null
  store_phone: string | null
  store_website: string | null
  city: string | null
  province: string | null
  bio: string | null
}

export interface ListingRow {
  id: string
  title: string | null
  status: string | null
  moderation_state: string | null
  created_at: string | null
  expires_at: string | null
  price: number | null
  price_currency: string | null
  slug: string | null
  // Engagement metrics
  views_30d?: number
  wa_clicks_30d?: number
  email_clicks_30d?: number
  total_contacts_30d?: number
}

export type OutreachChannel = 'whatsapp' | 'email'
export type OutreachStatus = 'queued' | 'sent' | 'failed' | 'replied' | 'stop'

export interface SellerOutreachRow {
  id: string
  seller_id: string
  listing_id: string | null
  channel: OutreachChannel
  template_key: string | null
  message_preview: string | null
  status: OutreachStatus
  created_by: string | null
  created_at: string
  sent_at: string | null
  meta: Record<string, unknown>
}

export type TaskStatus = 'open' | 'done' | 'snoozed'
export type TaskSource = 'manual' | 'automation'

export interface SellerTaskRow {
  id: string
  seller_id: string
  type: string
  priority: number
  due_at: string
  status: TaskStatus
  source: TaskSource
  payload: Record<string, unknown>
  created_at: string
}

export interface SellerNoteRow {
  id: string
  seller_id: string
  note: string
  created_by: string | null
  created_at: string
}

export interface SellerOpsDetails {
  sellerId: string
  summary: CrmSellerSummaryRow | null
  profile: SellerProfileRow | null
  listings: ListingRow[]
  outreach: SellerOutreachRow[]
  tasksOpen: SellerTaskRow[]
  notes: SellerNoteRow[]
}

async function fetchListingsWithEngagement(sellerId: string, supabase: any): Promise<ListingRow[]> {
  // Get listings
  const { data: listings, error } = await supabase
    .from('listings')
    .select('id,title,status,moderation_state,created_at,expires_at,price,price_currency,slug')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(50)
  
  if (error || !listings) return []
  
  // Get engagement metrics for these listings (last 30 days)
  const listingIds = listings.map((l: any) => l.id)
  
  if (listingIds.length === 0) return listings as ListingRow[]
  
  try {
    // Fetch events summary for these listings (last 30 days)
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    
    // Query events table (views and WA clicks)
    const { data: eventsData } = await supabase
      .from('events')
      .select('listing_id, type')
      .in('listing_id', listingIds)
      .gte('created_at', since)
    
    // Query contact_events table (email contacts)
    const { data: contactEventsData } = await supabase
      .from('contact_events')
      .select('listing_id, type')
      .in('listing_id', listingIds)
      .eq('type', 'email')
      .gte('created_at', since)
    
    // Aggregate metrics by listing
    const metrics: Record<string, { views: number; wa_clicks: number; email_clicks: number }> = {}
    
    // Process events (views and WA clicks)
    if (eventsData) {
      for (const event of eventsData) {
        if (!event.listing_id) continue
        if (!metrics[event.listing_id]) {
          metrics[event.listing_id] = { views: 0, wa_clicks: 0, email_clicks: 0 }
        }
        if (event.type === 'listing_view') {
          metrics[event.listing_id].views += 1
        } else if (event.type === 'wa_click') {
          metrics[event.listing_id].wa_clicks += 1
        }
      }
    }
    
    // Process contact_events (email clicks)
    if (contactEventsData) {
      for (const event of contactEventsData) {
        if (!event.listing_id) continue
        if (!metrics[event.listing_id]) {
          metrics[event.listing_id] = { views: 0, wa_clicks: 0, email_clicks: 0 }
        }
        metrics[event.listing_id].email_clicks += 1
      }
    }
    
    // Merge metrics with listings
    return listings.map((l: any) => ({
      ...l,
      views_30d: metrics[l.id]?.views || 0,
      wa_clicks_30d: metrics[l.id]?.wa_clicks || 0,
      email_clicks_30d: metrics[l.id]?.email_clicks || 0,
      total_contacts_30d: (metrics[l.id]?.wa_clicks || 0) + (metrics[l.id]?.email_clicks || 0),
    })) as ListingRow[]
  } catch (err) {
    console.warn('[seller-ops] failed to fetch engagement metrics', err)
    return listings as ListingRow[]
  }
}

export async function fetchSellerOpsDetails(sellerId: string): Promise<SellerOpsDetails> {
  if (!supabaseEnabled) {
    return { sellerId, summary: null, profile: null, listings: [], outreach: [], tasksOpen: [], notes: [] }
  }
  const supabase = getSupabaseClient()

  const [
    summaryResp,
    profileResp,
    listingsData,
    outreachResp,
    tasksResp,
    notesResp,
  ] = await Promise.all([
    supabase
      .from('crm_seller_summary')
      .select('*')
      .eq('seller_id', sellerId)
      .maybeSingle(),
    supabase
      .from('users')
      .select('id,email,full_name,whatsapp_number,verified,created_at,store_enabled,store_name,store_slug,store_phone,store_website,city,province,bio')
      .eq('id', sellerId)
      .maybeSingle(),
    fetchListingsWithEngagement(sellerId, supabase),
    supabase
      .from('seller_outreach')
      .select('id,seller_id,listing_id,channel,template_key,message_preview,status,created_by,created_at,sent_at,meta')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('seller_tasks')
      .select('id,seller_id,type,priority,due_at,status,source,payload,created_at')
      .eq('seller_id', sellerId)
      .eq('status', 'open')
      .order('due_at', { ascending: true })
      .limit(50),
    supabase
      .from('seller_notes')
      .select('id,seller_id,note,created_by,created_at')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const summary = summaryResp.error ? null : (summaryResp.data as unknown as CrmSellerSummaryRow | null)
  const profile = profileResp.error ? null : (profileResp.data as unknown as SellerProfileRow | null)

  return {
    sellerId,
    summary,
    profile,
    listings: Array.isArray(listingsData) ? listingsData : [],
    outreach: Array.isArray(outreachResp.data) ? (outreachResp.data as unknown as SellerOutreachRow[]) : [],
    tasksOpen: Array.isArray(tasksResp.data) ? (tasksResp.data as unknown as SellerTaskRow[]) : [],
    notes: Array.isArray(notesResp.data) ? (notesResp.data as unknown as SellerNoteRow[]) : [],
  }
}

function resolveApiBase(): string {
  const env = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  if (env) return env
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname
  if (host === 'ciclomarket.ar' || host === 'www.ciclomarket.ar') return 'https://ciclo-market.onrender.com'
  return ''
}

async function getAccessToken(): Promise<string | null> {
  if (!supabaseEnabled) return null
  const supabase = getSupabaseClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function sendSellerEmailTemplate(args: {
  sellerId: string
  templateKey: string
  listingId?: string | null
  context?: Record<string, unknown>
}): Promise<void> {
  const base = resolveApiBase()
  const url = `${base}/api/admin/actions/send-email-template`
  const token = await getAccessToken()
  if (!token) throw new Error('unauthorized')

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      seller_id: args.sellerId,
      template_key: args.templateKey,
      listing_id: args.listingId ?? null,
      context: args.context ?? {},
    }),
  })
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}))
    throw new Error(data?.error || 'send_email_failed')
  }
}

export async function setSellerStage(args: { sellerId: string; stage: SellerStage; priority?: number | null; ownerAdminUserId?: string | null }): Promise<void> {
  if (!supabaseEnabled) throw new Error('supabase_disabled')
  const supabase = getSupabaseClient()
  const payload = {
    seller_id: args.sellerId,
    stage: args.stage,
    priority: typeof args.priority === 'number' ? args.priority : 0,
    owner_admin_user_id: args.ownerAdminUserId ?? null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('seller_pipeline').upsert(payload, { onConflict: 'seller_id' })
  if (error) throw error
}

export async function createSellerTask(args: { sellerId: string; type: string; priority?: number; dueAt?: string; payload?: Record<string, unknown> }): Promise<void> {
  if (!supabaseEnabled) throw new Error('supabase_disabled')
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('seller_tasks').insert({
    seller_id: args.sellerId,
    type: args.type,
    priority: typeof args.priority === 'number' ? args.priority : 0,
    due_at: args.dueAt ?? new Date().toISOString(),
    status: 'open',
    source: 'manual',
    payload: args.payload ?? {},
  })
  if (error) throw error
}

export async function addSellerNote(args: { sellerId: string; note: string; createdBy?: string | null }): Promise<void> {
  if (!supabaseEnabled) throw new Error('supabase_disabled')
  const supabase = getSupabaseClient()
  const text = args.note.trim()
  if (!text) throw new Error('empty_note')
  const { error } = await supabase.from('seller_notes').insert({
    seller_id: args.sellerId,
    note: text,
    created_by: args.createdBy ?? null,
  })
  if (error) throw error
}

export async function logOutreachWhatsApp(args: {
  sellerId: string
  messagePreview: string
  createdBy?: string | null
  listingId?: string | null
  meta?: Record<string, unknown>
  cooldownDays?: number
}): Promise<void> {
  if (!supabaseEnabled) throw new Error('supabase_disabled')
  const supabase = getSupabaseClient()
  const text = args.messagePreview.trim()
  const { error } = await supabase.rpc('crm_log_whatsapp_outreach', {
    p_seller_id: args.sellerId,
    p_listing_id: args.listingId ?? null,
    p_message_preview: text,
    p_created_by: args.createdBy ?? null,
    p_meta: args.meta ?? {},
    p_cooldown_days: typeof args.cooldownDays === 'number' ? args.cooldownDays : 7,
  })
  if (error) throw error
}

/**
 * Create or update Kanban card for a seller
 * Called automatically when WhatsApp outreach happens
 */
export async function ensureKanbanCard(args: {
  sellerId: string
  sellerName: string
  whatsappNumber: string
  listingId?: string | null
  listingTitle?: string | null
  stage?: 'contacted' | 'responded' | 'sold_cm' | 'sold_elsewhere' | 'not_sold' | 'needs_help' | 'price_drop'
  priority?: 'urgent' | 'high' | 'medium' | 'low'
  notes?: string
  source?: 'whatsapp' | 'email' | 'manual' | 'automation'
}): Promise<void> {
  if (!supabaseEnabled) return
  if (!args.whatsappNumber) {
    console.warn('[kanban] no whatsapp number, skipping card creation')
    return
  }
  const supabase = getSupabaseClient()
  
  // Check if card already exists for this seller in contacted/responded stages
  const { data: existing } = await supabase
    .from('kanban_cards')
    .select('id, stage')
    .eq('seller_id', args.sellerId)
    .in('stage', ['contacted', 'responded'])
    .maybeSingle()
  
  if (existing?.id) {
    // Update last_contact_at if card exists
    await supabase
      .from('kanban_cards')
      .update({ last_contact_at: new Date().toISOString() })
      .eq('id', existing.id)
    return
  }
  
  // Create new card
  const { error } = await supabase.from('kanban_cards').insert({
    seller_id: args.sellerId,
    seller_name: args.sellerName,
    whatsapp_number: args.whatsappNumber,
    listing_id: args.listingId ?? null,
    listing_title: args.listingTitle ?? null,
    stage: args.stage ?? 'contacted',
    priority: args.priority ?? 'medium',
    notes: args.notes ?? 'Contactado vía WhatsApp desde CRM',
    source: args.source ?? 'whatsapp',
    created_at: new Date().toISOString(),
    last_contact_at: new Date().toISOString(),
    tags: ['whatsapp'],
  })
  
  if (error) {
    console.warn('[kanban] failed to create card:', error)
  }
}

export async function markSellerSale(args: {
  sellerId: string
  listingId?: string | null
  confirmed: boolean
  createdBy?: string | null
  source?: 'admin_manual' | 'seller_form'
}): Promise<void> {
  if (!supabaseEnabled) throw new Error('supabase_disabled')
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('seller_sale_confirmations').insert({
    seller_id: args.sellerId,
    listing_id: args.listingId ?? null,
    confirmed: args.confirmed,
    source: args.source ?? 'admin_manual',
    created_by: args.createdBy ?? null,
  })
  if (error) throw error
}

// Tags management
export const PREDEFINED_TAGS = [
  { key: 'hot_lead', label: '🔥 Hot Lead', color: '#ef4444' },
  { key: 'call_today', label: '📞 Llamar hoy', color: '#f59e0b' },
  { key: 'vip', label: '⭐ VIP', color: '#8b5cf6' },
  { key: 'needs_price_help', label: '💰 Ayuda con precio', color: '#10b981' },
  { key: 'photo_issues', label: '📸 Problemas fotos', color: '#6b7280' },
  { key: 'responsive', label: '💬 Responde rápido', color: '#3b82f6' },
  { key: 'unresponsive', label: '😴 No responde', color: '#9ca3af' },
  { key: 'renewal_risk', label: '⚠️ Riesgo renovación', color: '#dc2626' },
] as const

export type SellerTag = typeof PREDEFINED_TAGS[number]['key']

export async function fetchSellerTags(sellerId: string): Promise<string[]> {
  if (!supabaseEnabled) return []
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('seller_pipeline')
    .select('tags')
    .eq('seller_id', sellerId)
    .maybeSingle()
  
  if (error) {
    console.warn('[seller-tags] fetch failed', error)
    return []
  }
  return (data?.tags as string[]) || []
}

export async function addSellerTag(sellerId: string, tag: string): Promise<void> {
  if (!supabaseEnabled) throw new Error('supabase_disabled')
  const supabase = getSupabaseClient()
  
  // Get current tags
  const { data } = await supabase
    .from('seller_pipeline')
    .select('tags')
    .eq('seller_id', sellerId)
    .maybeSingle()
  
  const currentTags = (data?.tags as string[]) || []
  if (currentTags.includes(tag)) return // Already exists
  
  const { error } = await supabase
    .from('seller_pipeline')
    .upsert({
      seller_id: sellerId,
      tags: [...currentTags, tag],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'seller_id' })
  
  if (error) throw error
}

export async function removeSellerTag(sellerId: string, tag: string): Promise<void> {
  if (!supabaseEnabled) throw new Error('supabase_disabled')
  const supabase = getSupabaseClient()
  
  // Get current tags
  const { data } = await supabase
    .from('seller_pipeline')
    .select('tags')
    .eq('seller_id', sellerId)
    .maybeSingle()
  
  const currentTags = (data?.tags as string[]) || []
  const newTags = currentTags.filter(t => t !== tag)
  
  const { error } = await supabase
    .from('seller_pipeline')
    .upsert({
      seller_id: sellerId,
      tags: newTags,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'seller_id' })
  
  if (error) throw error
}

// Follow-ups (uses seller_tasks table with type=FOLLOWUP)
export interface FollowUpData {
  id?: string
  sellerId: string
  dueAt: string // ISO date
  type: 'whatsapp' | 'email' | 'call'
  note?: string
  createdBy?: string | null
}

export async function scheduleFollowUp(args: FollowUpData): Promise<void> {
  if (!supabaseEnabled) throw new Error('supabase_disabled')
  const supabase = getSupabaseClient()
  
  const { error } = await supabase.from('seller_tasks').insert({
    seller_id: args.sellerId,
    type: `FOLLOWUP_${args.type.toUpperCase()}`,
    due_at: args.dueAt,
    status: 'open',
    source: 'manual',
    priority: 1, // Higher priority for follow-ups
    payload: { 
      note: args.note || '',
      created_by: args.createdBy,
    },
  })
  
  if (error) throw error
}

export async function completeFollowUp(taskId: string): Promise<void> {
  if (!supabaseEnabled) throw new Error('supabase_disabled')
  const supabase = getSupabaseClient()
  
  const { error } = await supabase
    .from('seller_tasks')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', taskId)
  
  if (error) throw error
}

export async function snoozeFollowUp(taskId: string, hours: number): Promise<void> {
  if (!supabaseEnabled) throw new Error('supabase_disabled')
  const supabase = getSupabaseClient()
  
  const newDueAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
  
  const { error } = await supabase
    .from('seller_tasks')
    .update({ due_at: newDueAt, status: 'snoozed' })
    .eq('id', taskId)
  
  if (error) throw error
}

// Mark listing as sold
export async function markListingAsSold(listingId: string): Promise<void> {
  if (!supabaseEnabled) throw new Error('supabase_disabled')
  const supabase = getSupabaseClient()
  
  const { error } = await supabase
    .from('listings')
    .update({ 
      status: 'sold',
      updated_at: new Date().toISOString(),
      expires_at: new Date().toISOString(), // Expire immediately
    })
    .eq('id', listingId)
  
  if (error) throw error
}
