import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Container from '../components/Container'
import Button from '../components/Button'
import ListingCard from '../components/ListingCard'
import { mockListings } from '../mock/mockData'
import { useAuth } from '../context/AuthContext'
import { getSupabaseClient, supabaseEnabled } from '../services/supabase'
import { archiveListing, fetchListingsBySeller, reduceListingPrice, fetchListingsByIds, updateListingStatus, deleteListing, upgradeListingPlan } from '../services/listings'
import { FALLBACK_PLANS } from '../services/plans'
import { fetchStoreSummary30d, fetchStoreListingSummary30d } from '../services/storeAnalytics'
import { fetchUserProfile, type UserProfileRecord, upsertUserProfile } from '../services/users'
import type { Listing } from '../types'
import { usePlans } from '../context/PlanContext'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { fetchPendingShareBoosts, reviewShareBoost } from '../services/shareBoost'
import { fetchSellerReviews, type ReviewsSummary } from '../services/reviews'
import { uploadAvatar, uploadStoreBanner, uploadStoreAvatar } from '../services/storage'
import { PROVINCES, OTHER_CITY_OPTION } from '../constants/locations'
import { BIKE_CATEGORIES } from '../constants/catalog'
import { deriveProfileSlug, pickDiscipline } from '../utils/user'
import { loadGoogleMaps } from '../utils/googleMaps'
import { normaliseWhatsapp, extractLocalWhatsapp, sanitizeLocalWhatsappInput } from '../utils/whatsapp'
import { useNotifications } from '../context/NotificationContext'
import { useToast } from '../context/ToastContext'
import useFaves from '../hooks/useFaves'
import { useLikedIds } from '../hooks/useServerLikes'
import useUpload from '../hooks/useUpload'
import { createGift, claimGift } from '../services/gifts'
import { fetchCreditsHistory, type Credit } from '../services/credits'
import { trackMetaPixel } from '../lib/metaPixel'
import { canonicalPlanCode } from '../utils/planCodes'
import AdminFxPanel from '../components/AdminFxPanel'

const TABS = ['Perfil', 'Publicaciones', 'Créditos', 'Favoritos', 'Notificaciones', 'Editar perfil', 'Editar tienda', 'Analítica', 'Verificá tu perfil', 'Cerrar sesión'] as const
type SellerTab = (typeof TABS)[number]

const TAB_METADATA: Record<SellerTab, { title: string; description: string }> = {
  Perfil: {
    title: 'Tu perfil',
    description: 'Revisá reputación y datos públicos',
  },
  Publicaciones: {
    title: 'Publicaciones',
    description: 'Administrá avisos activos y archivados',
  },
  Favoritos: {
    title: 'Favoritos',
    description: 'Tus bicicletas guardadas para seguirlas de cerca',
  },
  Notificaciones: {
    title: 'Notificaciones',
    description: 'Leé alertas y pendientes importantes',
  },
  Créditos: {
    title: 'Mis créditos',
    description: 'Disponibles e historial de canjes',
  },
  'Editar perfil': {
    title: 'Editar perfil',
    description: 'Actualizá tus datos, redes y WhatsApp',
  },
  'Editar tienda': {
    title: 'Editar tienda',
    description: 'Actualizá el banner, nombre, dirección y redes de tu tienda',
  },
  'Verificá tu perfil': {
    title: 'Verificá tu perfil',
    description: 'Confirmá identidad para mejorar la confianza',
  },
  'Analítica': {
    title: 'Analítica',
    description: 'Vistas, clics a WhatsApp y ranking de avisos',
  },
  'Cerrar sesión': {
    title: 'Cerrar sesión',
    description: 'Desconectate de forma segura',
  },
}

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' })

function useIsMobile(maxWidth = 768) {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < maxWidth : false
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(`(max-width: ${maxWidth - 1}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [maxWidth])

  return isMobile
}

function relativeTimeFromNow(value: string): string {
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return ''
  const diffMs = target.getTime() - Date.now()
  const abs = Math.abs(diffMs)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day

  let unit: Intl.RelativeTimeFormatUnit = 'minute'
  let amount = diffMs / minute

  if (abs >= week) {
    unit = 'week'
    amount = diffMs / week
  } else if (abs >= day) {
    unit = 'day'
    amount = diffMs / day
  } else if (abs >= hour) {
    unit = 'hour'
    amount = diffMs / hour
  }

  const rounded = Math.round(amount)
  return RELATIVE_FORMATTER.format(rounded, unit)
}

function normaliseHandle(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const clean = trimmed.replace(/^@+/, '')
  return `@${clean}`
}

function normaliseUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed.replace(/^https?:\/\//i, '')}`
}

function instagramUrl(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const handle = trimmed.replace(/^@+/, '')
  if (!handle) return null
  return `https://instagram.com/${handle}`
}

function facebookUrl(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://facebook.com/${trimmed.replace(/^@+/, '')}`
}

export default function Dashboard() {
  const { user, logout, isModerator } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<SellerTab>('Perfil')
  const [sellerListings, setSellerListings] = useState<Listing[]>([])
  const [profile, setProfile] = useState<UserProfileRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const isMobile = useIsMobile()
  const [mobileActiveTab, setMobileActiveTab] = useState<SellerTab | null>(null)
  const { unreadCount: unreadNotifications } = useNotifications()
  const { ids: favouriteIdsLocal } = useFaves()
  const favouriteIdsRemote = useLikedIds()
  const favouriteIds = favouriteIdsRemote.length ? favouriteIdsRemote : favouriteIdsLocal
  const favouritesCount = favouriteIds.length
  const [credits, setCredits] = useState<Credit[]>([])
  const availableCredits = useMemo(() => credits.filter((c) => c.status === 'available').length, [credits])
  const availableBasic = useMemo(() => credits.filter((c) => c.status === 'available' && c.plan_code === 'basic').length, [credits])
  const availablePremium = useMemo(() => credits.filter((c) => c.status === 'available' && c.plan_code === 'premium').length, [credits])
  // Moderación (share-boost)
  const [modOpen, setModOpen] = useState(false)
  const [modItems, setModItems] = useState<any[]>([])
  const [modLoading, setModLoading] = useState(false)
  // Crear regalos (gift codes)
  const [giftOpen, setGiftOpen] = useState(false)
  const [giftPlan, setGiftPlan] = useState<'basic' | 'premium'>('basic')
  const [giftUses, setGiftUses] = useState(1)
  const [giftExpires, setGiftExpires] = useState('')
  const [giftCreating, setGiftCreating] = useState(false)
  const [giftCode, setGiftCode] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!user?.id) {
      setSellerListings([])
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      if (supabaseEnabled) {
        const [listingsData, profileData, creditsData] = await Promise.all([
          fetchListingsBySeller(user.id, { includeArchived: true }),
          fetchUserProfile(user.id),
          fetchCreditsHistory(user.id)
        ])
        setSellerListings(listingsData)
        setProfile(profileData)
        setCredits(creditsData)
      } else {
        const fallbackListings = mockListings.filter((l) => l.sellerId === user.id)
        setSellerListings(fallbackListings)
        setProfile(null)
      }
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Dispara eventos de registro y login tras volver de OAuth (si corresponde)
  useEffect(() => {
    try {
      const signupKey = 'mb_oauth_signup_intent'
      const loginKey = 'mb_oauth_login_intent'

      const signupIntent = sessionStorage.getItem(signupKey)
      if (signupIntent) {
        trackMetaPixel('SignUp', { method: signupIntent })
        trackMetaPixel('CompleteRegistration', { method: signupIntent })
        sessionStorage.removeItem(signupKey)
      }

      const loginIntent = sessionStorage.getItem(loginKey)
      if (loginIntent) {
        trackMetaPixel('Login', { method: loginIntent })
        sessionStorage.removeItem(loginKey)
      }
    } catch { /* noop */ }
  }, [])

  // (Promo redirections removidas)

  useEffect(() => {
    if (!isMobile) {
      setMobileActiveTab(null)
    }
  }, [isMobile])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [activeTab])

  useEffect(() => {
    if (!mobileNavOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileNavOpen])

  useEffect(() => {
    if (!mobileNavOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileNavOpen])

  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam && TABS.includes(tabParam as SellerTab)) {
      const tab = tabParam as SellerTab
      setActiveTab(tab)
      if (isMobile) setMobileActiveTab(tab)
    }
  }, [searchParams, isMobile])

  const profileNeedsInfo = useMemo(() => {
    if (!user) return false
    const preferredBike = profile?.preferred_bike ?? ''
    return !profile || !profile.province || !profile.city || !preferredBike.trim()
  }, [user, profile])

  const handleSelectTab = useCallback((tab: SellerTab) => {
    setActiveTab(tab)
    setMobileNavOpen(false)
    if (isMobile) {
      setMobileActiveTab(tab)
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        })
      }
    }
  }, [isMobile])

  const visibleTabs = useMemo(() => {
    return TABS.filter((tab) => {
      const isStore = Boolean(profile?.store_enabled)
      if (!isStore) {
        // Usuarios sin tienda: mostrar todo excepto "Editar tienda" y "Analítica"
        return tab !== 'Editar tienda' && tab !== 'Analítica'
      }
      // Usuarios con tienda: ocultar "Editar perfil" y mostrar "Editar tienda" + "Analítica"
      if (tab === 'Editar perfil') return false
      return true
    })
  }, [profile?.store_enabled])

  const openEditProfile = useCallback(() => {
    handleSelectTab('Editar perfil')
  }, [handleSelectTab])

  const renderSection = (tab: SellerTab) => {
    switch (tab) {
      case 'Perfil':
        return (
          <ProfileView
            listing={sellerProfile}
            profile={profile}
            totalListings={sellerListings.length}
            fallbackEmail={user?.email ?? undefined}
            onEditProfile={openEditProfile}
            profileNeedsInfo={profileNeedsInfo}
            isModerator={isModerator}
            lastConnectionAt={lastConnectionAt}
            latestListingAt={latestListingAt}
            reviewsSummary={reviewsSummary}
          />
        )
      case 'Publicaciones':
        return <ListingsView listings={sellerListings} credits={credits} profile={profile} onRefresh={loadData} />
      case 'Notificaciones':
        return <NotificationsView />
      case 'Créditos':
        return <CreditsView credits={credits} />
      case 'Favoritos':
        return <FavoritesView favouriteIds={favouriteIdsRemote.length ? favouriteIdsRemote : favouriteIdsLocal} />
      case 'Editar perfil':
        return (
          <EditProfileView
            profile={profile}
            listing={sellerProfile}
            userId={user?.id}
            userEmail={
              user?.email
              ?? (typeof user?.user_metadata?.email === 'string' ? user.user_metadata.email : undefined)
            }
            onProfileUpdated={loadData}
          />
        )
      case 'Editar tienda':
        return (
          <EditStoreView
            profile={profile}
            userId={user?.id}
            onStoreUpdated={loadData}
          />
        )
      case 'Analítica':
        return <StoreAnalyticsView enabled={Boolean(profile?.store_enabled)} />
      case 'Verificá tu perfil':
        return <VerifyProfileView profile={profile} userEmail={user?.email} />
      case 'Cerrar sesión':
        return <SignOutView onSignOut={logout} />
      default:
        return null
    }
  }

  function StoreAnalyticsView({ enabled }: { enabled: boolean }) {
    const [loadingA, setLoadingA] = useState(true)
    const [summary, setSummary] = useState<{ store_views: number; listing_views: number; wa_clicks: number } | null>(null)
    const [top, setTop] = useState<Array<{ listing_id: string; views: number; wa_clicks: number; ctr: number }>>([])
    const [listingMap, setListingMap] = useState<Record<string, Listing>>({})

    useEffect(() => {
      let active = true
      const load = async () => {
        if (!enabled || !supabaseEnabled) { setLoadingA(false); return }
        setLoadingA(true)
        try {
          const uid = user?.id || undefined
          const [s, rows] = await Promise.all([
            fetchStoreSummary30d(uid),
            fetchStoreListingSummary30d(10, uid)
          ])
          if (!active) return
          setSummary(s ? { store_views: s.store_views || 0, listing_views: s.listing_views || 0, wa_clicks: s.wa_clicks || 0 } : { store_views: 0, listing_views: 0, wa_clicks: 0 })
          setTop(rows)
          const ids = rows.map((r) => r.listing_id).filter(Boolean)
          if (ids.length) {
            const list = await fetchListingsByIds(ids)
            if (!active) return
            const map: Record<string, Listing> = {}
            for (const l of list) map[l.id] = l
            setListingMap(map)
          } else {
            setListingMap({})
          }
        } finally {
          if (active) setLoadingA(false)
        }
      }
      void load()
      return () => { active = false }
    }, [enabled])

    if (!enabled) {
      return (
        <div className="p-4 text-sm text-[#14212e]/80">
          Activá tu tienda para ver analítica de vistas y contactos.
        </div>
      )
    }

    const storeViews = summary?.store_views || 0
    const listingViews = summary?.listing_views || 0
    const waClicks = summary?.wa_clicks || 0
    const ctr = listingViews > 0 ? Math.round((waClicks / listingViews) * 10000) / 100 : 0

    return (
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-[#14212e]/10 bg-white p-4">
            <div className="text-xs text-[#14212e]/70">Vistas a tienda (30d)</div>
            <div className="mt-1 text-2xl font-semibold text-[#14212e]">{storeViews.toLocaleString('es-AR')}</div>
          </div>
          <div className="rounded-2xl border border-[#14212e]/10 bg-white p-4">
            <div className="text-xs text-[#14212e]/70">Vistas a publicaciones (30d)</div>
            <div className="mt-1 text-2xl font-semibold text-[#14212e]">{listingViews.toLocaleString('es-AR')}</div>
          </div>
          <div className="rounded-2xl border border-[#14212e]/10 bg-white p-4">
            <div className="text-xs text-[#14212e]/70">Clicks a WhatsApp (30d)</div>
            <div className="mt-1 text-2xl font-semibold text-[#14212e]">{waClicks.toLocaleString('es-AR')}</div>
          </div>
          <div className="rounded-2xl border border-[#14212e]/10 bg-white p-4">
            <div className="text-xs text-[#14212e]/70">Conversión (WA / vistas)</div>
            <div className="mt-1 text-2xl font-semibold text-[#14212e]">{ctr.toFixed(2)}%</div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-[#14212e]/10 bg-white">
          <div className="border-b border-[#14212e]/10 px-4 py-3">
            <h3 className="text-sm font-semibold text-[#14212e]">Top publicaciones (30 días)</h3>
          </div>
          {loadingA ? (
            <div className="px-4 py-6 text-sm text-[#14212e]/70">Cargando…</div>
          ) : top.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[#14212e]/70">Sin datos aún.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#14212e]/10 text-sm">
                <thead className="bg-[#14212e]/5">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-[#14212e]/80">Publicación</th>
                    <th className="px-4 py-2 text-right font-semibold text-[#14212e]/80">Vistas</th>
                    <th className="px-4 py-2 text-right font-semibold text-[#14212e]/80">WA</th>
                    <th className="px-4 py-2 text-right font-semibold text-[#14212e]/80">CTR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#14212e]/10">
                  {top.map((row) => {
                    const l = listingMap[row.listing_id]
                    const href = l ? `/listing/${l.slug ?? l.id}` : undefined
                    return (
                      <tr key={row.listing_id} className="hover:bg-[#14212e]/5">
                        <td className="px-4 py-2">
                          {href ? (
                            <a className="text-[#14212e] underline" href={href} target="_blank" rel="noreferrer">
                              {l?.title || row.listing_id}
                            </a>
                          ) : (
                            <span className="text-[#14212e]">{l?.title || row.listing_id}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-[#14212e]">{(row.views || 0).toLocaleString('es-AR')}</td>
                        <td className="px-4 py-2 text-right text-[#14212e]">{(row.wa_clicks || 0).toLocaleString('es-AR')}</td>
                        <td className="px-4 py-2 text-right text-[#14212e]">{Number(row.ctr || 0).toFixed(2)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  const sellerProfile = sellerListings[0]
  const latestListingAt = useMemo(() => {
    if (!sellerListings.length) return null
    const newest = sellerListings.reduce((latest, current) => {
      if (!current?.createdAt) return latest
      return Math.max(latest, current.createdAt)
    }, 0)
    return newest > 0 ? newest : null
  }, [sellerListings])
  const lastConnectionAt = user?.last_sign_in_at ?? user?.created_at ?? null
  // Reviews summary para reputación real
  const [reviewsSummary, setReviewsSummary] = useState<ReviewsSummary | null>(null)
  useEffect(() => {
    const sellerId = user?.id
    if (!sellerId) { setReviewsSummary(null); return }
    let active = true
    ;(async () => {
      try {
        const data = await fetchSellerReviews(sellerId)
        if (active) setReviewsSummary(data?.summary ?? { sellerId, count: 0, avgRating: 0 })
      } catch {
        if (active) setReviewsSummary({ sellerId, count: 0, avgRating: 0 })
      }
    })()
    return () => { active = false }
  }, [user?.id])

  if (loading) {
    return (
      <div className="relative isolate overflow-hidden min-h-[calc(100vh-120px)] bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] py-10">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
          <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
          <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
        </div>
        <Container>
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-10 text-center text-white/80">
            Cargando tu panel de vendedor…
          </div>
        </Container>
      </div>
    )
  }

  if (isMobile) {
    const mobileTab = mobileActiveTab
    const activeMetadata = mobileTab ? TAB_METADATA[mobileTab] : null
    const displayName = profile?.full_name ?? sellerProfile?.sellerName ?? user?.email ?? 'Ciclista'

    return (
      <div className="relative isolate overflow-hidden min-h-[calc(100vh-96px)] bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] py-6 text-white">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
          <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
          <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
        </div>
        <Container>
          <div className="space-y-6">
            <header className="rounded-3xl border border-white/15 bg-white/10 p-5 shadow-[0_18px_40px_rgba(6,12,24,0.35)]">
              <p className="text-[11px] uppercase tracking-[0.35em] text-white/60">Panel de vendedor</p>
              <h1 className="mt-2 text-2xl font-semibold">Hola, {displayName}</h1>
              <p className="mt-1 text-sm text-white/70">Gestioná tu tienda y mantené al día tus publicaciones.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {profile?.store_enabled && profile?.store_slug && (
              <Button to={`/tienda/${profile.store_slug}`} variant="ghost" className="border-white/30 text-white hover:bg-white/10">
                Tu tienda
              </Button>
            )}
            <Button
              to="/publicar"
              className="bg-gradient-to-r from-[#0ea5e9] via-[#2563eb] to-[#1d4ed8] text-white shadow-[0_14px_40px_rgba(37,99,235,0.45)] hover:brightness-110"
            >
                  <span>Nueva publicación</span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
                  </svg>
                </Button>
                <Button to="/marketplace" className="bg-[#14212e] text-white shadow-[0_14px_40px_rgba(20,33,46,0.35)] hover:bg-[#1b2f3f]">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m17.5 17.5-4-4m1-3.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z" />
                  </svg>
                  <span>Ver marketplace</span>
                </Button>
              </div>
            </header>

            {mobileTab ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileActiveTab(null)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white transition hover:border-white/40"
                    aria-label="Volver al menú"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      stroke="currentColor"
                      fill="none"
                      strokeWidth={1.6}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/50">Sección</p>
                    <h2 className="text-lg font-semibold">{activeMetadata?.title ?? mobileTab}</h2>
                  </div>
                </div>
                <div className="rounded-3xl border border-white/15 bg-white px-3 py-3 text-[#14212e] shadow-[0_18px_40px_rgba(6,12,24,0.25)]">
                  {renderSection(mobileTab)}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {profileNeedsInfo && (
                  <div className="rounded-3xl border border-amber-100 bg-amber-50/95 p-4 text-[#7c3f00] shadow-lg">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">Completá tu perfil</p>
                        <p className="text-sm text-[#7c3f00]/80">Agregá ubicación y preferencias para mejorar tu visibilidad.</p>
                      </div>
                      <Button type="button" className="bg-[#14212e] text-white hover:bg-[#1b2f3f]" onClick={() => handleSelectTab('Editar perfil')}>
                        Ir a editar perfil
                      </Button>
                    </div>
                  </div>
                )}
                <div className="grid gap-3">
                  {visibleTabs.map((tab) => {
                    const meta = TAB_METADATA[tab]
                    const badge = tab === 'Notificaciones' ? unreadNotifications : tab === 'Favoritos' ? favouritesCount : 0
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => handleSelectTab(tab)}
                        className="flex items-center justify-between gap-3 rounded-3xl border border-white/15 bg-white/10 p-4 text-left shadow-[0_18px_40px_rgba(6,12,24,0.25)] transition hover:bg-white/15"
                      >
                      <div className="flex w-full items-center gap-3">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white">
                          <TabIcon tab={tab} />
                        </span>
                        <div className="flex flex-1 flex-col">
                          <p className="text-base font-semibold text-white">{meta.title}</p>
                          <p className="text-xs text-white/70">{meta.description}</p>
                        </div>
                        {badge > 0 && (
                          <span className="inline-flex min-w-[26px] shrink-0 items-center justify-center rounded-full bg-[#ff6b6b] px-2 py-0.5 text-[11px] font-semibold text-white">
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </div>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          className="h-5 w-5 text-white/50"
                          stroke="currentColor"
                          fill="none"
                          strokeWidth={1.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                        </svg>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </Container>
      </div>
    )
  }

  return (
    <div className="relative isolate overflow-hidden min-h-[calc(100vh-120px)] bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] py-10">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
        <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
        <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
      </div>
      <Container>
        {sellerListings.length === 0 && availableBasic > 0 && (
          <div className="mb-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 shadow">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-semibold">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Crédito Básico disponible
                </div>
                <p className="mt-1 text-sm">Podés usar este crédito para crear una publicación Básica sin costo.</p>
              </div>
              <Link
                to="/publicar"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Usar mi crédito
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </Link>
            </div>
          </div>
        )}
        <div className="overflow-visible rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_35px_80px_rgba(12,20,28,0.45)]">
          <header className="border-b border-white/10 bg-[#14212e]/90 px-6 py-6 text-white">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start justify-between gap-3 sm:block">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-white/70">Panel de vendedor</p>
                  <h1 className="text-2xl font-semibold">Bienvenido, {sellerProfile?.sellerName || 'Ciclista'}</h1>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(true)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white transition hover:border-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 sm:hidden"
                  aria-label="Abrir menú del panel"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    className="h-6 w-6"
                    stroke="currentColor"
                    fill="none"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/30 px-3 py-1.5 text-sm text-white/90">
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  Disponibles: Básica {availableBasic} • Premium {availablePremium}
                </div>
                {isModerator && (
                  <button
                    type="button"
                    className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:border-white/60"
                    onClick={async () => {
                      setModOpen(true)
                      setModLoading(true)
                      try {
                        const items = await fetchPendingShareBoosts()
                        setModItems(items)
                      } catch (e) {
                        // ignore
                      } finally {
                        setModLoading(false)
                      }
                    }}
                  >
                    Moderación
                  </button>
                )}
                {isModerator && (
                  <button
                    type="button"
                    className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:border-white/60"
                    onClick={() => setGiftOpen(true)}
                  >
                    Crear regalo
                  </button>
                )}
                {profile?.store_enabled && profile?.store_slug && (
                  <Button to={`/tienda/${profile.store_slug}`} variant="ghost" className="border-white/30 text-white hover:bg-white/10">
                    Tu tienda
                  </Button>
                )}
                <Button to="/publicar" className="bg-gradient-to-r from-[#0ea5e9] via-[#2563eb] to-[#1d4ed8] text-white shadow-[0_14px_40px_rgba(37,99,235,0.45)] hover:brightness-110">
                  <span>Nueva publicación</span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
                  </svg>
                </Button>
              </div>
            </div>
          </header>

          <div className="grid gap-6 p-6 lg:grid-cols-[260px_1fr]">
            <nav className="hidden rounded-3xl border border-white/10 bg-white/[0.08] p-3 text-sm text-white/80 md:block">
              <ul className="grid gap-1">
                {visibleTabs.map((tab) => (
                  <li key={tab}>
                    <button
                      type="button"
                      onClick={() => handleSelectTab(tab)}
                      className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                        activeTab === tab
                          ? 'bg-white text-[#14212e] shadow-lg'
                          : 'hover:bg-white/10'
                      }`}
                    >
                      {tab}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <section className="rounded-3xl border border-white/10 bg-white px-7 py-6 md:p-6 shadow-[0_25px_60px_rgba(12,20,28,0.25)]">
              {renderSection(activeTab)}
            </section>
          </div>
        </div>
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm sm:hidden"
            role="dialog"
            aria-modal="true"
            onClick={() => setMobileNavOpen(false)}
          >
            <div
              className="absolute inset-x-4 top-24 rounded-3xl border border-[#14212e]/10 bg-white p-5 text-[#14212e] shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Secciones del panel</h2>
                <button
                  type="button"
                  aria-label="Cerrar menú"
                  onClick={() => setMobileNavOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#14212e]/10 text-[#14212e] hover:border-[#14212e]/40"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    stroke="currentColor"
                    fill="none"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18 18 6" />
                  </svg>
                </button>
              </div>
              <ul className="mt-4 grid gap-2">
                {visibleTabs.map((tab) => (
                  <li key={`mobile-${tab}`}>
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectTab(tab)
                      }}
                      className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                        activeTab === tab
                          ? 'border-[#14212e] bg-[#14212e] text-white shadow'
                          : 'border-[#14212e]/15 bg-white hover:border-[#14212e]/40'
                      }`}
                    >
                      {tab}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Container>
      {modOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setModOpen(false)}>
          <div className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h2 className="text-xl font-semibold text-[#14212e]">Comprobantes de compartidos</h2>
              <button type="button" onClick={() => setModOpen(false)} aria-label="Cerrar">✕</button>
            </div>
            {modLoading ? (
              <p className="mt-4 text-sm text-[#14212e]/70">Cargando…</p>
            ) : modItems.length === 0 ? (
              <p className="mt-4 text-sm text-[#14212e]/70">No hay comprobantes pendientes.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {modItems.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-[#14212e]/10 bg-white p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#14212e]">Listing: {item.listing_id}</p>
                        <p className="text-xs text-[#14212e]/70">Seller: {item.seller_id} · Tipo: {item.type} · Recompensa: {item.reward}</p>
                        {item.handle && <p className="text-xs text-[#14212e]/70">Handle: {item.handle}</p>}
                        {item.note && <p className="text-xs text-[#14212e]/70">Nota: {item.note}</p>}
                        <p className="text-xs text-[#14212e]/60">Enviado: {new Date(item.created_at).toLocaleString('es-AR')}</p>
                      </div>
                      {item.proof_url && (
                        <a href={item.proof_url} target="_blank" rel="noreferrer" className="rounded-xl border border-[#14212e]/15 p-2 text-xs text-[#14212e] hover:bg-[#14212e]/5">Ver captura</a>
                      )}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          try {
                            await reviewShareBoost(item.id, true, user?.id)
                            setModItems((prev) => prev.filter((x) => x.id !== item.id))
                          } catch { void 0 }
                        }}
                        className="text-xs"
                      >
                        Aprobar
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await reviewShareBoost(item.id, false, user?.id)
                            setModItems((prev) => prev.filter((x) => x.id !== item.id))
                          } catch { void 0 }
                        }}
                        className="text-xs text-red-600"
                      >
                        Rechazar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {giftOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setGiftOpen(false)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h2 className="text-xl font-semibold text-[#14212e]">Crear código de regalo</h2>
              <button type="button" onClick={() => setGiftOpen(false)} aria-label="Cerrar">✕</button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex gap-3">
                <label className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${giftPlan === 'basic' ? 'border-[#14212e] bg-[#14212e]/10 text-[#14212e]' : 'border-[#14212e]/20 text-[#14212e]/80'}`}>
                  <input type="radio" name="gift-plan" checked={giftPlan === 'basic'} onChange={() => setGiftPlan('basic')} /> Básico
                </label>
                <label className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${giftPlan === 'premium' ? 'border-[#14212e] bg-[#14212e]/10 text-[#14212e]' : 'border-[#14212e]/20 text-[#14212e]/80'}`}>
                  <input type="radio" name="gift-plan" checked={giftPlan === 'premium'} onChange={() => setGiftPlan('premium')} /> Premium
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-[#14212e]">Usos</label>
                  <input className="input mt-1" type="number" min={1} value={giftUses} onChange={(e) => setGiftUses(Math.max(1, Number(e.target.value) || 1))} />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#14212e]">Vence (opcional)</label>
                  <input className="input mt-1" type="date" value={giftExpires} onChange={(e) => setGiftExpires(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setGiftOpen(false)} disabled={giftCreating}>Cancelar</Button>
                <Button
                  onClick={async () => {
                    setGiftCreating(true)
                    setGiftCode(null)
                    try {
                      const iso = giftExpires ? new Date(giftExpires).toISOString() : undefined
                      const res = await createGift(giftPlan, giftUses, iso)
                      if (!res.ok || !res.code) throw new Error('No pudimos generar el código')
                      setGiftCode(res.code)
                    } catch (e) {
                      // noop
                    } finally {
                      setGiftCreating(false)
                    }
                  }}
                  disabled={giftCreating}
                  className="bg-[#14212e] text-white hover:bg-[#1b2f3f]"
                >
                  {giftCreating ? 'Creando…' : 'Crear código'}
                </Button>
              </div>
              {giftCode && (
                <div className="rounded-xl border border-[#14212e]/10 bg-[#14212e]/5 p-3">
                  <p className="text-sm font-semibold text-[#14212e]">Código generado</p>
                  <p className="mt-1 text-sm text-[#14212e]/80 break-all">{giftCode}</p>
                  <p className="mt-2 text-xs text-[#14212e]/70">Link:</p>
                  <p className="text-sm text-[#14212e] break-all">
                    {typeof window !== 'undefined' ? `${window.location.origin}/publicar?plan=${giftPlan}&gift=${giftCode}` : `/publicar?plan=${giftPlan}&gift=${giftCode}`}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileView({
  listing,
  profile,
  totalListings,
  fallbackEmail,
  onEditProfile,
  profileNeedsInfo,
  isModerator,
  lastConnectionAt,
  latestListingAt,
  reviewsSummary,
}: {
  listing: Listing | undefined
  profile: UserProfileRecord | null
  totalListings: number
  fallbackEmail?: string
  onEditProfile: () => void
  profileNeedsInfo: boolean
  isModerator: boolean
  lastConnectionAt?: string | null
  latestListingAt?: number | null
  reviewsSummary?: ReviewsSummary | null
}) {
  const displayName = profile?.full_name ?? listing?.sellerName ?? fallbackEmail ?? 'Vendedor Ciclo Market'
  const locationFromProfile = profile?.city
    ? profile.province
      ? `${profile.city}, ${profile.province}`
      : profile.city
    : null
  const displayLocation = locationFromProfile ?? listing?.sellerLocation ?? 'Ubicación reservada'
  const avatarUrl = profile?.avatar_url ?? listing?.sellerAvatar ?? null
  const preferredBike = profile?.preferred_bike ?? null
  const instagramLink = instagramUrl(profile?.instagram_handle)
  const facebookLink = facebookUrl(profile?.facebook_handle)
  const websiteLink = profile?.website_url ? normaliseUrl(profile?.website_url) : null
  const { ids: favouriteIds } = useFaves()
  const favouritesCount = favouriteIds.length

  const lastActivityDate = latestListingAt ? new Date(latestListingAt) : null
  const activityLabel = lastActivityDate && !Number.isNaN(lastActivityDate.getTime())
    ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(lastActivityDate)
    : 'Sin actividad reciente'
  const activityRelative = lastActivityDate && !Number.isNaN(lastActivityDate.getTime())
    ? relativeTimeFromNow(lastActivityDate.toISOString())
    : null

  const connectionDate = lastConnectionAt ? new Date(lastConnectionAt) : null
  const connectionValid = connectionDate && !Number.isNaN(connectionDate.getTime())
  const connectionLabel = connectionValid
    ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeStyle: 'short' }).format(connectionDate as Date)
    : 'Sesión en curso'
  const connectionRelative = connectionValid
    ? relativeTimeFromNow((connectionDate as Date).toISOString())
    : null

  // Reputación real según reviews (fallback a heurística si no hay summary)
  const rawCount = (reviewsSummary?.count as any)
  const reviewCount = Math.max(0, Number.isFinite(Number(rawCount)) ? Number(rawCount) : 0)
  const avgRating = Math.max(0, Math.min(5, Number(reviewsSummary?.avgRating ?? 0)))
  const hasReviews = reviewCount > 0 || avgRating > 0
  const computedScore = hasReviews ? Math.round(avgRating) : (profile?.verified ? 5 : totalListings >= 5 ? 5 : totalListings >= 3 ? 4 : 3)
  const reputationScore = computedScore
  const reputationDescription = !hasReviews
    ? 'Aún no tenés reviews.'
    : avgRating >= 4.5
      ? 'Excelente reputación. Mantené la respuesta rápida para sostenerla.'
      : avgRating >= 3.5
        ? 'Buena reputación. Seguí mejorando la atención.'
        : 'Reputación en desarrollo. Responder rápido ayuda a mejorar.'
  const ratingDisplay = hasReviews ? `${avgRating.toFixed(1)} / 5` : `${reputationScore} / 5`

  const createdAtDate = profile?.created_at ? new Date(profile.created_at) : null
  const accountAge = createdAtDate && !Number.isNaN(createdAtDate.getTime())
    ? (() => {
        const now = new Date()
        const months = (now.getFullYear() - createdAtDate.getFullYear()) * 12 + (now.getMonth() - createdAtDate.getMonth())
        if (months >= 24) return `${Math.floor(months / 12)} años`
        if (months >= 12) return '1 año'
        if (months > 1) return `${months} meses`
        return '1 mes'
      })()
    : '—'
  const trustTrend = `Antigüedad: ${accountAge} • ${profile?.whatsapp_number ? 'WhatsApp cargado' : 'Sin WhatsApp'}`
  return (
    <div className="space-y-6">
      <AdminFxPanel />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="size-24 overflow-hidden rounded-3xl bg-[#14212e]/10">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-[#14212e]/60">
              {displayName[0]}
            </div>
          )}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold text-[#14212e]">{displayName}</h2>
            {isModerator && (
              <span className="rounded-full border border-[#14212e]/20 bg-[#14212e]/10 px-3 py-1 text-xs font-semibold text-[#14212e]">
                Moderador
              </span>
            )}
          </div>
          <p className="text-sm text-[#14212e]/70">{displayLocation}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <ProfileStat
          label="Publicaciones activas"
          value={totalListings}
          trend={totalListings > 0 ? `${totalListings === 1 ? '1 publicación en curso' : `${totalListings} publicaciones en curso`}` : 'Publicá tu primera bicicleta'}
        />
        <ProfileStat
          label="Bicicletas guardadas"
          value={favouritesCount}
          trend={favouritesCount > 0 ? 'En tu lista de seguimiento' : 'Guardá bicicletas para compararlas más tarde'}
        />
        <ProfileStat
          label="Señales de confianza"
          value={profile?.verified ? 'Vendedor verificado' : 'Perfil en construcción'}
          trend={trustTrend}
        />
      </div>

      <div className="rounded-2xl border border-[#14212e]/10 bg-white px-7 py-6 md:p-6 shadow">
        <h3 className="text-sm font-semibold text-[#14212e] uppercase tracking-wide">Tu perfil público</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {preferredBike && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-[#14212e]/50">Preferencia</dt>
              <dd className="text-sm font-medium text-[#14212e]">{preferredBike}</dd>
            </div>
          )}
          {instagramLink && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-[#14212e]/50">Instagram</dt>
              <dd>
                <a href={instagramLink} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-[#14212e] underline">
                  {profile?.instagram_handle ?? instagramLink}
                </a>
              </dd>
            </div>
          )}
          {facebookLink && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-[#14212e]/50">Facebook</dt>
              <dd>
                <a href={facebookLink} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-[#14212e] underline">
                  {profile?.facebook_handle ?? facebookLink}
                </a>
              </dd>
            </div>
          )}
          {websiteLink && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-[#14212e]/50">Sitio web</dt>
              <dd>
                <a href={websiteLink} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-[#14212e] underline">{websiteLink}</a>
              </dd>
            </div>
          )}
          {!preferredBike && !instagramLink && !facebookLink && !websiteLink && (
            <div className="sm:col-span-2 text-sm text-[#14212e]/70">
              Añadí tus redes y preferencias desde la pestaña “Editar perfil”.
            </div>
          )}
        </dl>
      </div>

      {profileNeedsInfo && (
        <div className="rounded-2xl border border-[#14212e]/10 bg-[#ffedd5] p-4 text-[#7c3f00]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Completá tu perfil</h3>
              <p className="text-sm">Contanos tu ubicación y preferencias para que te enviemos oportunidades relevantes.</p>
            </div>
            <Button type="button" className="bg-[#14212e] text-white hover:bg-[#1b2f3f]" onClick={onEditProfile}>
              Completar perfil
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#14212e]/10 bg-[#14212e]/5 p-5">
          <h3 className="text-sm font-semibold text-[#14212e] uppercase tracking-wide">Resumen de actividad</h3>
          <dl className="mt-3 space-y-3 text-sm text-[#14212e]">
            <div>
              <dt className="text-xs uppercase tracking-wide text-[#14212e]/50">Fecha de actividad</dt>
              <dd className="mt-1 font-medium">
                {activityLabel}
                {activityRelative && (
                  <span className="ml-2 text-xs text-[#14212e]/60">({activityRelative})</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[#14212e]/50">Última conexión</dt>
              <dd className="mt-1 font-medium">
                {connectionLabel}
                {connectionRelative && (
                  <span className="ml-2 text-xs text-[#14212e]/60">({connectionRelative})</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[#14212e]/50">Reputación</dt>
              <dd className="mt-1">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }, (_, index) => (
                      <StarIcon key={index} filled={index < reputationScore} />
                    ))}
                  </div>
                  <span className="text-sm font-medium text-[#14212e]">{ratingDisplay}</span>
                </div>
                <p className="mt-1 text-xs text-[#14212e]/60">{reputationDescription}</p>
              </dd>
            </div>
          </dl>
        </div>
        <div className="rounded-2xl border border-[#14212e]/10 bg-white px-7 py-6 md:p-6">
          <h3 className="text-sm font-semibold text-[#14212e] uppercase tracking-wide">Potenciá tus ventas</h3>
          <ul className="mt-3 space-y-3 text-sm text-[#14212e]/80">
            {[
              'Elegí publicaciones premium para aparecer destacada en la portada.',
              'Completá tu perfil con foto, ubicación y redes sociales.',
              'Respondé rápido a las consultas para ganar confianza.'
            ].map((tip) => (
              <li key={tip} className="flex items-start gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function ListingsView({ listings, credits, profile, onRefresh }: { listings: Listing[]; credits: Credit[]; profile?: UserProfileRecord | null; onRefresh?: () => Promise<void> | void }) {
  const navigate = useNavigate()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const { show: showToast } = useToast()
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null)
  const [upgradingKey, setUpgradingKey] = useState<string | null>(null)
  const now = Date.now()
  const expiredList = useMemo(() =>
    listings.filter((l) => l.status === 'expired' || (typeof l.expiresAt === 'number' && l.expiresAt > 0 && l.expiresAt < now)),
  [listings, now])
  const availableCredits = useMemo(() => {
    const summary: Record<'basic' | 'premium', number> = { basic: 0, premium: 0 }
    credits.forEach((credit) => {
      if (credit.status === 'available') {
        if (credit.plan_code === 'basic') summary.basic += 1
        if (credit.plan_code === 'premium') summary.premium += 1
      }
    })
    return summary
  }, [credits])
  const hasProfileWhatsapp = Boolean(profile?.whatsapp_number && profile.whatsapp_number.trim())
  const creditAvailable = useCallback((plan: 'basic' | 'premium') => availableCredits[plan] > 0, [availableCredits])
  const getUpgradeLabel = useCallback((currentPlan: string | null, targetPlan: 'basic' | 'premium') => {
    const targetLabel = targetPlan === 'premium' ? 'Premium' : 'Básica'
    if (!currentPlan || currentPlan === 'free') return `Mejorar a ${targetLabel} con crédito`
    if (currentPlan === targetPlan) return `Renovar plan ${targetLabel} con crédito`
    if (currentPlan === 'basic' && targetPlan === 'premium') return 'Subir a Premium con crédito'
    return `Cambiar a plan ${targetLabel} con crédito`
  }, [])

  const handleUpgrade = useCallback(async (listing: Listing, targetPlan: 'basic' | 'premium') => {
    if (!creditAvailable(targetPlan)) {
      showToast('No tenés créditos disponibles para ese plan.', { variant: 'error' })
      return
    }
    if (!hasProfileWhatsapp && (!listing.sellerWhatsapp || !listing.sellerWhatsapp.trim())) {
      showToast('Agregá tu número de WhatsApp en tu perfil antes de mejorar la publicación.', { variant: 'error' })
      return
    }
    const key = `${listing.id}-${targetPlan}`
    setUpgradingKey(key)
    try {
      const result = await upgradeListingPlan({ id: listing.id, planCode: targetPlan, useCredit: true })
      if (!result.ok) {
        const error = result.error
        if (error === 'no_available_credit' || error === 'credit_required') {
          showToast('Necesitás un crédito disponible para realizar esta mejora.', { variant: 'error' })
        } else if (error === 'missing_whatsapp') {
          showToast('Agregá tu número de WhatsApp desde tu perfil y volvé a intentar.', { variant: 'error' })
        } else if (error === 'credit_conflict') {
          showToast('No pudimos usar el crédito. Recargá la página e intentá de nuevo.', { variant: 'error' })
        } else {
          showToast('No pudimos actualizar la publicación. Intentá nuevamente.', { variant: 'error' })
        }
        return
      }
      if (onRefresh) await onRefresh()
      const currentPlan = canonicalPlanCode(listing.plan ?? listing.sellerPlan ?? undefined)
      const targetLabel = targetPlan === 'premium' ? 'Premium' : 'Básica'
      const message = currentPlan === targetPlan
        ? `Renovamos tu publicación con el plan ${targetLabel}.`
        : `Tu publicación ahora está en el plan ${targetLabel}.`
      setSuccessMessage(message)
      showToast(message, { variant: 'success' })
      if (typeof window !== 'undefined') {
        try { window.dispatchEvent(new CustomEvent('mb_credits_updated')) } catch { /* noop */ }
      }
      setOpenMenuFor(null)
    } catch (err) {
      console.warn('[dashboard] upgrade failed', err)
      showToast('No pudimos actualizar la publicación. Intentá nuevamente.', { variant: 'error' })
    } finally {
      setUpgradingKey(null)
    }
  }, [creditAvailable, hasProfileWhatsapp, onRefresh, showToast])

  useEffect(() => {
    if (!successMessage || typeof window === 'undefined') return
    const timeout = window.setTimeout(() => setSuccessMessage(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [successMessage])
  // Cerrar menú con Escape (hook arriba de cualquier return condicional)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuFor(null)
    }
    if (typeof window !== 'undefined') window.addEventListener('keydown', onKey)
    return () => {
      if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey)
    }
  }, [openMenuFor])
  if (!listings.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <h3 className="text-lg font-semibold text-[#14212e]">Todavía no tenés publicaciones activas</h3>
        <p className="max-w-md text-sm text-[#14212e]/70">
          Subí tu primera bicicleta o accesorio y aparecé en las búsquedas del Marketplace. Recordá que podés destacarte con el plan Destacada o Pro.
        </p>
        <Button to="/publicar" className="bg-[#14212e] text-white hover:bg-[#1b2f3f]">
          Publicar ahora
        </Button>
      </div>
    )
  }

  const handleArchive = async (id: string) => {
    const confirmed = window.confirm('¿Seguro que querés archivar esta publicación? Podrás reactivarla luego.')
    if (!confirmed) return
    if (!supabaseEnabled) {
      alert('Archivar requiere la conexión con Supabase activada.')
      return
    }
    const ok = await archiveListing(id)
    if (!ok) {
      alert('No pudimos archivar la publicación. Intentá nuevamente.')
      return
    }
    if (onRefresh) await onRefresh()
    const msg = 'La publicación fue archivada. Podés reactivarla cuando quieras.'
    setSuccessMessage(msg)
    showToast(msg)
  }

  const handleToggleSold = async (listing: Listing) => {
    const isSold = listing.status === 'sold'
    const message = isSold
      ? '¿Querés volver a marcar esta publicación como disponible?'
      : '¿Querés marcar esta publicación como vendida?'
    const confirmed = window.confirm(message)
    if (!confirmed) return
    if (!supabaseEnabled) {
      alert('Cambiar el estado requiere la conexión con Supabase activada.')
      return
    }
    const nextStatus: Listing['status'] = isSold ? 'active' : 'sold'
    const updated = await updateListingStatus(listing.id, nextStatus)
    if (!updated) {
      alert('No pudimos actualizar el estado. Intentá nuevamente.')
      return
    }
    if (onRefresh) await onRefresh()
    const msg = isSold ? 'La publicación vuelve a estar activa.' : 'Marcaste la publicación como vendida.'
    setSuccessMessage(msg)
    showToast(msg)
  }

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Esta acción elimina la publicación de forma definitiva. ¿Querés continuar?')
    if (!confirmed) return
    if (!supabaseEnabled) {
      alert('Eliminar publicaciones requiere la conexión con Supabase activada.')
      return
    }
    const ok = await deleteListing(id)
    if (!ok) {
      alert('No pudimos eliminar la publicación. Intentá nuevamente.')
      return
    }
    if (onRefresh) await onRefresh()
    const msg = 'La publicación fue eliminada permanentemente.'
    setSuccessMessage(msg)
    showToast(msg)
  }

  const handleReducePrice = async (listing: Listing) => {
    const input = window.prompt('Reducí el precio (ingresá el nuevo valor, usa el mismo formato que la moneda actual):', String(listing.price))
    if (input === null) return
    const normalized = Number(input.replace(/,/g, '.'))
    if (!Number.isFinite(normalized) || normalized <= 0) {
      alert('Ingresá un monto válido mayor a cero.')
      return
    }
    if (normalized >= listing.price) {
      alert('El nuevo precio debe ser menor al actual para marcar la rebaja.')
      return
    }

    if (!supabaseEnabled) {
      alert('La reducción de precio requiere la conexión con Supabase activada.')
      return
    }

    const updated = await reduceListingPrice({
      id: listing.id,
      newPrice: normalized,
      currentPrice: listing.price,
      originalPrice: listing.originalPrice
    })
    if (!updated) {
      alert('No pudimos actualizar el precio. Intentá nuevamente.')
      return
    }
    if (onRefresh) await onRefresh()
    const msg = 'Se actualizó el precio correctamente.'
    setSuccessMessage(msg)
    showToast(msg)
  }

  const handleRenew = async (listing: Listing) => {
    try {
      const { renewListingViaApi } = await import('../services/renew')
      const ok = await renewListingViaApi(listing.id)
      if (!ok) {
        alert('No pudimos renovar la publicación. Verificá tu sesión e intentá nuevamente.')
        return
      }
      if (onRefresh) await onRefresh()
      const msg = 'La publicación fue renovada exitosamente.'
      setSuccessMessage(msg)
      showToast(msg)
    } catch (err) {
      console.warn('[dashboard] renew failed', err)
      alert('No pudimos renovar la publicación. Intentá más tarde.')
    }
  }

  

  return (
    <div className="space-y-4">
      {openMenuFor && (
        <span className="sr-only" aria-live="polite">Menú de opciones abierto</span>
      )}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#14212e]">Tus publicaciones</h2>
          <p className="text-sm text-[#14212e]/60">Gestioná precios, stock y visibilidad desde acá.</p>
        </div>
        <Button to="/publicar" className="bg-[#14212e] text-white hover:bg-[#1b2f3f]">
          Publicar nuevo aviso
        </Button>
      </header>
      {expiredList.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status" aria-live="polite">
          Tenés {expiredList.length} publicación{expiredList.length === 1 ? '' : 'es'} vencida{expiredList.length === 1 ? '' : 's'}. Abrí “Opciones” en cada tarjeta y elegí “Renovar publicación”.
        </div>
      )}
      {successMessage && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700" role="status" aria-live="polite">
          {successMessage}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 items-start relative">
        {openMenuFor && (
          <div className="fixed inset-0 z-40" onClick={() => setOpenMenuFor(null)} aria-hidden />
        )}
        {listings.map((listing) => {
          const listingPlanCode = canonicalPlanCode(listing.plan ?? listing.sellerPlan ?? undefined)
          const basicOptionKey = `${listing.id}-basic`
          const premiumOptionKey = `${listing.id}-premium`
          const showBasicCreditOption = creditAvailable('basic') && listingPlanCode !== 'premium'
          const showPremiumCreditOption = creditAvailable('premium')
          const basicUpgradeLabel = getUpgradeLabel(listingPlanCode, 'basic')
          const premiumUpgradeLabel = getUpgradeLabel(listingPlanCode, 'premium')
          return (
            <div key={listing.id} className="space-y-3">
              <ListingCard l={listing} />
              <div className="rounded-2xl border border-[#14212e]/10 bg-white/80 px-3 py-2 text-xs text-[#14212e]/70">
                <p className="font-semibold uppercase tracking-[0.25em] text-[#14212e]/60">Estado</p>
                <div className="mt-1 space-y-0.5">
                  <ListingExpiryMeta listing={listing} />
                </div>
              </div>
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-[#14212e]/20 bg-white px-3 py-1.5 text-xs font-semibold text-[#14212e] shadow-sm hover:bg-white/90"
                  onClick={() => navigate(`/publicar/nueva?id=${encodeURIComponent(listing.id)}`)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a1.75 1.75 0 1 1 2.475 2.475L8.25 17.05l-3.5.7.7-3.5 11.412-10.763Z" />
                  </svg>
                  Editar
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-[#14212e]/20 bg-white px-3 py-1.5 text-xs font-semibold text-[#14212e] shadow-sm hover:bg-white/90"
                  onClick={() => setOpenMenuFor((prev) => (prev === listing.id ? null : listing.id))}
                  aria-haspopup="menu"
                  aria-expanded={openMenuFor === listing.id}
                >
                  Opciones
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {openMenuFor === listing.id && (
                  <div className="absolute left-0 bottom-full z-50 mb-2 w-full min-w-[220px] rounded-xl border border-[#14212e]/10 bg-white p-2 text-sm text-[#14212e] shadow-xl">
                    {/* 3 atajos */}
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-[#14212e]/5"
                      onClick={() => { navigate(`/publicar/nueva?id=${encodeURIComponent(listing.id)}`); setOpenMenuFor(null) }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-[#14212e]/5"
                      onClick={() => { void handleToggleSold(listing); setOpenMenuFor(null) }}
                    >
                      {listing.status === 'sold' ? 'Marcar disponible' : 'Marcar vendida'}
                    </button>
                    <button
                      type="button"
                      disabled={listing.status === 'sold'}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-[#14212e]/5 ${listing.status === 'sold' ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={() => { void handleReducePrice(listing); setOpenMenuFor(null) }}
                    >
                      Reducir precio
                    </button>
                    {showBasicCreditOption && (
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-[#14212e]/5"
                        disabled={upgradingKey === basicOptionKey}
                        onClick={() => { void handleUpgrade(listing, 'basic') }}
                      >
                        {upgradingKey === basicOptionKey ? 'Aplicando…' : basicUpgradeLabel}
                      </button>
                    )}
                    {showPremiumCreditOption && (
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-[#14212e]/5"
                        disabled={upgradingKey === premiumOptionKey}
                        onClick={() => { void handleUpgrade(listing, 'premium') }}
                      >
                        {upgradingKey === premiumOptionKey ? 'Aplicando…' : premiumUpgradeLabel}
                      </button>
                    )}
                    {!showBasicCreditOption && !showPremiumCreditOption && (
                      <Link
                        to="/publicar"
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[#14212e] hover:bg-[#14212e]/5"
                        onClick={() => setOpenMenuFor(null)}
                      >
                        Comprar crédito
                      </Link>
                    )}
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-[#14212e]/5"
                      onClick={() => { void handleArchive(listing.id); setOpenMenuFor(null) }}
                    >
                      Archivar
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-red-600 hover:bg-red-50"
                      onClick={() => { void handleDelete(listing.id); setOpenMenuFor(null) }}
                    >
                      Eliminar
                    </button>
                    {/* Link a más acciones */}
                    <button
                      type="button"
                      className="mt-1 flex w-full items-center justify-between rounded-lg bg-[#14212e]/90 px-3 py-2 text-white hover:bg-[#14212e]"
                      onClick={() => {
                        const path = `/listing/${listing.slug || listing.id}`
                        navigate(path)
                        setOpenMenuFor(null)
                      }}
                    >
                      Más acciones…
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ListingExpiryMeta({ listing }: { listing: Listing }) {
  const now = Date.now()
  const expiresAt = typeof listing.expiresAt === 'number' ? listing.expiresAt : null
  const highlightSource = typeof listing.highlightExpires === 'number'
    ? listing.highlightExpires
    : typeof listing.sellerPlanExpires === 'number'
      ? listing.sellerPlanExpires
      : null
  const formatRemaining = (ms: number) => {
    const days = Math.ceil((ms - now) / (24 * 60 * 60 * 1000))
    return days <= 0 ? 'vencido' : `${days} día${days === 1 ? '' : 's'}`
  }
  const publicationLabel = expiresAt ? formatRemaining(expiresAt) : 'sin vencimiento'
  const highlightLabel = highlightSource ? formatRemaining(highlightSource) : 'sin destaque'

  const resolvedPlan = canonicalPlanCode(listing.plan ?? listing.sellerPlan ?? undefined)
  const planDef = FALLBACK_PLANS.find((plan) => canonicalPlanCode(plan.code ?? plan.id ?? plan.name) === resolvedPlan)
  const planDuration = planDef?.listingDurationDays ?? planDef?.periodDays ?? undefined
  const planName = planDef?.name ?? resolvedPlan ?? 'Plan'
  const planLabel = planDuration ? `${planName} · ${planDuration} días` : planName

  return (
    <>
      <div>Publicación: {publicationLabel}</div>
      <div>Plan: {planLabel}</div>
      <div>Destaque: {highlightLabel}</div>
    </>
  )
}

function FavoritesView({ favouriteIds }: { favouriteIds: string[] }) {
  const [loading, setLoading] = useState(false)
  const [listings, setListings] = useState<Listing[]>([])

  useEffect(() => {
    let active = true
    if (!favouriteIds.length) {
      setListings([])
      setLoading(false)
      return () => { active = false }
    }
    setLoading(true)
    const load = async () => {
      try {
        let data: Listing[] = []
        if (supabaseEnabled) {
          data = await fetchListingsByIds(favouriteIds)
        } else {
          data = mockListings.filter((listing) => favouriteIds.includes(listing.id))
        }
        if (!active) return
        const order = new Map(favouriteIds.map((id, index) => [id, index]))
        const filtered = data.filter((listing) => order.has(listing.id))
        const sorted = filtered.slice().sort((a, b) => {
          const aIndex = order.get(a.id) ?? 0
          const bIndex = order.get(b.id) ?? 0
          return aIndex - bIndex
        })
        setListings(sorted)
      } catch (error) {
        console.warn('[dashboard] load favourites failed', error)
        if (active) setListings([])
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [favouriteIds])

  if (!favouriteIds.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <h3 className="text-lg font-semibold text-[#14212e]">Todavía no guardaste bicicletas</h3>
        <p className="max-w-md text-sm text-[#14212e]/70">
          Buscá modelos en el marketplace y marcá con ❤️ tus preferidas para compararlas más tarde.
        </p>
        <Button to="/marketplace" className="bg-[#14212e] text-white hover:bg-[#1b2f3f]">
          Explorar marketplace
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center text-sm text-[#14212e]/70">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#14212e]/15">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="h-5 w-5 animate-spin text-[#14212e]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364 6.364-2.121-2.121M8.757 8.757 6.636 6.636m0 10.728 2.121-2.121m8.486-8.486 2.121-2.121" />
          </svg>
        </span>
        <p>Cargando tus favoritos…</p>
      </div>
    )
  }

  if (!listings.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <h3 className="text-lg font-semibold text-[#14212e]">No encontramos tus bicicletas guardadas</h3>
        <p className="max-w-md text-sm text-[#14212e]/70">
          Es posible que se hayan dado de baja o que los vendedores hayan pausado las publicaciones.
        </p>
        <Button to="/marketplace" variant="ghost" className="text-[#14212e] hover:bg-[#14212e]/10">
          Ver marketplace
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-[#14212e]">Tus favoritos</h2>
        <span className="rounded-full border border-[#14212e]/15 bg-[#14212e]/5 px-3 py-1 text-xs font-semibold text-[#14212e]/70">
          {listings.length} {listings.length === 1 ? 'artículo guardado' : 'artículos guardados'}
        </span>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {listings.map((listing) => (
          <ListingCard key={listing.id} l={listing} />
        ))}
      </div>
      <p className="text-xs text-[#14212e]/60">
        Quitá favoritos desde esta vista o desde el marketplace para mantener tu lista al día.
      </p>
    </div>
  )
}

function NotificationsView() {
  const { notifications, loading, unreadCount, markAsRead } = useNotifications()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[#14212e]">Notificaciones</h2>
        {unreadCount > 0 && (
          <span className="rounded-full bg-[#14212e]/10 px-3 py-1 text-xs font-semibold text-[#14212e]">
            {unreadCount} sin leer
          </span>
        )}
      </div>
      <div className="space-y-3">
        {loading && (
          <div className="rounded-2xl border border-[#14212e]/10 bg-[#14212e]/5 p-4 text-sm text-[#14212e]/70">
            Cargando notificaciones…
          </div>
        )}
        {!loading && notifications.length === 0 && (
          <div className="rounded-2xl border border-[#14212e]/10 bg-[#14212e]/5 p-6 text-center text-sm text-[#14212e]/70">
            No hay notificaciones por ahora.
          </div>
        )}
        {notifications.map((item) => {
          const timeAgo = relativeTimeFromNow(item.created_at)
          const unread = !item.read_at
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => unread && markAsRead(item.id)}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                unread
                  ? 'border-[#14212e]/30 bg-white shadow'
                  : 'border-[#14212e]/10 bg-[#14212e]/5'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#14212e]">{item.title}</h3>
                  <p className="mt-2 text-sm text-[#14212e]/80">{item.body}</p>
                </div>
                <span className="text-xs text-[#14212e]/60">{timeAgo || 'Hace instantes'}</span>
              </div>
              {item.cta_url && (
                <a
                  href={item.cta_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-xs font-semibold text-[#14212e] underline"
                >
                  Ver más detalles
                </a>
              )}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-[#14212e]/60">
        Recibirás alertas por email para que ninguna oferta o consulta importante se pierda.
      </p>
    </div>
  )
}

function TabIcon({ tab }: { tab: SellerTab }) {
  const common = {
    className: 'h-6 w-6',
    stroke: 'currentColor',
    fill: 'none',
    strokeWidth: 1.6,
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24'
  } as const

  switch (tab) {
    case 'Perfil':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5a7.5 7.5 0 0115 0" />
        </svg>
      )
    case 'Publicaciones':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h12M6 12h12M6 18h7" />
        </svg>
      )
    case 'Favoritos':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.04-4.5-4.55-4.5-1.74 0-3.42 1.008-4.45 2.708C10.97 4.758 9.29 3.75 7.55 3.75 5.04 3.75 3 5.765 3 8.25c0 5.25 7.5 9 9 9s9-3.75 9-9z" />
        </svg>
      )
    case 'Notificaciones':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.235 19.458a1.5 1.5 0 01-2.47 0M12 6a4.5 4.5 0 00-4.5 4.5v2.086a2 2 0 01-.586 1.414L6 15.914h12l-.914-.914a2 2 0 01-.586-1.414V10.5A4.5 4.5 0 0012 6z" />
        </svg>
      )
    case 'Créditos':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5v10.5H3.75z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 10.5h16.5" />
        </svg>
      )
    case 'Editar perfil':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.651-1.651a1.5 1.5 0 112.121 2.121L8.25 17.341 4.5 18.75l1.409-3.75L16.862 4.487z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5v6a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 16.5V8.25A2.25 2.25 0 016.75 6h6" />
        </svg>
      )
    case 'Analítica':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l3-3 3 3 6-6 3 3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 19.5h16.5M3.75 4.5h16.5M4.5 4.5v15M19.5 4.5v15" />
        </svg>
      )
    case 'Cerrar sesión':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V4.5a1.5 1.5 0 00-1.5-1.5h-6A1.5 1.5 0 006.75 4.5v15a1.5 1.5 0 001.5 1.5h6a1.5 1.5 0 001.5-1.5V15" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H9m9 0l-2.25-2.25M18 12l-2.25 2.25" />
        </svg>
      )
    default:
      return null
  }
}

function CreditsView({ credits }: { credits: Credit[] }) {
  const available = credits.filter((c) => c.status === 'available')
  const availableBasic = available.filter((c) => c.plan_code === 'basic').length
  const availablePremium = available.filter((c) => c.plan_code === 'premium').length
  const used = credits.filter((c) => c.status === 'used')
  const pending = credits.filter((c) => c.status === 'pending')
  const cancelled = credits.filter((c) => c.status === 'cancelled' || c.status === 'expired')
  const planLabel = (code: string) => (code === 'premium' ? 'Premium' : 'Básica')
  const statusLabel = (s: string) => s === 'available' ? 'Disponible' : s === 'used' ? 'Usado' : s === 'pending' ? 'Pendiente' : s === 'expired' ? 'Vencido' : 'Cancelado'
  const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '—')
  const daysLeft = (iso?: string | null) => {
    if (!iso) return null
    const d = new Date(iso)
    const diff = Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    return isNaN(diff) ? null : diff
  }

  const rows = credits.slice(0, 100)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-[#14212e]/10 bg-white p-4 shadow">
          <p className="text-xs uppercase tracking-wide text-[#14212e]/50">Disponibles</p>
          <p className="mt-1 text-2xl font-semibold text-[#14212e]">{available.length}</p>
          <p className="text-xs text-[#14212e]/60 mt-1">Básica {availableBasic} • Premium {availablePremium}</p>
        </div>
        <div className="rounded-2xl border border-[#14212e]/10 bg-white p-4 shadow">
          <p className="text-xs uppercase tracking-wide text-[#14212e]/50">Usados</p>
          <p className="mt-1 text-2xl font-semibold text-[#14212e]">{used.length}</p>
        </div>
        <div className="rounded-2xl border border-[#14212e]/10 bg-white p-4 shadow">
          <p className="text-xs uppercase tracking-wide text-[#14212e]/50">Pendientes</p>
          <p className="mt-1 text-2xl font-semibold text-[#14212e]">{pending.length}</p>
        </div>
        <div className="rounded-2xl border border-[#14212e]/10 bg-white p-4 shadow">
          <p className="text-xs uppercase tracking-wide text-[#14212e]/50">Cancelados/Vencidos</p>
          <p className="mt-1 text-2xl font-semibold text-[#14212e]">{cancelled.length}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-[#14212e]/10 bg-white p-4 shadow">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#14212e]">Historial de créditos</h3>
          <Link to="/publicar" className="text-sm font-semibold text-[#14212e] underline">Usar crédito</Link>
        </div>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-[#14212e]/70">Todavía no tenés créditos. Iniciá un pago desde Publicar para generar uno.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[#14212e]/60">
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Plan</th>
                  <th className="px-2 py-2">Estado</th>
                  <th className="px-2 py-2">Vence</th>
                  <th className="px-2 py-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-[#14212e]/10">
                    <td className="px-2 py-2 text-[#14212e]">{new Date(c.created_at).toLocaleString('es-AR')}</td>
                    <td className="px-2 py-2 text-[#14212e]">{planLabel(c.plan_code)}</td>
                    <td className="px-2 py-2 text-[#14212e]">{statusLabel(c.status)}</td>
                    <td className="px-2 py-2 text-[#14212e]">
                      {formatDate(c.expires_at)}
                      {c.status === 'available' && daysLeft(c.expires_at) != null && (
                        <span className="ml-1 text-xs text-[#14212e]/60">({daysLeft(c.expires_at)} días)</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-[#14212e]">
                      {c.status === 'used' && c.listing_id ? (
                        <Link to={`/listing/${c.listing_id}`} className="underline">Usado en publicación</Link>
                      ) : c.status === 'available' ? (
                        'Crédito disponible'
                      ) : c.status === 'pending' ? (
                        'Acreditando pago'
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function EditProfileView({
  profile,
  listing,
  userId,
  userEmail,
  onProfileUpdated,
}: {
  profile: UserProfileRecord | null
  listing: Listing | undefined
  userId?: string
  userEmail?: string | null
  onProfileUpdated?: () => Promise<void> | void
}) {
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [province, setProvince] = useState(profile?.province ?? '')
  const [city, setCity] = useState(profile?.city ?? '')
  const [cityOther, setCityOther] = useState('')
  const [preferredBike, setPreferredBike] = useState(profile?.preferred_bike ?? '')
  const [instagram, setInstagram] = useState(profile?.instagram_handle ?? '')
  const [facebook, setFacebook] = useState(profile?.facebook_handle ?? '')
  const [website, setWebsite] = useState(profile?.website_url ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  
  const COUNTRY_CODES = [
    { cc: 'AR', dial: '54', label: 'Argentina', flag: '🇦🇷' },
    { cc: 'PY', dial: '595', label: 'Paraguay', flag: '🇵🇾' },
    { cc: 'BR', dial: '55', label: 'Brasil', flag: '🇧🇷' },
    { cc: 'CL', dial: '56', label: 'Chile', flag: '🇨🇱' },
    { cc: 'UY', dial: '598', label: 'Uruguay', flag: '🇺🇾' },
    { cc: 'PE', dial: '51', label: 'Perú', flag: '🇵🇪' },
    { cc: 'VE', dial: '58', label: 'Venezuela', flag: '🇻🇪' },
    { cc: 'US', dial: '1', label: 'Estados Unidos', flag: '🇺🇸' },
  ] as const
  const [whatsappDial, setWhatsappDial] = useState<string>('54')
  const [whatsappEdited, setWhatsappEdited] = useState(false)
  const [whatsappLocal, setWhatsappLocal] = useState(() => sanitizeLocalWhatsappInput(extractLocalWhatsapp(profile?.whatsapp_number ?? '')))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const initialAvatar = profile?.avatar_url ?? listing?.sellerAvatar ?? ''
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { show: showToast } = useToast()

  useEffect(() => {
    setFullName(profile?.full_name ?? '')
    setProvince(profile?.province ?? '')
    setCity(profile?.city ?? '')
    setPreferredBike(profile?.preferred_bike ?? '')
    setInstagram(profile?.instagram_handle ?? '')
    setFacebook(profile?.facebook_handle ?? '')
    setWebsite(profile?.website_url ?? '')
    setBio(profile?.bio ?? '')
    // Detectar prefijo y número local desde el perfil
    const digits = String(profile?.whatsapp_number || '').replace(/[^0-9]/g, '')
    if (digits) {
      const sorted = [...COUNTRY_CODES].sort((a, b) => b.dial.length - a.dial.length)
      const match = sorted.find((c) => digits.startsWith(c.dial))
      if (match) {
        setWhatsappDial(match.dial)
        setWhatsappLocal(sanitizeLocalWhatsappInput(digits.slice(match.dial.length)))
      } else {
        setWhatsappDial('54')
        setWhatsappLocal(sanitizeLocalWhatsappInput(extractLocalWhatsapp(digits)))
      }
    } else {
      setWhatsappDial('54')
      setWhatsappLocal('')
    }
    setAvatarUrl(initialAvatar)
  }, [profile, initialAvatar])

  useEffect(() => {
    if (!success || typeof window === 'undefined') return
    const timeout = window.setTimeout(() => setSuccess(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [success])

  const cityOptions = province ? PROVINCES.find((item) => item.name === province)?.cities ?? [] : []
  const showCityOther = city === OTHER_CITY_OPTION

  const handleAvatarUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !userId) return
    setAvatarUploading(true)
    setAvatarError(null)
    try {
      const url = await uploadAvatar(fileList[0], userId)
      if (!url) throw new Error('No pudimos subir la imagen')
      const result = await upsertUserProfile({ id: userId, avatarUrl: url })
      if (!result.success) throw new Error(result.error ?? 'No pudimos actualizar la foto')
      if (supabaseEnabled) {
        const supabase = getSupabaseClient()
        await supabase.from('listings').update({ seller_avatar: url }).eq('seller_id', userId)
      }
      setAvatarUrl(url)
      if (onProfileUpdated) await onProfileUpdated()
      setSuccess('Se actualizó el perfil correctamente.')
      showToast('Se actualizó el perfil correctamente.')
    } catch (err: any) {
      setAvatarError(err?.message ?? 'No pudimos subir la imagen. Intentá nuevamente.')
    } finally {
      setAvatarUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const profileEmail = typeof profile?.email === 'string' ? profile.email.trim() : ''
    const fallbackEmail = typeof userEmail === 'string' ? userEmail.trim() : ''
    const listingEmail = typeof listing?.sellerEmail === 'string' ? listing.sellerEmail.trim() : ''
    const effectiveEmail = profileEmail || fallbackEmail || listingEmail || null
    if (!userId || !effectiveEmail) {
      setError('Necesitás una sesión activa para guardar cambios.')
      return
    }
    const finalCity = city === OTHER_CITY_OPTION ? cityOther.trim() : city
    if (!fullName.trim() || !province || !finalCity) {
      setError('Completá nombre, provincia y ciudad.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const formattedWhatsapp = whatsappLocal ? `${whatsappDial}${sanitizeLocalWhatsappInput(whatsappLocal)}` : null
      const result = await upsertUserProfile({
        id: userId,
        email: effectiveEmail,
        fullName: fullName.trim(),
        province,
        city: finalCity,
        profileSlug: deriveProfileSlug({
          fullName: fullName.trim(),
          discipline: pickDiscipline(preferredBike ? [preferredBike] : []),
          fallback: effectiveEmail.split('@')[0] ?? 'usuario'
        }),
        preferredBike: preferredBike || null,
        instagramHandle: instagram ? normaliseHandle(instagram) : null,
        facebookHandle: facebook ? normaliseUrl(facebook) : null,
        websiteUrl: website ? normaliseUrl(website) : null,
        bio: bio ? bio.trim() : null,
        whatsapp: formattedWhatsapp
      })
      if (!result.success) {
        throw new Error(result.error ?? 'No pudimos guardar tu perfil. Intentá nuevamente.')
      }
      if (onProfileUpdated) await onProfileUpdated()
      setSuccess('Se actualizó el perfil correctamente.')
      showToast('Se actualizó el perfil correctamente.')
    } catch (err: any) {
      setError(err?.message ?? 'No pudimos guardar tu perfil. Intentá nuevamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-[#14212e]">Editar perfil</h2>
      {success && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700" role="status" aria-live="polite">
          {success}
        </div>
      )}
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div>
          <p className="text-sm font-medium text-[#14212e]">Foto de perfil</p>
          <div className="mt-2 flex items-center gap-4">
            <div className="size-16 overflow-hidden rounded-2xl bg-[#14212e]/10">
              {avatarUrl ? (
                <img src={avatarUrl} alt={fullName || 'Vendedor'} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm text-[#14212e]/60">
                  {(fullName || 'CM')[0]}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={avatarUploading}>
                {avatarUploading ? 'Subiendo…' : 'Cambiar foto'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handleAvatarUpload(event.target.files)}
              />
              <span className="text-xs text-[#14212e]/60">Formatos JPG o PNG (máximo 5MB).</span>
              {avatarError && <span className="text-xs text-red-600">{avatarError}</span>}
            </div>
          </div>
        </div>

        <label className="text-sm font-medium text-[#14212e]">
          Nombre completo
          <input className="input mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre y apellido" />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-[#14212e]">
            Provincia
            <select className="select mt-1" value={province} onChange={(e) => { setProvince(e.target.value); setCity(''); setCityOther('') }}>
              <option value="">Seleccioná provincia</option>
              {PROVINCES.map((prov) => (
                <option key={prov.name} value={prov.name}>{prov.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-[#14212e]">
            Ciudad
            <select className="select mt-1" value={city} onChange={(e) => setCity(e.target.value)} disabled={!province}>
              <option value="">{province ? 'Seleccioná ciudad' : 'Elegí provincia primero'}</option>
              {cityOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
              <option value={OTHER_CITY_OPTION}>{OTHER_CITY_OPTION}</option>
            </select>
          </label>
        </div>

        {showCityOther && (
          <label className="text-sm font-medium text-[#14212e]">
            Ciudad (especificar)
            <input className="input mt-1" value={cityOther} onChange={(e) => setCityOther(e.target.value)} placeholder="Ingresá la ciudad" />
          </label>
        )}

        <label className="text-sm font-medium text-[#14212e]">
          Bicicleta preferida
          <select className="select mt-1" value={preferredBike} onChange={(e) => setPreferredBike(e.target.value)}>
            <option value="">Seleccioná una opción</option>
            {BIKE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-[#14212e]">
            Instagram (opcional)
            <input className="input mt-1" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@ciclomarket" />
          </label>
          <label className="text-sm font-medium text-[#14212e]">
            Facebook (opcional)
            <input className="input mt-1" value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="facebook.com/ciclomarket" />
          </label>
        </div>

        <label className="text-sm font-medium text-[#14212e]">
          Sitio web (opcional)
          <input className="input mt-1" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://tusitio.com" />
        </label>

        <label className="text-sm font-medium text-[#14212e]">
          Biografía (opcional)
          <textarea
            className="textarea mt-1"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Contá brevemente sobre tu experiencia como ciclista, tu estilo y lo que buscás en el marketplace."
            rows={4}
          />
          <span className="text-xs text-[#14212e]/60">Se mostrará en tu perfil público.</span>
        </label>
        {/* WhatsApp — único input */}
        <label className="text-sm font-medium text-[#14212e]">
          WhatsApp (privado)
          <div className="mt-1 flex items-center gap-1 sm:gap-2">
            <select
              className="select basis-[30%] w-full sm:w-28 sm:basis-auto shrink-0 text-center"
              value={whatsappDial}
              onChange={(e) => setWhatsappDial(e.target.value)}
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.cc} value={c.dial}>{`${c.flag} +${c.dial}`}</option>
              ))}
            </select>
            <input
              className="input basis-[70%] w-full sm:min-w-0 sm:flex-1 sm:max-w-[15ch]"
              inputMode="numeric"
              pattern="[0-9]*"
              value={whatsappLocal}
              onChange={(e) => { setWhatsappLocal(sanitizeLocalWhatsappInput(e.target.value)); setWhatsappEdited(true) }}
              placeholder="11 1234 5678"
            />
          </div>
          <span className="text-xs text-[#14212e]/60">Elegí el prefijo y escribí tu número sin el signo +.</span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className="bg-[#14212e] text-white hover:bg-[#1b2f3f]" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
          <span className="text-xs text-[#14212e]/60">Los cambios se reflejan en tu perfil público y publicaciones.</span>
        </div>
      </form>
    </div>
  )
}

type PlaceSuggestion = {
  placeId: string
  description: string
  primaryText: string
  secondaryText: string
}

function EditStoreView({ profile, userId, onStoreUpdated }: { profile: UserProfileRecord | null; userId?: string; onStoreUpdated?: () => Promise<void> | void }) {
  const [storeName, setStoreName] = useState(profile?.store_name ?? '')
  const [storeSlug, setStoreSlug] = useState(profile?.store_slug ?? '')
  const [storeAddress, setStoreAddress] = useState(profile?.store_address ?? '')
  const [storePhone, setStorePhone] = useState(profile?.store_phone ?? '')
  const [province, setProvince] = useState(profile?.province ?? '')
  const [city, setCity] = useState(profile?.city ?? '')
  const [cityOther, setCityOther] = useState('')
  const [storeInstagram, setStoreInstagram] = useState(profile?.store_instagram ?? '')
  const [storeFacebook, setStoreFacebook] = useState(profile?.store_facebook ?? '')
  const [storeWebsite, setStoreWebsite] = useState(profile?.store_website ?? '')
  const [storeBannerUrl, setStoreBannerUrl] = useState(profile?.store_banner_url ?? '')
  const [storeAvatarUrl, setStoreAvatarUrl] = useState(profile?.store_avatar_url ?? '')
  const [storeBannerPosY, setStoreBannerPosY] = useState<number>(typeof profile?.store_banner_position_y === 'number' ? (profile?.store_banner_position_y as number) : 50)
  const [storeHours, setStoreHours] = useState(profile?.store_hours ?? '')
  const [storeLat, setStoreLat] = useState<number | null>(typeof profile?.store_lat === 'number' ? profile.store_lat : null)
  const [storeLon, setStoreLon] = useState<number | null>(typeof profile?.store_lon === 'number' ? profile.store_lon : null)
  const COUNTRY_CODES = [
    { cc: 'AR', dial: '54', label: 'Argentina', flag: '🇦🇷' },
    { cc: 'PY', dial: '595', label: 'Paraguay', flag: '🇵🇾' },
    { cc: 'BR', dial: '55', label: 'Brasil', flag: '🇧🇷' },
    { cc: 'CL', dial: '56', label: 'Chile', flag: '🇨🇱' },
    { cc: 'UY', dial: '598', label: 'Uruguay', flag: '🇺🇾' },
    { cc: 'PE', dial: '51', label: 'Perú', flag: '🇵🇪' },
    { cc: 'VE', dial: '58', label: 'Venezuela', flag: '🇻🇪' },
    { cc: 'US', dial: '1', label: 'Estados Unidos', flag: '🇺🇸' },
  ] as const
  const [whatsappDial, setWhatsappDial] = useState<string>('54')
  const [whatsappLocal, setWhatsappLocal] = useState(() => sanitizeLocalWhatsappInput(extractLocalWhatsapp(profile?.whatsapp_number ?? '')))
  const [addressSuggestions, setAddressSuggestions] = useState<PlaceSuggestion[]>([])
  const [addressFocused, setAddressFocused] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)
  const [addressResolving, setAddressResolving] = useState(false)
  const [placesReady, setPlacesReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const { show: showToast } = useToast()
  const logoFileRef = useRef<HTMLInputElement | null>(null)
  const bannerFileRef = useRef<HTMLInputElement | null>(null)
  const autocompleteServiceRef = useRef<any | null>(null)
  const placesServiceRef = useRef<any | null>(null)
  const geocoderRef = useRef<any | null>(null)
  const blurTimeoutRef = useRef<number | null>(null)
  const googleRef = useRef<any | null>(typeof window !== 'undefined' ? window.google ?? null : null)
  const lastResolvedAddressRef = useRef<string | null>(profile?.store_address ?? null)
  const hasGoogleMapsKey = Boolean((import.meta as any)?.env?.VITE_GOOGLE_MAPS_KEY)

  useEffect(() => {
    setStoreName(profile?.store_name ?? '')
    setStoreSlug(profile?.store_slug ?? '')
    setStoreAddress(profile?.store_address ?? '')
    setStorePhone(profile?.store_phone ?? '')
    setProvince(profile?.province ?? '')
    setCity(profile?.city ?? '')
    setStoreInstagram(profile?.store_instagram ?? '')
    setStoreFacebook(profile?.store_facebook ?? '')
    setStoreWebsite(profile?.store_website ?? '')
    setStoreBannerUrl(profile?.store_banner_url ?? '')
    setStoreAvatarUrl(profile?.store_avatar_url ?? '')
    setStoreBannerPosY(typeof profile?.store_banner_position_y === 'number' ? profile!.store_banner_position_y! : 50)
    setStoreHours(profile?.store_hours ?? '')
    setStoreLat(typeof profile?.store_lat === 'number' ? profile.store_lat : null)
    setStoreLon(typeof profile?.store_lon === 'number' ? profile.store_lon : null)
    lastResolvedAddressRef.current = profile?.store_address ?? null
    setAddressSuggestions([])
    setAddressError(null)
    // Prefill WhatsApp breakdown
    const digits = String(profile?.whatsapp_number || '').replace(/[^0-9]/g, '')
    if (digits) {
      const sorted = [...COUNTRY_CODES].sort((a, b) => b.dial.length - a.dial.length)
      const match = sorted.find((c) => digits.startsWith(c.dial))
      if (match) {
        setWhatsappDial(match.dial)
        setWhatsappLocal(sanitizeLocalWhatsappInput(digits.slice(match.dial.length)))
      } else {
        setWhatsappDial('54')
        setWhatsappLocal(sanitizeLocalWhatsappInput(extractLocalWhatsapp(digits)))
      }
    } else {
      setWhatsappDial('54')
      setWhatsappLocal('')
    }
  }, [profile])

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const apiKey = (import.meta as any)?.env?.VITE_GOOGLE_MAPS_KEY as string | undefined
    if (!apiKey) return
    let active = true
    ;(async () => {
      try {
        const google = await loadGoogleMaps(apiKey, ['places'])
        if (!active) return
        googleRef.current = google
        autocompleteServiceRef.current = new google.maps.places.AutocompleteService()
        placesServiceRef.current = new google.maps.places.PlacesService(document.createElement('div'))
        geocoderRef.current = new google.maps.Geocoder()
        setPlacesReady(true)
      } catch (err) {
        console.warn('[EditStoreView] No se pudo inicializar Google Maps', err)
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!placesReady || !addressFocused) {
      if (!addressFocused) setAddressSuggestions([])
      return
    }
    const trimmed = storeAddress.trim()
    if (trimmed.length < 3) {
      setAddressSuggestions([])
      return
    }
    const handle = window.setTimeout(() => {
      const service = autocompleteServiceRef.current
      const google = googleRef.current
      if (!service || !google?.maps?.places) return
      service.getPlacePredictions(
        {
          input: trimmed,
          componentRestrictions: { country: ['ar', 'uy', 'py', 'br', 'cl', 'pe', 've'] },
          types: ['geocode'],
        },
        (predictions: any[], status: any) => {
          const statusOk = status === 'OK' || status === google.maps.places.PlacesServiceStatus?.OK
          if (!statusOk || !predictions?.length) {
            setAddressSuggestions([])
            return
          }
          setAddressSuggestions(predictions.map((p: any) => ({
            placeId: p.place_id,
            description: p.description,
            primaryText: p.structured_formatting?.main_text ?? p.description,
            secondaryText: p.structured_formatting?.secondary_text ?? '',
          })))
        }
      )
    }, 220)
    return () => window.clearTimeout(handle)
  }, [storeAddress, placesReady, addressFocused])

  const handleAddressInputChange = (value: string) => {
    setStoreAddress(value)
    setStoreLat(null)
    setStoreLon(null)
    lastResolvedAddressRef.current = null
    setAddressError(null)
  }

  const handleAddressFocus = () => {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = null
    }
    setAddressFocused(true)
  }

  const handleAddressBlur = () => {
    blurTimeoutRef.current = window.setTimeout(() => {
      setAddressFocused(false)
      setAddressSuggestions([])
    }, 120)
  }

  const resolvePlaceDetails = useCallback((placeId: string): Promise<{ lat: number; lon: number; address?: string } | null> => {
    const service = placesServiceRef.current
    const google = googleRef.current
    if (!service || !google?.maps?.places) return Promise.resolve(null)
    return new Promise((resolve) => {
      service.getDetails({ placeId, fields: ['geometry.location', 'formatted_address'] }, (place: any, status: any) => {
        const statusOk = status === 'OK' || status === google.maps.places.PlacesServiceStatus?.OK
        if (!statusOk || !place?.geometry?.location) {
          resolve(null)
          return
        }
        const loc = place.geometry.location
        const latValue = typeof loc.lat === 'function' ? loc.lat() : loc.lat
        const lonValue = typeof loc.lng === 'function' ? loc.lng() : loc.lng
        resolve({ lat: latValue, lon: lonValue, address: place.formatted_address ?? undefined })
      })
    })
  }, [])

  const ensureAddressCoordinates = useCallback((address: string): Promise<{ lat: number | null; lon: number | null }> => {
    const geocoder = geocoderRef.current
    const google = googleRef.current
    if (!geocoder || !google?.maps) return Promise.resolve({ lat: null, lon: null })
    return new Promise((resolve) => {
      geocoder.geocode({ address }, (results: any[], status: any) => {
        const statusOk = status === 'OK' || status === google.maps.GeocoderStatus?.OK
        if (statusOk && results?.[0]?.geometry?.location) {
          const location = results[0].geometry.location
          const latValue = typeof location.lat === 'function' ? location.lat() : location.lat
          const lonValue = typeof location.lng === 'function' ? location.lng() : location.lng
          resolve({ lat: latValue, lon: lonValue })
        } else {
          resolve({ lat: null, lon: null })
        }
      })
    })
  }, [])

  const handleAddressSelect = useCallback(async (suggestion: PlaceSuggestion) => {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = null
    }
    setAddressFocused(false)
    setAddressSuggestions([])
    setAddressError(null)
    setAddressResolving(true)
    try {
      const details = await resolvePlaceDetails(suggestion.placeId)
      if (details) {
        const formatted = details.address ?? suggestion.description
        setStoreAddress(formatted)
        setStoreLat(details.lat)
        setStoreLon(details.lon)
        lastResolvedAddressRef.current = formatted
      } else {
        setStoreAddress(suggestion.description)
        setStoreLat(null)
        setStoreLon(null)
        lastResolvedAddressRef.current = null
        setAddressError('No pudimos ubicar esa dirección automáticamente. Probá otra opción.')
      }
    } finally {
      setAddressResolving(false)
    }
  }, [resolvePlaceDetails])

  if (!profile?.store_enabled) {
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-[#14212e]">Tienda oficial</h2>
        <p className="text-sm text-[#14212e]/70">Tu cuenta aún no está habilitada como tienda oficial. Escribinos a <a href="mailto:admin@ciclomarket.ar" className="underline">admin@ciclomarket.ar</a> para solicitarla.</p>
      </div>
    )
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) { setError('Sesión inválida'); return }
    setSaving(true)
    setError(null)
    try {
      const slugSanitized = (storeSlug || storeName || '').toLowerCase().trim().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || null
      const trimmedAddress = storeAddress.trim()
      let finalLat = storeLat
      let finalLon = storeLon
      if (trimmedAddress) {
        const coordinatesStale = finalLat === null || finalLon === null || (lastResolvedAddressRef.current?.trim() ?? '') !== trimmedAddress
        if (coordinatesStale) {
          if (geocoderRef.current) {
            setAddressResolving(true)
            try {
              const coords = await ensureAddressCoordinates(trimmedAddress)
              if (coords.lat !== null && coords.lon !== null) {
                finalLat = coords.lat
                finalLon = coords.lon
                setStoreLat(coords.lat)
                setStoreLon(coords.lon)
                lastResolvedAddressRef.current = trimmedAddress
                setAddressError(null)
              } else {
                setAddressError('No pudimos ubicar esa dirección automáticamente. Revisá la dirección antes de guardar.')
              }
            } finally {
              setAddressResolving(false)
            }
          }
        }
      } else {
        finalLat = null
        finalLon = null
        setStoreLat(null)
        setStoreLon(null)
        lastResolvedAddressRef.current = null
      }

      const finalCity = city === OTHER_CITY_OPTION ? cityOther.trim() : city
      const formattedWhatsapp = whatsappLocal ? `${whatsappDial}${sanitizeLocalWhatsappInput(whatsappLocal)}` : null
      const { success: ok, error: err } = await upsertUserProfile({
        id: userId,
        province,
        city: finalCity,
        whatsapp: formattedWhatsapp,
        storeName: storeName.trim() || null,
        storeSlug: slugSanitized,
        storeAddress: trimmedAddress || null,
        storePhone: storePhone.trim() || null,
        storeInstagram: storeInstagram ? normaliseHandle(storeInstagram) : null,
        storeFacebook: storeFacebook ? normaliseUrl(storeFacebook) : null,
        storeWebsite: storeWebsite ? normaliseUrl(storeWebsite) : null,
        storeBannerUrl: storeBannerUrl ? normaliseUrl(storeBannerUrl) : null,
        storeAvatarUrl: storeAvatarUrl ? normaliseUrl(storeAvatarUrl) : null,
        storeBannerPositionY: Number.isFinite(storeBannerPosY) ? storeBannerPosY : 50,
        storeHours: storeHours.trim() || null,
        storeLat: finalLat ?? null,
        storeLon: finalLon ?? null,
      })
      if (!ok) throw new Error(err || 'No pudimos guardar los cambios')
      if (onStoreUpdated) await onStoreUpdated()
      setSuccess('Se actualizó la tienda correctamente.')
      showToast('Se actualizó la tienda correctamente.')
    } catch (e: any) {
      setError(e?.message || 'No pudimos guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <h2 className="text-xl font-semibold text-[#14212e]">Editar tienda</h2>
      {success && <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <label className="text-sm font-medium text-[#14212e]">
        Nombre de la tienda
        <input className="input mt-1" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Mi Bici Shop" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-[#14212e]">
          Provincia
          <select className="select mt-1" value={province} onChange={(e) => { setProvince(e.target.value); setCity(''); setCityOther('') }}>
            <option value="">Seleccioná provincia</option>
            {PROVINCES.map((prov) => (
              <option key={prov.name} value={prov.name}>{prov.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-[#14212e]">
          Ciudad
          <select className="select mt-1" value={city} onChange={(e) => setCity(e.target.value)} disabled={!province}>
            <option value="">{province ? 'Seleccioná ciudad' : 'Elegí provincia primero'}</option>
            {(province ? (PROVINCES.find((p) => p.name === province)?.cities ?? []) : []).map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
            <option value={OTHER_CITY_OPTION}>{OTHER_CITY_OPTION}</option>
          </select>
        </label>
      </div>
      {city === OTHER_CITY_OPTION && (
        <label className="text-sm font-medium text-[#14212e]">
          Ciudad (especificar)
          <input className="input mt-1" value={cityOther} onChange={(e) => setCityOther(e.target.value)} placeholder="Ingresá la ciudad" />
        </label>
      )}
      <label className="text-sm font-medium text-[#14212e]">
        Slug
        <input className="input mt-1" value={storeSlug} onChange={(e) => setStoreSlug(e.target.value)} placeholder="mi-bici-shop" />
        <span className="text-xs text-[#14212e]/60">URL: ciclomarket.ar/tienda/{(storeSlug || storeName || 'mi-bici-shop').toLowerCase().replace(/[^a-z0-9-_]+/g, '-')}</span>
      </label>
      <div className="text-sm font-medium text-[#14212e]">
        <label htmlFor="store-address" className="block">Dirección del local</label>
        <div className="relative mt-1">
          <input
            id="store-address"
            className="input w-full"
            value={storeAddress}
            onChange={(e) => handleAddressInputChange(e.target.value)}
            onFocus={handleAddressFocus}
            onBlur={handleAddressBlur}
            placeholder="Calle 123, Ciudad, Provincia"
            autoComplete="off"
          />
          {placesReady && addressFocused && addressSuggestions.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-[#14212e]/10 bg-white text-[#14212e] shadow-lg">
              {addressSuggestions.map((suggestion) => (
                <li key={suggestion.placeId}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-0.5 px-4 py-2 text-left text-sm hover:bg-[#14212e]/5"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleAddressSelect(suggestion)}
                  >
                    <span className="font-medium">{suggestion.primaryText}</span>
                    {suggestion.secondaryText ? (
                      <span className="text-xs text-[#14212e]/70">{suggestion.secondaryText}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {addressResolving && <span className="mt-1 block text-xs text-[#14212e]/60">Buscando ubicación…</span>}
        {typeof storeLat === 'number' && typeof storeLon === 'number' && !addressResolving && (
          <span className="mt-1 block text-xs text-[#14212e]/60">Ubicación detectada: {storeLat.toFixed(5)}, {storeLon.toFixed(5)}</span>
        )}
        {addressError && <span className="mt-1 block text-xs text-red-600">{addressError}</span>}
        {!hasGoogleMapsKey && (
          <span className="mt-1 block text-xs text-[#14212e]/50">Para obtener sugerencias en vivo añadí tu clave de Google Maps en la configuración.</span>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-[#14212e]">
          Teléfono del local
          <input className="input mt-1" value={storePhone} onChange={(e) => setStorePhone(e.target.value)} placeholder="+54 11 5555-5555" />
        </label>
        <label className="text-sm font-medium text-[#14212e]">
          WhatsApp
          <div className="mt-1 flex items-center gap-1 sm:gap-2">
            <select
              className="select basis-[30%] w-full sm:w-28 sm:basis-auto shrink-0 text-center"
              value={whatsappDial}
              onChange={(e) => setWhatsappDial(e.target.value)}
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.cc} value={c.dial}>{`${c.flag} +${c.dial}`}</option>
              ))}
            </select>
            <input
              className="input basis-[70%] w-full sm:min-w-0 sm:flex-1 sm:max-w-[15ch]"
              inputMode="numeric"
              pattern="[0-9]*"
              value={whatsappLocal}
              onChange={(e) => setWhatsappLocal(sanitizeLocalWhatsappInput(e.target.value))}
              placeholder="11 1234 5678"
            />
          </div>
          <span className="text-xs text-[#14212e]/60">Elegí el prefijo y escribí tu número sin el signo +.</span>
        </label>
        <label className="text-sm font-medium text-[#14212e]">
          Logo / Avatar
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-[#14212e]/20 px-3 py-2 text-sm text-[#14212e] hover:bg-[#14212e]/5"
              onClick={() => logoFileRef.current?.click()}
            >
              Subir logo
            </button>
            <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f || !userId) return
              try {
                setSaving(true)
                const url = await uploadStoreAvatar(f, userId)
                if (url) setStoreAvatarUrl(url)
                showToast('Logo subido correctamente')
              } catch (err: any) {
                setError(err?.message || 'No pudimos subir el logo')
              } finally {
                setSaving(false)
                if (logoFileRef.current) logoFileRef.current.value = ''
              }
            }} />
            {storeAvatarUrl && (
              <img src={storeAvatarUrl} alt="Logo" className="h-12 w-12 rounded-full object-cover border border-[#14212e]/10" />
            )}
          </div>
        </label>
        <label className="text-sm font-medium text-[#14212e]">
          Banner
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-[#14212e]/20 px-3 py-2 text-sm text-[#14212e] hover:bg-[#14212e]/5"
              onClick={() => bannerFileRef.current?.click()}
            >
              Subir imagen
            </button>
            <input ref={bannerFileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f || !userId) return
              try {
                setSaving(true)
                const url = await uploadStoreBanner(f, userId)
                if (url) setStoreBannerUrl(url)
                showToast('Banner subido correctamente')
              } catch (err: any) {
                setError(err?.message || 'No pudimos subir el banner')
              } finally {
                setSaving(false)
                if (bannerFileRef.current) bannerFileRef.current.value = ''
              }
            }} />
            {storeBannerUrl && (
              <img src={storeBannerUrl} alt="Banner" className="h-10 w-20 rounded object-cover border border-[#14212e]/10" />
            )}
          </div>
          <div className="mt-3">
            <label className="text-xs font-medium text-[#14212e]">Posición vertical del banner (0–100)</label>
            <input type="range" min={0} max={100} value={storeBannerPosY}
              onChange={(e) => setStoreBannerPosY(Number(e.target.value))}
              className="mt-1 w-full" />
            <div className="mt-1 text-xs text-[#14212e]/60">Actual: {Math.round(storeBannerPosY)}%</div>
          </div>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-medium text-[#14212e]">
          Instagram
          <input className="input mt-1" value={storeInstagram} onChange={(e) => setStoreInstagram(e.target.value)} placeholder="@tutienda" />
        </label>
        <label className="text-sm font-medium text-[#14212e]">
          Facebook
          <input className="input mt-1" value={storeFacebook} onChange={(e) => setStoreFacebook(e.target.value)} placeholder="facebook.com/tutienda" />
        </label>
        <label className="text-sm font-medium text-[#14212e]">
          Sitio web
          <input className="input mt-1" value={storeWebsite} onChange={(e) => setStoreWebsite(e.target.value)} placeholder="https://tutienda.com" />
        </label>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium text-[#14212e]">
          Horarios de atención
          <textarea
            className="input mt-1 h-28"
            value={storeHours}
            onChange={(e) => setStoreHours(e.target.value)}
            placeholder={"Lun a Vie 10–19\nSáb 10–14"}
          />
          <span className="text-xs text-[#14212e]/60">Texto libre. Por ejemplo: “Lun a Vie 10–19 · Sáb 10–14”.</span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" className="bg-[#14212e] text-white hover:bg-[#1b2f3f]" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        {profile?.store_slug && (
          <Link to={`/tienda/${profile.store_slug}`} className="text-sm text-mb-primary underline">Ver mi tienda</Link>
        )}
      </div>
    </form>
  )
}

function SubscriptionView({ listings }: { listings: Listing[] }) {
  const navigate = useNavigate()
  const { plans, activeSubscription, loading, cancelSubscription, updateAutoRenew } = usePlans()
  const { user } = useAuth()
  const [isStore, setIsStore] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        if (!user?.id) { setIsStore(false); return }
        const profile = await fetchUserProfile(user.id)
        if (!active) return
        setIsStore(Boolean(profile?.store_enabled))
      } catch {
        if (active) setIsStore(false)
      }
    })()
    return () => { active = false }
  }, [user?.id])
  const [updatingAuto, setUpdatingAuto] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  if (loading) {
    return <div className="py-10 text-center text-[#14212e]/60">Cargando información de tu plan…</div>
  }

  if (isStore) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <h2 className="text-xl font-semibold text-[#14212e]">Tienda oficial habilitada</h2>
        <p className="max-w-md text-sm text-[#14212e]/70">Tu cuenta de tienda tiene publicaciones ilimitadas y sin vencimiento. No necesitás planes pagos.</p>
        <div className="flex gap-3">
          <Button className="bg-[#14212e] text-white hover:bg-[#1b2f3f]" onClick={() => navigate('/publicar')}>
            Crear nueva publicación
          </Button>
          <Button variant="ghost" onClick={() => navigate('/dashboard?tab=Editar%20tienda')}>Editar tienda</Button>
        </div>
      </div>
    )
  }

  const plan = activeSubscription?.plan || plans.find((p) => p.id === activeSubscription?.planId)

  if (!plan || !activeSubscription) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <h2 className="text-xl font-semibold text-[#14212e]">No tenés un plan activo</h2>
        <p className="max-w-md text-sm text-[#14212e]/70">
          Elegí uno de nuestros planes para habilitar publicaciones, destaque y contacto preferencial.
        </p>
        <Button className="bg-[#14212e] text-white hover:bg-[#1b2f3f]" onClick={() => navigate('/publicar')}>
          Ver planes disponibles
        </Button>
      </div>
    )
  }

  const formattedEndsAt = activeSubscription.endsAt
    ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(activeSubscription.endsAt))
    : null
  const listingsCount = listings.length
  const hasQuotaLimit = plan.maxListings !== undefined && plan.maxListings > 1
  const remainingListings = hasQuotaLimit ? Math.max(plan.maxListings - listingsCount, 0) : null
  const autoRenewEnabled = activeSubscription.autoRenew ?? true

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[#14212e]/10 bg-white p-6 shadow">
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-[0.3em] text-[#14212e]/50">Plan actual</span>
          <h2 className="text-2xl font-semibold text-[#14212e]">{plan.name}</h2>
          <p className="text-sm text-[#14212e]/70">Estado: {activeSubscription.status === 'active' ? 'Activo' : activeSubscription.status}</p>
          {formattedEndsAt && (
            <p className="text-sm text-[#14212e]/70">Renueva el {formattedEndsAt}</p>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <PlanStat
            label="Publicaciones incluidas"
            value={hasQuotaLimit ? `${plan.maxListings}` : 'Por publicación'}
            helper={hasQuotaLimit ? `${remainingListings} disponibles actualmente` : 'Contratás un plan por cada aviso publicado.'}
          />
          <PlanStat label="Fotos por publicación" value={plan.maxPhotos?.toString() ?? 'Sin límite'} />
          <PlanStat label="Destacados" value={plan.featuredDays ? `${plan.featuredDays} ${plan.featuredDays === 1 ? 'día' : 'días'}` : 'No incluye'} />
          <PlanStat label="WhatsApp" value={plan.whatsappEnabled ? 'Habilitado' : 'No incluido'} />
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-[#14212e]/80">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoRenewEnabled}
                disabled={updatingAuto}
                onChange={async () => {
                  setUpdatingAuto(true)
                  await updateAutoRenew(!autoRenewEnabled)
                  setUpdatingAuto(false)
                }}
              />
              Renovación automática
            </label>
            {updatingAuto && <span>Actualizando…</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => navigate('/publicar')}>
              Cambiar plan
            </Button>
            <Button
              variant="ghost"
              className="text-red-600"
              disabled={cancelling}
              onClick={async () => {
                setCancelling(true)
                await cancelSubscription()
                setCancelling(false)
              }}
            >
              {cancelling ? 'Cancelando…' : 'Cancelar plan'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function VerifyProfileView({ profile, userEmail }: { profile: UserProfileRecord | null; userEmail?: string | null }) {
  const { user } = useAuth()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [instagram, setInstagram] = useState(profile?.instagram_handle ?? '')
  const defaultPhone = profile?.whatsapp_number || (typeof user?.user_metadata?.whatsapp === 'string' ? user?.user_metadata?.whatsapp : '') || (typeof user?.user_metadata?.phone === 'string' ? user?.user_metadata?.phone : '') || ''
  const [phone, setPhone] = useState(defaultPhone)
  const [email, setEmail] = useState(userEmail || profile?.email || '')
  const [message, setMessage] = useState('Hola! Quiero verificar mi perfil. Adjunto fotos de mi DNI o carnet de conducir para validar mi identidad.')
  const [files, setFiles] = useState<File[]>([])
  const { uploadFiles, uploading, progress } = useUpload()
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const alreadyVerified = Boolean(profile?.verified)

  const onFileChange = (list: FileList | null) => {
    if (!list || list.length === 0) return
    const arr = Array.from(list).slice(0, 6)
    setFiles(arr)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError('Completá nombre, email y mensaje.')
      return
    }
    setSubmitting(true)
    try {
      let attachmentUrls: string[] = []
      if (files.length > 0) {
        attachmentUrls = await uploadFiles(files)
      }
      const ok = await (await import('../services/verification')).submitVerificationRequest({
        name: name.trim(),
        instagram: instagram.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim(),
        message: message.trim(),
        attachments: attachmentUrls,
      })
      if (!ok) {
        setError('No pudimos enviar tu solicitud. Intentá nuevamente en unos minutos.')
        return
      }
      setSuccess('¡Enviado! Nuestro equipo revisará tu solicitud y te contactará a la brevedad.')
      setFiles([])
    } catch (err) {
      setError('Ocurrió un problema al enviar la solicitud.')
    } finally {
      setSubmitting(false)
    }
  }

  if (alreadyVerified) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <h2 className="text-xl font-semibold text-[#14212e]">Ustedes ya es verificado, ¡comenzá a vender ahora mismo!</h2>
        <Button to="/publicar" className="bg-[#14212e] text-white hover:bg-[#1b2f3f]">Publicar nuevo aviso</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-[#14212e]">Verificá tu perfil</h2>
        <p className="text-sm text-[#14212e]/70">Completá tus datos y adjuntá fotos de tu DNI o carnet de conducir para validar tu identidad.</p>
      </div>
      {success && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700" role="status">{success}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="status">{error}</div>
      )}
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <label className="text-sm font-medium text-[#14212e]">
          Nombre
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" required />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-[#14212e]">
            Instagram (opcional)
            <input className="input mt-1" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@tuusuario" />
          </label>
          <label className="text-sm font-medium text-[#14212e]">
            Teléfono (opcional)
            <input className="input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Tu número de contacto" />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-[#14212e]">
            Email
            <input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" required />
          </label>
          <div>
            <p className="text-sm font-medium text-[#14212e]">Adjuntar fotos</p>
            <input className="mt-1 block w-full text-sm" type="file" accept="image/*" multiple onChange={(e) => onFileChange(e.target.files)} />
            {files.length > 0 && (
              <p className="mt-1 text-xs text-[#14212e]/60">{files.length} archivo{files.length===1?'':'s'} seleccionado{files.length===1?'':'s'}</p>
            )}
            {uploading && (
              <p className="mt-1 text-xs text-[#14212e]/60">Subiendo adjuntos… {progress}%</p>
            )}
            <p className="mt-1 text-xs text-[#14212e]/60">Adjuntá fotos de tu DNI o carnet de conducir para validar tu identidad.</p>
          </div>
        </div>
        <label className="text-sm font-medium text-[#14212e]">
          Mensaje
          <textarea className="textarea mt-1" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Contanos por qué querés verificar tu cuenta" required />
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" className="bg-[#14212e] text-white hover:bg-[#1b2f3f]" disabled={submitting || uploading}>
            {submitting ? 'Enviando…' : 'Enviar solicitud'}
          </Button>
          <span className="text-xs text-[#14212e]/60">Tu solicitud se enviará a admin@ciclomarket.ar</span>
        </div>
      </form>
    </div>
  )
}

function PlanStat({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-2xl border border-[#14212e]/10 bg-[#14212e]/5 p-4">
      <p className="text-xs uppercase tracking-wide text-[#14212e]/50">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[#14212e]">{value}</p>
      {helper && <p className="text-xs text-[#14212e]/60">{helper}</p>}
    </div>
  )
}

function SignOutView({ onSignOut }: { onSignOut: () => Promise<void> | void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <h2 className="text-xl font-semibold text-[#14212e]">¿Cerrar sesión?</h2>
      <p className="max-w-sm text-sm text-[#14212e]/70">
        Se cerrará tu sesión en este dispositivo. La próxima vez ingresá con tu email y contraseña o utilizá ingreso con Google.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="bg-[#14212e] text-white hover:bg-[#1b2f3f]" onClick={() => onSignOut()}>
          Cerrar sesión ahora
        </Button>
        <Button variant="ghost">Cancelar</Button>
      </div>
    </div>
  )
}

function ProfileStat({ label, value, trend }: { label: string; value: ReactNode; trend?: ReactNode }) {
  const isPrimitiveValue = typeof value === 'string' || typeof value === 'number'
  const isPrimitiveTrend = typeof trend === 'string' || typeof trend === 'number'

  return (
    <div className="rounded-2xl border border-[#14212e]/10 bg-white p-5 shadow">
      <p className="text-xs uppercase tracking-wide text-[#14212e]/50">{label}</p>
      {isPrimitiveValue ? (
        <div className="mt-2 text-2xl font-bold text-[#14212e]">{value}</div>
      ) : (
        <div className="mt-2 text-sm font-medium text-[#14212e]">{value}</div>
      )}
      {trend && (
        isPrimitiveTrend ? (
          <p className="text-xs text-[#14212e]/60">{trend}</p>
        ) : (
          <div className="mt-2">{trend}</div>
        )
      )}
    </div>
  )
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className={`h-4 w-4 ${filled ? 'text-[#f59e0b]' : 'text-[#14212e]/30'}`}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
      aria-hidden="true"
    >
      <path
        d="M11.48 3.5c.3-.92 1.74-.92 2.04 0l1.45 4.42c.14.43.54.72.99.72h4.63c.96 0 1.36 1.24.58 1.8l-3.74 2.72c-.37.27-.53.75-.38 1.17l1.43 4.42c.3.92-.75 1.69-1.53 1.13l-3.76-2.72a1.05 1.05 0 00-1.23 0l-3.76 2.72c-.78.56-1.83-.21-1.53-1.13l1.43-4.42a1.05 1.05 0 00-.38-1.17L3.83 10.44c-.78-.56-.38-1.8.58-1.8h4.63c.45 0 .85-.29.99-.72l1.45-4.42z"
      />
    </svg>
  )
}
