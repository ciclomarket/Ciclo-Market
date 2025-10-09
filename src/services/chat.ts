import { getSupabaseClient, supabaseEnabled } from './supabase'

export interface ChatThread {
  id: string
  listing_id: string | null
  seller_id: string
  buyer_id: string
  status: 'open' | 'archived' | 'blocked'
  last_message_at: string
  created_at: string
  updated_at: string
  listing_title?: string | null
  listing_price?: number | null
  listing_currency?: 'USD' | 'ARS' | null
  listing_slug?: string | null
  seller_full_name?: string | null
  buyer_full_name?: string | null
  otherParticipantId: string
  otherParticipantName: string
  unreadCount: number
  lastMessageSnippet?: string | null
  lastMessageAuthorId?: string
  lastMessageCreatedAt?: string
}

export interface ChatMessage {
  id: string
  thread_id: string
  author_id: string
  body: string
  read_at?: string | null
  created_at: string
  edited_at?: string | null
}

type RawThread = {
  id: string
  listing_id: string | null
  seller_id: string
  buyer_id: string
  status: 'open' | 'archived' | 'blocked'
  last_message_at: string
  created_at: string
  updated_at: string
  listing_title?: string | null
  listing_price?: number | null
  listing_currency?: 'USD' | 'ARS' | null
  listing_slug?: string | null
  seller_full_name?: string | null
  buyer_full_name?: string | null
}

export async function fetchChatThreads(currentUserId: string): Promise<ChatThread[]> {
  if (!supabaseEnabled) return []
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('v_chat_threads')
    .select('*')
    .or(`seller_id.eq.${currentUserId},buyer_id.eq.${currentUserId}`)
    .order('last_message_at', { ascending: false })
  if (error) {
    console.warn('[chat] fetch threads error', error)
    return []
  }

  const rawThreads = (data ?? []) as RawThread[]
  const ownThreads = rawThreads.filter(
    (thread) => thread.seller_id === currentUserId || thread.buyer_id === currentUserId
  )

  const enriched = await Promise.all(
    ownThreads.map(async (thread) => {
      const otherParticipantId = currentUserId === thread.seller_id ? thread.buyer_id : thread.seller_id
      const otherParticipantName = currentUserId === thread.seller_id
        ? thread.buyer_full_name ?? 'Comprador'
        : thread.seller_full_name ?? 'Vendedor'

      let lastMessageSnippet: string | null = null
      let lastMessageAuthorId: string | undefined
      let lastMessageCreatedAt: string | undefined
      let unreadCount = 0

      const { data: lastMessage } = await supabase
        .from('chat_messages')
        .select('id, author_id, body, created_at')
        .eq('thread_id', thread.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastMessage) {
        lastMessageSnippet = lastMessage.body ?? null
        lastMessageAuthorId = lastMessage.author_id ?? undefined
        lastMessageCreatedAt = lastMessage.created_at ?? undefined
      }

      const { count } = await supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('thread_id', thread.id)
        .is('read_at', null)
        .neq('author_id', currentUserId)

      unreadCount = typeof count === 'number' ? count : 0

      return {
        ...thread,
        otherParticipantId,
        otherParticipantName,
        unreadCount,
        lastMessageSnippet,
        lastMessageAuthorId,
        lastMessageCreatedAt
      } satisfies ChatThread
    })
  )

  return enriched
}

export async function fetchChatMessages(threadId: string, options?: { before?: string; limit?: number }): Promise<ChatMessage[]> {
  if (!supabaseEnabled) return []
  const supabase = getSupabaseClient()
  let query = supabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(options?.limit ?? 50)
  if (options?.before) {
    query = query.lt('created_at', options.before)
  }
  const { data, error } = await query
  if (error) {
    console.warn('[chat] fetch messages error', error)
    return []
  }
  const list = (data ?? []) as ChatMessage[]
  return list.reverse()
}

export async function createChatThread(listingId: string, sellerId: string) {
  if (!supabaseEnabled) throw new Error('Supabase no habilitado')
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('create_chat_thread', {
    p_listing_id: listingId,
    p_seller_id: sellerId
  })
  if (error) throw error
  return data as ChatThread
}

export async function sendChatMessage(threadId: string, body: string) {
  if (!supabaseEnabled) throw new Error('Supabase no habilitado')
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('send_chat_message', {
    p_thread_id: threadId,
    p_body: body
  })
  if (error) throw error
  const message = data as ChatMessage

  void (async () => {
    try {
      const { data: userData } = await supabase.auth.getUser()
      const me = userData?.user?.id
      if (!me) return

      const { data: thread, error: threadError } = await supabase
        .from('chat_threads')
        .select('seller_id,buyer_id')
        .eq('id', threadId)
        .maybeSingle()

      if (threadError || !thread) return

      const toUserId = thread.seller_id === me ? thread.buyer_id : thread.seller_id
      if (!toUserId || toUserId === me) return

      const { error: notificationError } = await supabase.from('notifications').insert({
        user_id: toUserId,
        type: 'chat_message',
        title: 'Nuevo mensaje',
        body: body.slice(0, 120),
        metadata: { conversation_id: threadId, message_id: message?.id },
        cta_url: `/chat/${threadId}`
      })

      if (notificationError) {
        console.warn('[chat] notification insert failed', notificationError)
      }
    } catch (notifyError) {
      console.warn('[chat] send notification failed', notifyError)
    }
  })()

  return message
}

export async function markThreadRead(threadId: string) {
  if (!supabaseEnabled) return
  const supabase = getSupabaseClient()
  await supabase.rpc('mark_thread_read', { p_thread_id: threadId })
}
