import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useAuth } from './AuthContext'
import { createChatThread, fetchChatMessages, fetchChatThreads, markThreadRead, sendChatMessage, type ChatMessage, type ChatThread } from '../services/chat'
import { supabaseEnabled, getSupabaseClient } from '../services/supabase'

interface ChatContextValue {
  threads: ChatThread[]
  loadingThreads: boolean
  activeThreadId: string | null
  selectThread: (id: string | null) => void
  messages: ChatMessage[]
  loadingMessages: boolean
  sendMessage: (body: string) => Promise<void>
  createThread: (listingId: string, sellerId: string) => Promise<string | null>
  refreshThreads: () => Promise<void>
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const subscriptionRef = useRef<RealtimeChannel | null>(null)

  const refreshThreads = useCallback(async () => {
    if (!supabaseEnabled || !user?.id) {
      setThreads([])
      setLoadingThreads(false)
      return
    }
    setLoadingThreads(true)
    const data = await fetchChatThreads(user.id)
    setThreads(data)
    setLoadingThreads(false)
    if (data.length > 0 && !activeThreadId) {
      setActiveThreadId(data[0].id)
    }
  }, [user?.id, activeThreadId])

  const loadMessages = useCallback(async (threadId: string | null) => {
    if (!threadId || !supabaseEnabled) {
      setMessages([])
      return
    }
    setLoadingMessages(true)
    const list = await fetchChatMessages(threadId)
    setMessages(list)
    setLoadingMessages(false)
    await markThreadRead(threadId)
  }, [])

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

  useEffect(() => {
    void loadMessages(activeThreadId)

    if (!supabaseEnabled || !activeThreadId) {
      if (subscriptionRef.current) {
        const supabase = getSupabaseClient()
        void supabase.removeChannel(subscriptionRef.current)
        subscriptionRef.current = null
      }
      return
    }

    const supabase = getSupabaseClient()
    if (subscriptionRef.current) {
      void supabase.removeChannel(subscriptionRef.current)
    }

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
                setMessages((prev) => [...prev, newMessage])
                void markThreadRead(activeThreadId)
              }
              break
            case 'UPDATE':
              if (newMessage) {
                setMessages((prev) => prev.map((msg) => (msg.id === newMessage.id ? { ...msg, ...newMessage } : msg)))
              }
              break
            case 'DELETE':
              if (payload.old) {
                const oldId = (payload.old as ChatMessage).id
                setMessages((prev) => prev.filter((msg) => msg.id !== oldId))
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
  }, [activeThreadId])

  const selectThread = useCallback((id: string | null) => {
    setActiveThreadId(id)
  }, [])

  const sendMessage = useCallback(async (body: string) => {
    if (!activeThreadId || !body.trim()) return
    const trimmed = body.trim()
    const newMessage = await sendChatMessage(activeThreadId, trimmed)
    if (newMessage) {
      setMessages((prev) => [...prev, newMessage])
      void refreshThreads()
    }
  }, [activeThreadId, refreshThreads])

  const createThread = useCallback(async (listingId: string, sellerId: string) => {
    try {
      const thread = await createChatThread(listingId, sellerId)
      await refreshThreads()
      setActiveThreadId(thread.id)
      return thread.id
    } catch (err) {
      console.warn('[chat] createThread failed', err)
      return null
    }
  }, [refreshThreads])

  const value = useMemo<ChatContextValue>(() => ({
    threads,
    loadingThreads,
    activeThreadId,
    selectThread,
    messages,
    loadingMessages,
    sendMessage,
    createThread,
    refreshThreads
  }), [threads, loadingThreads, activeThreadId, messages, loadingMessages, selectThread, sendMessage, createThread, refreshThreads])

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat debe usarse dentro de ChatProvider')
  return ctx
}
