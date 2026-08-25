import { getSupabaseClient, supabaseEnabled } from './supabase'

export type ProtectedChatMessage = {
  id: string
  threadId: string
  senderId: string
  senderRole: 'buyer' | 'seller' | 'admin'
  body: string
  createdAt: number
}

type ThreadRow = { id: string; status: string }
type MessageRow = {
  id: string
  thread_id: string
  sender_id: string
  sender_role: 'buyer' | 'seller' | 'admin'
  body: string
  created_at: string
}

function normalizeMessage(row: MessageRow): ProtectedChatMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    senderRole: row.sender_role,
    body: row.body,
    createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
  }
}

export async function getOrCreateThread(listingId: string, sellerId: string, buyerId: string): Promise<string | null> {
  if (!supabaseEnabled) return null
  const supabase = getSupabaseClient()

  const { data: existing } = await supabase
    .from('protected_chat_threads')
    .select('id,status')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyerId)
    .maybeSingle()

  if ((existing as ThreadRow | null)?.id) return (existing as ThreadRow).id

  const { data: created, error } = await supabase
    .from('protected_chat_threads')
    .insert({ listing_id: listingId, buyer_id: buyerId, seller_id: sellerId })
    .select('id')
    .maybeSingle()

  if (error) {
    console.warn('[protected-chat] create thread failed', error)
    return null
  }
  return created?.id || null
}

export type ProtectedChatThreadSummary = { id: string; buyerId: string; updatedAt: number }

export async function fetchThreadsForListing(listingId: string): Promise<ProtectedChatThreadSummary[]> {
  if (!supabaseEnabled || !listingId) return []
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('protected_chat_threads')
    .select('id, buyer_id, updated_at')
    .eq('listing_id', listingId)
    .order('updated_at', { ascending: false })
  if (error || !data) return []
  return (data as Array<{ id: string; buyer_id: string; updated_at: string }>).map((r) => ({
    id: r.id,
    buyerId: r.buyer_id,
    updatedAt: r.updated_at ? Date.parse(r.updated_at) : Date.now(),
  }))
}

export async function fetchMessages(threadId: string): Promise<ProtectedChatMessage[]> {
  if (!supabaseEnabled || !threadId) return []
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('protected_chat_messages')
    .select('id, thread_id, sender_id, sender_role, body, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return (data as MessageRow[]).map(normalizeMessage)
}

export async function sendMessage(
  threadId: string,
  senderId: string,
  senderRole: 'buyer' | 'seller',
  body: string
): Promise<ProtectedChatMessage | null> {
  if (!supabaseEnabled) return null
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('protected_chat_messages')
    .insert({ thread_id: threadId, sender_id: senderId, sender_role: senderRole, body: body.trim() })
    .select('id, thread_id, sender_id, sender_role, body, created_at')
    .maybeSingle()
  if (error) {
    console.warn('[protected-chat] send failed', error)
    throw error
  }
  await supabase.from('protected_chat_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId)
  return data ? normalizeMessage(data as MessageRow) : null
}
