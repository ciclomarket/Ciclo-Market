import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { addLike, removeLike, fetchLikeCount, hasUserLike, fetchUserLikedIds } from '../services/likes'
import { supabaseEnabled } from '../services/supabase'

export function useListingLike(listingId: string, initialCount?: number) {
  const { user } = useAuth()
  const [liked, setLiked] = useState(false)
  const [count, setCount] = useState<number>(initialCount ?? 0)

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!listingId) return
      const [c, h] = await Promise.all([
        typeof initialCount === 'number' ? Promise.resolve(initialCount) : fetchLikeCount(listingId),
        user?.id ? hasUserLike(user.id, listingId) : Promise.resolve(false)
      ])
      if (!active) return
      setCount(c)
      setLiked(h)
    }
    if (supabaseEnabled) void load()
    else { setLiked(false); setCount(0) }
    return () => { active = false }
  }, [listingId, user?.id, initialCount])

  const toggle = async () => {
    if (!user?.id || !supabaseEnabled) return
    const optimisticLiked = !liked
    setLiked(optimisticLiked)
    setCount((c) => Math.max(0, c + (optimisticLiked ? 1 : -1)))
    const ok = optimisticLiked
      ? await addLike(user.id, listingId)
      : await removeLike(user.id, listingId)
    if (!ok) {
      // revert
      setLiked(!optimisticLiked)
      setCount((c) => Math.max(0, c + (optimisticLiked ? -1 : 1)))
    }
  }

  return { liked, count, toggle, canLike: Boolean(user?.id && supabaseEnabled) }
}

export function useLikedIds() {
  const { user } = useAuth()
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    let active = true
    const load = async () => {
      if (!user?.id || !supabaseEnabled) { setIds([]); return }
      const arr = await fetchUserLikedIds(user.id)
      if (active) setIds(arr)
    }
    void load()
    return () => { active = false }
  }, [user?.id])
  return ids
}
