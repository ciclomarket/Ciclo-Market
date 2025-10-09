import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useAuth } from './AuthContext'
import {
  createChatThread,
  fetchChatMessages,
  fetchChatThreads,
  markThreadRead,
  sendChatMessage,
  type ChatMessage,
  type ChatThread,
} from '../services/chat'
import { supabaseEnabled, getSupabaseClient } from '../services/supabase'

interface ChatContextValue {
  threads: ChatThread[]
  loadingThreads: boolean
  activeThreadId: string | null
  selectThread: (id: string | null) => void
  messages: ChatMessage[]
  loadingMessages: boolean
  loadingOlderMessages: boolean
  hasMoreMessages: boolean
  loadOlderMessages: () => Promise<void>
  sendMessage: (body: string) => Promise<void>
  createThread: (listingId: string, sellerId: string) => Promise<string | null>
  refreshThreads: () => Promise<void>
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined)

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  const [threads, setThreads] = useState<ChatThread[]>([])
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)

  const subscriptionRef = useRef<RealtimeChannel | null>(null)
  const oldestMessageRef = useRef<string | null>(null)
  const latestMessageRef = useRef<string | null>(null)

  const MESSAGE_PAGE_SIZE = 50
  const LIVE_PRUNE_PAGES = 3 // ventana máxima en memoria

  const refreshThreads = useCallback(async () => {
    if (!supabaseEnabled || !user?.id) {
      setThreads([])
      setLoadingThreads(false)
      setActiveThreadId(null)
      return
    }

    setLoadingThreads(true)
    const data = await fetchChatThreads(user.id)
    setThreads(data)
    setLoadingThreads(false)

    if (data.length === 0) {
      setActiveThreadId(null)
      return
    }

    setActiveThreadId((current) => {
      if (current && data.some((t) => t.id === current)) return current
      return data[0]?.id ?? null
    })
  }, [user?.id])

  const loadMessages = useCallback(
    async (threadId: string | null) => {
      if (!threadId || !supabaseEnabled) {
        setMessages([])
        setHasMoreMessages(false)
        oldestMessageRef.current = null
        latestMessageRef.current = null
        return
      }

      if (!threads.some((t) => t.id === threadId)) {
        setMessages([])
        setHasMoreMessages(false)
        oldestMessageRef.current = null
        latestMessageRef.current = null
        setActiveThreadId((current) => (current === threadId ? null : current))
        return
      }

      setLoadingMessages(true)
      try {
        const list = await fetchChatMessages(threadId, { limit: MESSAGE_PAGE_SIZE })
        setMessages(list)
        oldestMessageRef.current = list[0]?.created_at ?? null
        latestMessageRef.current = list[list.length - 1]?.created_at ?? null
        setHasMoreMessages(list.length === MESSAGE_PAGE_SIZE)
        await markThreadRead(threadId)
      } finally {
        setLoadingMessages(false)
      }
    },
    [threads]
  )

  // Reset al cambiar de usuario y primera carga
  useEffect(() => {
    if (!user || !supabaseEnabled) {
      setThreads([])
      setMessages([])
      setActiveThreadId(null)
      setLoadingThreads(false)
      setLoadingMessages(false)
      return
    }
    void refreshThreads()
  }, [user?.id, refreshThreads])

  // Cargar mensajes del hilo activo + suscripción realtime
  useEffect(() => {
    void loadMessages(activeThreadId)

    const supabase = getSupabaseClient()

    // Limpia canal previo
    if (subscriptionRef.current) {
      void supabase.removeChannel(subscriptionRef.current)
      subscriptionRef.current = null
    }
    if (!supabaseEnabled || !activeThreadId) return

    const channel = supabase
      .channel(`chat-thread-${activeThreadId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${activeThreadId}` },
        (payload) => {
          const newMessage = payload.new as ChatMessage | null

          switch (payload.eventType) {
            case 'INSERT':
              if (newMessage) {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === newMessage.id)) return prev
                  const next = [...prev, newMessage]

                  latestMessageRef.current = newMessage.created_at ?? latestMessageRef.current

                  // prune en vivo para no crecer infinito
                  if (next.length > MESSAGE_PAGE_SIZE * LIVE_PRUNE_PAGES) {
                    const cutoffIdx = next.length - MESSAGE_PAGE_SIZE * LIVE_PRUNE_PAGES
                    return next.slice(cutoffIdx) // recorta los más viejos
                  }
                  return next
                })
                void markThreadRead(activeThreadId)
              }
              break
            case 'UPDATE':
              if (newMessage) {
                setMessages((prev) => prev.map((m) => (m.id === newMessage.id ? { ...m, ...newMessage } : m)))
              }
              break
            case 'DELETE':
              if (payload.old) {
                const oldId = (payload.old as ChatMessage).id
                setMessages((prev) => prev.filter((m) => m.id !== oldId))
              }
              break
            default:
              break
          }
        }
      )
      .subscribe()

    subscriptionRef.current = channel

    return () => {
      void supabase.removeChannel(channel)
      subscriptionRef.current = null
    }
  }, [activeThreadId, loadMessages])

  const selectThread = useCallback(
    (id: string | null) => {
      if (id && !threads.some((t) => t.id === id)) return
      setActiveThreadId(id)
      oldestMessageRef.current = null
      setHasMoreMessages(false)
    },
    [threads]
  )

  const sendMessage = useCallback(
    async (body: string) => {
      if (!activeThreadId || !body.trim()) return
      const trimmed = body.trim()
      const newMessage = await sendChatMessage(activeThreadId, trimmed)
      if (newMessage) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMessage.id)) return prev
          const next = [...prev, newMessage]
          if (next.length > MESSAGE_PAGE_SIZE * LIVE_PRUNE_PAGES) {
            const cutoffIdx = next.length - MESSAGE_PAGE_SIZE * LIVE_PRUNE_PAGES
            return next.slice(cutoffIdx)
          }
          return next
        })
        latestMessageRef.current = newMessage.created_at ?? latestMessageRef.current
        void refreshThreads()
      }
    },
    [activeThreadId, refreshThreads]
  )

  const loadOlderMessages = useCallback(
    async () => {
      if (!supabaseEnabled || !activeThreadId) return
      if (loadingOlderMessages || !hasMoreMessages || !oldestMessageRef.current) return

      setLoadingOlderMessages(true)
      try {
        const older = await fetchChatMessages(activeThreadId, {
          before: oldestMessageRef.current,
          limit: MESSAGE_PAGE_SIZE,
        })

        if (older.length > 0) {
          oldestMessageRef.current = older[0]?.created_at ?? oldestMessageRef.current
          setMessages((prev) => {
            const existing = new Set(prev.map((m) => m.id))
            const merged = [...older.filter((m) => !existing.has(m.id)), ...prev]
            return merged
          })
        }

        setHasMoreMessages(older.length === MESSAGE_PAGE_SIZE)
      } finally {
        setLoadingOlderMessages(false)
      }
    },
    [activeThreadId, hasMoreMessages, loadingOlderMessages]
  )

  const createThread = useCallback(
    async (listingId: string, sellerId: string) => {
      try {
        const thread = await createChatThread(listingId, sellerId)
        await refreshThreads()
        setActiveThreadId(thread.id)
        return thread.id
      } catch (err) {
        console.warn('[chat] createThread failed', err)
        return null
      }
    },
    [refreshThreads]
  )

  const value = useMemo<ChatContextValue>(
    () => ({
      threads,
      loadingThreads,
      activeThreadId,
      selectThread,
      messages,
      loadingMessages,
      loadingOlderMessages,
      hasMoreMessages,
      loadOlderMessages,
      sendMessage,
      createThread,
      refreshThreads,
    }),
    [
      threads,
      loadingThreads,
      activeThreadId,
      messages,
      loadingMessages,
      loadingOlderMessages,
      hasMoreMessages,
      selectThread,
      loadOlderMessages,
      sendMessage,
      createThread,
      refreshThreads,
    ]
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat debe usarse dentro de ChatProvider')
  return ctx
}