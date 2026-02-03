import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabaseEnabled, getSupabaseClient } from '../services/supabase'
import { useAuth } from './AuthContext'
import type { PostgrestSingleResponse } from '@supabase/supabase-js'

export interface NotificationRecord {
  id: string
  user_id: string | null
  type: 'marketing' | 'question' | 'offer' | 'system'
  title: string
  body: string
  metadata?: Record<string, unknown> | null
  cta_url?: string | null
  read_at?: string | null
  created_at: string
}

interface NotificationContextValue {
  notifications: NotificationRecord[]
  loading: boolean
  unreadCount: number
  refresh: () => Promise<void>
  markAsRead: (ids: string[] | string) => Promise<void>
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined)

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    if (!supabaseEnabled || !user) {
      setNotifications([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const supabase = getSupabaseClient()
      const { data, error }: PostgrestSingleResponse<NotificationRecord[]> = await supabase
        .from('notifications')
        .select('*')
        .or('user_id.is.null,user_id.eq.' + user.id)
        .order('created_at', { ascending: false })
      if (error) {
        console.warn('[notifications] fetch error', error)
        setNotifications([])
        setLoading(false)
        return
      }
      setNotifications(data ?? [])
    } catch (err) {
      console.warn('[notifications] fetch failed', err)
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (ids: string[] | string) => {
    const list = Array.isArray(ids) ? ids : [ids]
    if (!list.length) return
    if (!supabaseEnabled) return
    try {
      const supabase = getSupabaseClient()
      await supabase.rpc('mark_notifications_read', { p_ids: list })
      setNotifications((prev) =>
        prev.map((item) => (list.includes(item.id) ? { ...item, read_at: new Date().toISOString() } : item))
      )
    } catch (err) {
      console.warn('[notifications] markAsRead failed', err)
    }
  }

  useEffect(() => {
    if (!user || !supabaseEnabled) {
      setNotifications([])
      setLoading(false)
      return
    }

    void refresh()

    const supabase = getSupabaseClient()
    const pollRef = { id: null as number | null }
    const channel = supabase
      .channel('notifications-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        (payload) => {
          const newRecord = payload.new as NotificationRecord | null
          const oldRecord = payload.old as NotificationRecord | null
          setNotifications((prev) => {
            switch (payload.eventType) {
              case 'INSERT':
                return newRecord ? [newRecord, ...prev] : prev
              case 'UPDATE':
                return newRecord
                  ? prev.map((item) => (item.id === newRecord.id ? { ...item, ...newRecord } : item))
                  : prev
              case 'DELETE':
                return oldRecord ? prev.filter((item) => item.id !== oldRecord.id) : prev
              default:
                return prev
            }
          })
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (pollRef.id) {
            window.clearInterval(pollRef.id)
            pollRef.id = null
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Fallback a polling si Realtime no conecta
          console.warn('[notifications] realtime subscribe failed:', status)
          if (!pollRef.id) {
            pollRef.id = window.setInterval(() => { void refresh() }, 15000)
          }
        }
      })

    return () => {
      void supabase.removeChannel(channel)
      if (pollRef.id) window.clearInterval(pollRef.id)
    }
  }, [user])

  const unreadCount = useMemo(() => notifications.filter((item) => !item.read_at).length, [notifications])

  return (
    <NotificationContext.Provider value={{ notifications, loading, unreadCount, refresh, markAsRead }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications debe usarse dentro de NotificationsProvider')
  return ctx
}
