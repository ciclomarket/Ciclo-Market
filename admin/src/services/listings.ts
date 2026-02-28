import { getSupabaseClient, supabaseEnabled } from '@app/services/supabase'

export interface AdminListingRow {
  id: string
  title: string
  category: string | null
  price: number | null
  priceCurrency: string | null
  status: string | null
  sellerId: string | null
  sellerName: string | null
  sellerEmail: string | null
  sellerPlan: string | null
  description: string | null
  imagesCount: number
  createdAt: string | null
  expiresAt: string | null
  views7d: number
  views30d: number
  views90d: number
  contactsTotal7d: number
  contactsTotal30d: number
  waContacts7d: number
  waContacts30d: number
  emailContacts7d: number
  emailContacts30d: number
  chatContacts7d: number
  chatContacts30d: number
  lastContactAt: string | null
}

export interface FetchAdminListingsParams {
  status?: string
  limit?: number
  plan?: string
  sellerId?: string
  createdFrom?: string
  createdTo?: string
}

export async function fetchAdminListings(params: FetchAdminListingsParams = {}): Promise<AdminListingRow[]> {
  if (!supabaseEnabled) return []

  const { status, limit = 80, plan, sellerId, createdFrom, createdTo } = params
  const supabase = getSupabaseClient()
  let query = supabase
    .from('listings')
    .select('id, title, category, price, price_currency, status, seller_id, seller_name, seller_email, seller_plan, plan, plan_code, description, images, created_at, expires_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }
  if (plan && plan !== 'all') {
    const clean = plan.trim().toLowerCase()
    if (clean) {
      query = query.or(`plan.eq.${clean},plan_code.eq.${clean},seller_plan.eq.${clean}`)
    }
  }
  if (sellerId) {
    query = query.eq('seller_id', sellerId)
  }
  if (createdFrom) {
    query = query.gte('created_at', createdFrom)
  }
  if (createdTo) {
    query = query.lte('created_at', createdTo)
  }

  const { data, error } = await query
  if (error || !Array.isArray(data)) {
    console.warn('[admin-listings] fetch failed', error)
    return []
  }

  const rows: AdminListingRow[] = data.map((row) => {
    const record = row as Record<string, unknown>
    const rawImages = record.images
    const imagesCount = Array.isArray(rawImages) ? rawImages.length : 0
    const rawPrice = record.price
    const price = typeof rawPrice === 'number' ? rawPrice : (typeof rawPrice === 'string' ? Number(rawPrice) : null)

    return {
      id: String(record.id ?? ''),
      title: String(record.title ?? 'Sin título'),
      category: typeof record.category === 'string' ? record.category : null,
      price: Number.isFinite(price ?? NaN) ? (price as number) : null,
      priceCurrency: typeof record.price_currency === 'string' ? record.price_currency : null,
      status: typeof record.status === 'string' ? record.status : null,
      sellerId: typeof record.seller_id === 'string' ? record.seller_id : null,
      sellerName: typeof record.seller_name === 'string' ? record.seller_name : null,
      sellerEmail: typeof record.seller_email === 'string' ? record.seller_email : null,
      sellerPlan: typeof record.seller_plan === 'string'
        ? record.seller_plan
        : (typeof record.plan === 'string' ? record.plan : (typeof record.plan_code === 'string' ? record.plan_code : null)),
      description: typeof record.description === 'string' ? record.description : null,
      imagesCount,
      createdAt: typeof record.created_at === 'string' ? record.created_at : null,
      expiresAt: typeof record.expires_at === 'string' ? record.expires_at : null,
      views7d: 0,
      views30d: 0,
      views90d: 0,
      contactsTotal7d: 0,
      contactsTotal30d: 0,
      waContacts7d: 0,
      waContacts30d: 0,
      emailContacts7d: 0,
      emailContacts30d: 0,
      chatContacts7d: 0,
      chatContacts30d: 0,
      lastContactAt: null,
    }
  })

  if (!rows.length) return rows

  // Fill seller identity from public.users when listings has missing denormalized fields.
  // This avoids showing "Sin nombre" when seller_name/email wasn't populated on listing creation.
  try {
    const sellerIds = Array.from(new Set(rows.map((r) => r.sellerId).filter((id): id is string => Boolean(id))))
    const missingSellerIds = sellerIds.filter((id) => rows.some((r) => r.sellerId === id && (!r.sellerName || !r.sellerEmail)))
    if (missingSellerIds.length) {
      const usersQuery = await supabase
        .from('users')
        .select('id, full_name, store_name, email')
        .in('id', missingSellerIds)
      if (!usersQuery.error && Array.isArray(usersQuery.data)) {
        const userMap = new Map<string, { fullName: string | null; storeName: string | null; email: string | null }>()
        for (const entry of usersQuery.data as Record<string, unknown>[]) {
          const id = typeof entry.id === 'string' ? entry.id : null
          if (!id) continue
          userMap.set(id, {
            fullName: typeof entry.full_name === 'string' ? entry.full_name : null,
            storeName: typeof entry.store_name === 'string' ? entry.store_name : null,
            email: typeof entry.email === 'string' ? entry.email : null,
          })
        }
        for (const row of rows) {
          if (!row.sellerId) continue
          const user = userMap.get(row.sellerId)
          if (!user) continue
          if (!row.sellerEmail && user.email) row.sellerEmail = user.email
          if (!row.sellerName) {
            row.sellerName = user.fullName
              ?? user.storeName
              ?? (user.email ? user.email.split('@')[0] : null)
              ?? row.sellerId
          }
        }
      }
    }
  } catch (err) {
    console.warn('[admin-listings] seller identity hydration failed', err)
  }

  let mergedRows = rows

  try {
    const metricsQuery = await supabase
      .from('admin_listing_engagement_summary')
      .select('listing_id, views_7d, views_30d, views_90d, wa_clicks_7d, wa_clicks_30d, wa_clicks_90d')
      .in('listing_id', rows.map((r) => r.id))
    if (!metricsQuery.error && Array.isArray(metricsQuery.data)) {
      const metricsMap = new Map<string, Record<string, unknown>>()
      for (const entry of metricsQuery.data as Record<string, unknown>[]) {
        metricsMap.set(String(entry.listing_id), entry)
      }
      mergedRows = mergedRows.map((row) => {
        const metrics = metricsMap.get(row.id)
        if (!metrics) return row
        return {
          ...row,
          views7d: Number(metrics.views_7d ?? 0),
          views30d: Number(metrics.views_30d ?? 0),
          views90d: Number(metrics.views_90d ?? 0),
        }
      })
    }
  } catch (err) {
    console.warn('[admin-listings] engagement metrics failed', err)
  }

  try {
    const contactQuery = await supabase
      .from('admin_listing_contact_summary')
      .select([
        'listing_id',
        'last_contact_at',
        'contacts_total_7d',
        'contacts_total_30d',
        'wa_contacts_7d',
        'wa_contacts_30d',
        'email_contacts_7d',
        'email_contacts_30d',
        'chat_contacts_7d',
        'chat_contacts_30d',
      ].join(','))
      .in('listing_id', rows.map((r) => r.id))
    if (!contactQuery.error && Array.isArray(contactQuery.data)) {
      const contactMap = new Map<string, Record<string, unknown>>()
      for (const entry of contactQuery.data as Record<string, unknown>[]) {
        contactMap.set(String(entry.listing_id), entry)
      }
      mergedRows = mergedRows.map((row) => {
        const contacts = contactMap.get(row.id)
        if (!contacts) return row
        return {
          ...row,
          lastContactAt: typeof contacts.last_contact_at === 'string' ? contacts.last_contact_at : null,
          contactsTotal7d: Number(contacts.contacts_total_7d ?? 0),
          contactsTotal30d: Number(contacts.contacts_total_30d ?? 0),
          waContacts7d: Number(contacts.wa_contacts_7d ?? 0),
          waContacts30d: Number(contacts.wa_contacts_30d ?? 0),
          emailContacts7d: Number(contacts.email_contacts_7d ?? 0),
          emailContacts30d: Number(contacts.email_contacts_30d ?? 0),
          chatContacts7d: Number(contacts.chat_contacts_7d ?? 0),
          chatContacts30d: Number(contacts.chat_contacts_30d ?? 0),
        }
      })
    }
  } catch (err) {
    console.warn('[admin-listings] contact metrics failed', err)
  }

  return mergedRows
}
