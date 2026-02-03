import { useEffect, useState } from 'react'
import { getSupabaseClient, supabaseEnabled } from '../services/supabase'
import type { Listing } from '../types'

export type EnrichedListing = Listing & {
  planStatus?: 'FREE' | 'PREMIUM' | 'PRO'
  priorityActive?: boolean
  rankBoostUntil?: string | null
  photosTotal?: number
  photosVisible?: number
  canUpgrade?: boolean
}

export default function useMyListings() {
  const [items, setItems] = useState<EnrichedListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        if (!supabaseEnabled) { setItems([]); setLoading(false); return }
        const supabase = getSupabaseClient()
        const { data: session } = await supabase.auth.getSession()
        const uid = session.session?.user?.id
        if (!uid) { setItems([]); setLoading(false); return }
        const { data, error } = await supabase
          .from('listings_enriched')
          .select('*')
          .eq('seller_id', uid)
          .order('created_at', { ascending: false })
        if (error) throw error
        const rows = Array.isArray(data) ? data : []
        const mapped: EnrichedListing[] = rows.map((row: any) => ({
          id: row.id,
          slug: row.slug ?? undefined,
          title: row.title,
          brand: row.brand,
          model: row.model,
          category: row.category,
          price: row.price,
          priceCurrency: row.price_currency ?? undefined,
          originalPrice: row.original_price ?? undefined,
          location: row.location ?? '',
          description: row.description ?? '',
          images: row.images ?? [],
          sellerId: row.seller_id,
          status: row.status ?? undefined,
          createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
          grantedVisiblePhotos: row.granted_visible_photos ?? undefined,
          whatsappCapGranted: row.whatsapp_cap_granted ?? undefined,
          whatsappEnabled: row.whatsapp_enabled ?? undefined,
          // enriched
          planStatus: row.plan_status,
          priorityActive: Boolean(row.priority_active),
          rankBoostUntil: row.rank_boost_until,
          photosTotal: row.photos_total,
          photosVisible: row.photos_visible,
          canUpgrade: Boolean(row.can_upgrade),
        }))
        if (mounted) setItems(mapped)
      } catch (e: any) {
        if (mounted) setError(e?.message || 'fetch_failed')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  return { items, loading, error }
}
