import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Container from '../components/Container'
import ListingCard from '../components/ListingCard'
import Button from '../components/Button'
import ReviewModal from '../components/ReviewModal'
import { fetchUserProfile, type UserProfileRecord } from '../services/users'
import { fetchSellerReviews, canUserReviewSeller, submitReview, type ReviewRecord } from '../services/reviews'
import { useToast } from '../context/ToastContext'
import { fetchListingsBySeller } from '../services/listings'
import { supabaseEnabled } from '../services/supabase'
import { mockListings } from '../mock/mockData'
import type { Listing } from '../types'
import { computeTrustLevel, trustLabel, trustColorClasses, trustDescription, trustBadgeBgClasses } from '../utils/user'
import { useAuth } from '../context/AuthContext'
import { fetchMyCredits, fetchCreditsHistory, type Credit } from '../services/credits'

const TABS = ['Perfil', 'Publicaciones', 'Reseñas', 'Intereses'] as const
const TAB_METADATA: Record<(typeof TABS)[number], { title: string; description: string }> = {
  Perfil: {
    title: 'Perfil del vendedor',
    description: 'Reputación e información pública del vendedor',
  },
  Publicaciones: {
    title: 'Publicaciones',
    description: 'Avisos publicados por este vendedor',
  },
  Reseñas: {
    title: 'Reseñas',
    description: 'Experiencias de otros compradores con este vendedor',
  },
  Intereses: {
    title: 'Intereses',
    description: 'Preferencias y disciplinas favoritas del vendedor',
  },
}

type SellerTab = (typeof TABS)[number]

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

function relativeTimeFromNow(value?: string | null): string {
  if (!value) return ''
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

function normaliseUrl(url?: string | null) {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed.replace(/^https?:\/\//i, '')}`
}

function instagramUrl(value?: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const handle = trimmed.replace(/^@+/, '')
  if (!handle) return null
  return `https://instagram.com/${handle}`
}

function facebookUrl(value?: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://facebook.com/${trimmed.replace(/^@+/, '')}`
}

export default function Profile() {
  const { sellerId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, isModerator } = useAuth()
  const { show: showToast } = useToast()
  const isMobile = useIsMobile()
  const reviewParam = String(searchParams.get('review') || '').trim().toLowerCase()
  const wantsReview = reviewParam === '1' || reviewParam === 'true'
  const ratingFromUrl = useMemo(() => {
    const raw = Number.parseInt(String(searchParams.get('rating') || ''), 10)
    if (!Number.isFinite(raw)) return 0
    return Math.min(Math.max(raw, 1), 5)
  }, [searchParams])

  const [activeTab, setActiveTab] = useState<SellerTab>('Perfil')
  const [mobileActiveTab, setMobileActiveTab] = useState<SellerTab | null>(null)
  const [profile, setProfile] = useState<UserProfileRecord | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviews, setReviews] = useState<ReviewRecord[]>([])
  const [reviewsSummary, setReviewsSummary] = useState<
    { count: number; avgRating: number; dist?: Record<number, number>; tagsCount?: Record<string, number> } | null
  >(null)
  const [canReview, setCanReview] = useState<{ allowed: boolean; reason?: string } | null>(null)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewIsVerifiedSale, setReviewIsVerifiedSale] = useState(false)
  const [reviewTags, setReviewTags] = useState<string[]>([])
  const [reviewComment, setReviewComment] = useState('')
  // Moderador: créditos e info ampliada
  const [modAvailableCredits, setModAvailableCredits] = useState<Credit[] | null>(null)
  const [modCreditHistory, setModCreditHistory] = useState<Credit[] | null>(null)

  const handleSelectTab = useCallback((tab: SellerTab) => {
    setActiveTab(tab)
    if (isMobile) {
      setMobileActiveTab(tab)
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        })
      }
    }
  }, [isMobile])

  useEffect(() => {
    if (!sellerId) {
      setError('Vendedor no encontrado.')
      setLoading(false)
      return
    }

    let active = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        if (supabaseEnabled) {
          const [profileData, listingsData, reviewsData] = await Promise.all([
            fetchUserProfile(sellerId),
            fetchListingsBySeller(sellerId, { includeArchived: Boolean(isModerator) }),
            fetchSellerReviews(sellerId),
          ])
          if (!active) return
          setProfile(profileData)
          setListings(listingsData)
          if (reviewsData) {
            setReviews(reviewsData.reviews)
            setReviewsSummary({
              count: reviewsData.summary.count,
              avgRating: reviewsData.summary.avgRating,
              dist: reviewsData.summary.dist,
              tagsCount: reviewsData.summary.tagsCount,
            })
          }
        } else {
          const sellerListings = mockListings.filter((item) => item.sellerId === sellerId)
          if (!active) return
          setListings(sellerListings)
          if (sellerListings.length > 0) {
            const listing = sellerListings[0]
            setProfile({
              id: sellerId,
              email: '',
              full_name: listing.sellerName,
              city: listing.sellerLocation ?? undefined,
              province: undefined,
              avatar_url: listing.sellerAvatar ?? undefined,
            })
          }
        }
      } catch (err: any) {
        if (!active) return
        console.error('[seller-profile] load failed', err)
        setError('No pudimos cargar los datos del vendedor.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [sellerId, isModerator])

  useEffect(() => {
    if (!user?.id || !sellerId) {
      setCanReview(null)
      return
    }
    void (async () => {
      const result = await canUserReviewSeller(user.id, sellerId)
      setCanReview(result)
    })()
  }, [user?.id, sellerId])

  // Cargar créditos del vendedor si el usuario actual es moderador
  useEffect(() => {
    if (!isModerator || !sellerId) {
      setModAvailableCredits(null)
      setModCreditHistory(null)
      return
    }
    let active = true
    ;(async () => {
      try {
        const [avail, history] = await Promise.all([
          fetchMyCredits(sellerId),
          fetchCreditsHistory(sellerId),
        ])
        if (!active) return
        setModAvailableCredits(avail)
        setModCreditHistory(history)
      } catch {
        if (!active) return
        setModAvailableCredits([])
        setModCreditHistory([])
      }
    })()
    return () => { active = false }
  }, [isModerator, sellerId])

  useEffect(() => {
    if (!isMobile) {
      setMobileActiveTab(null)
    }
  }, [isMobile])

  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam && TABS.includes(tabParam as SellerTab)) {
      const tab = tabParam as SellerTab
      setActiveTab(tab)
      if (isMobile) setMobileActiveTab(tab)
    }
  }, [searchParams, isMobile])

  useEffect(() => {
    if (!sellerId) return
    if (!wantsReview) return
    handleSelectTab('Reseñas')
    if (ratingFromUrl > 0 && reviewRating <= 0) {
      setReviewRating(ratingFromUrl)
    }
    const t = setTimeout(() => {
      if (canReview?.allowed) setReviewModalOpen(true)
    }, 100)
    return () => clearTimeout(t)
  }, [sellerId, wantsReview, canReview?.allowed, handleSelectTab, ratingFromUrl, reviewRating])

  useEffect(() => {
    if (!reviewModalOpen) return
    const next = new URLSearchParams(searchParams)
    let changed = false
    if (next.has('review')) {
      next.delete('review')
      changed = true
    }
    if (next.has('rating')) {
      next.delete('rating')
      changed = true
    }
    if (changed) setSearchParams(next, { replace: true })
  }, [reviewModalOpen, searchParams, setSearchParams])

  const displayName = profile?.full_name || listings[0]?.sellerName || 'Vendedor Ciclo Market'
  const displayNameAbbrev = useMemo(() => {
    const full = String(displayName || '').trim()
    if (!full) return 'Vendedor Ciclo Market'
    const parts = full.split(/\s+/).filter(Boolean)
    if (parts.length === 1) return parts[0]
    const first = parts[0]
    const lastInit = parts[1]?.charAt(0).toUpperCase()
    return lastInit ? `${first} ${lastInit}.` : first
  }, [displayName])
  const avatarUrl = profile?.avatar_url || listings[0]?.sellerAvatar || null
  const trustLevel = computeTrustLevel(profile, reviewsSummary ? { count: reviewsSummary.count, avgRating: reviewsSummary.avgRating } : undefined)
  const totalListings = listings.length
  const activeListings = useMemo(
    () => listings.filter((item) => !item.status || item.status === 'active'),
    [listings]
  )
  const viewerIsOwner = useMemo(() => Boolean(user?.id && sellerId && user.id === sellerId), [user?.id, sellerId])
  const viewerCanSeeAll = viewerIsOwner || Boolean(isModerator)
  const publicListings = useMemo(() => {
    const now = Date.now()
    return listings.filter((l) => {
      const byStatus = l.status === 'expired' || l.status === 'deleted' || l.status === 'archived'
      const byDate = typeof l.expiresAt === 'number' && l.expiresAt > 0 && l.expiresAt < now
      return !(byStatus || byDate)
    })
  }, [listings])
  const listingsVisible = viewerCanSeeAll ? listings : publicListings
  const locationLabel = useMemo(() => {
    if (!profile) return listings[0]?.sellerLocation ?? 'Ubicación reservada'
    const city = profile.city?.trim()
    const province = profile.province?.trim()
    if (city && province) return `${city}, ${province}`
    if (city) return city
    return listings[0]?.sellerLocation ?? 'Ubicación reservada'
  }, [profile, listings])

  const instagramLink = instagramUrl(profile?.instagram_handle)
  const facebookLink = facebookUrl(profile?.facebook_handle)
  const websiteLink = normaliseUrl(profile?.website_url)
  const stravaProfileUrl = profile?.website_url && profile.website_url.toLowerCase().includes('strava.com')
    ? normaliseUrl(profile.website_url)
    : null

  const memberSinceLabel = useMemo(() => {
    if (!profile?.created_at) return null
    const created = new Date(profile.created_at)
    if (Number.isNaN(created.getTime())) return null
    return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(created)
  }, [profile?.created_at])

  const latestListing = listings[0]
  const lastUpdatedLabel = latestListing?.createdAt
    ? relativeTimeFromNow(new Date(latestListing.createdAt).toISOString())
    : null

  const renderSection = useCallback((tab: SellerTab) => {
    switch (tab) {
      case 'Perfil':
        return (
          <div className="space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="size-28 overflow-hidden rounded-3xl border border-[#14212e]/10 bg-[#14212e]/5">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-[#14212e]/60">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                <h2 className="text-2xl font-semibold text-[#14212e] flex items-center gap-2">
                  {displayName}
                  {(() => {
                    const c = trustColorClasses(trustLevel)
                    return (
                      <span className={`relative -top-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[12px] leading-none font-semibold ${trustBadgeBgClasses(trustLevel)} text-white border-[#0f1924]`}>
                        {trustLabel(trustLevel, 'short')}
                      </span>
                    )
                  })()}
                </h2>
                  <p className="mt-1 text-sm text-[#14212e]/70">{locationLabel}</p>
                  {lastUpdatedLabel && (
                    <p className="mt-1 text-xs text-[#14212e]/50">Última actividad {lastUpdatedLabel}</p>
                  )}
                </div>
              </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <ProfileStat label="Publicaciones activas" value={activeListings.length} trend="Visibles en el marketplace" />
              <ProfileStat label="Todas las publicaciones" value={totalListings} trend="Historial desde que se unió" />
              <ProfileStat
                label="Reputación"
                value={reviewsSummary ? `${reviewsSummary.avgRating.toFixed(1)}★` : '—'}
                trend={reviewsSummary ? `${reviewsSummary.count} reseñas` : 'Sin reseñas aún'}
              />
            </div>

            <div className="rounded-2xl border border-[#14212e]/10 bg-[#f2f6fb] p-4">
              <p className="text-xs uppercase tracking-wide text-[#14212e]/50">Nivel de confianza</p>
              <div className="mt-1 flex items-center gap-2 text-[#14212e]">
                {(() => {
                  const c = trustColorClasses(trustLevel)
                  return (
                    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[12px] leading-none font-semibold ${trustBadgeBgClasses(trustLevel)} text-white border-[#0f1924]`}>
                      {trustLabel(trustLevel, 'long')}
                    </span>
                  )
                })()}
              </div>
              <p className="mt-1 text-sm text-[#14212e]/70">{trustDescription(trustLevel)}</p>
            </div>

            {/* Panel de moderación (solo visible para moderadores) */}
            {isModerator && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs uppercase tracking-wide text-amber-700">Panel de moderación</p>
                <div className="mt-2 space-y-1 text-sm text-[#14212e]/80">
                  {profile?.email ? (
                    <div><span className="font-medium">Email:</span> {profile.email}</div>
                  ) : null}
                  {(() => {
                    const avail = Array.isArray(modAvailableCredits) ? modAvailableCredits : []
                    const byPlan = avail.reduce<Record<string, number>>((acc, c) => {
                      acc[c.plan_code] = (acc[c.plan_code] || 0) + 1
                      return acc
                    }, {})
                    const basic = byPlan['basic'] || 0
                    const premium = byPlan['premium'] || 0
                    return (
                      <div><span className="font-medium">Créditos disponibles:</span> Básico {basic} · Premium {premium}</div>
                    )
                  })()}
                  {(() => {
                    const hist = Array.isArray(modCreditHistory) ? modCreditHistory : []
                    const pending = hist.filter((c) => c.status === 'pending').length
                    const used = hist.filter((c) => c.status === 'used').length
                    const cancelled = hist.filter((c) => c.status === 'cancelled').length
                    return (
                      <div className="text-xs text-[#14212e]/60">Pendientes {pending} · Usados {used} · Cancelados {cancelled}</div>
                    )
                  })()}
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {instagramLink && (
                <a
                  href={instagramLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-2xl border border-[#14212e]/15 bg-[#f2f6fb] px-4 py-3 text-sm font-semibold text-[#14212e] transition hover:border-[#14212e]/40"
                >
                  Instagram · {profile?.instagram_handle}
                </a>
              )}
              {facebookLink && (
                <a
                  href={facebookLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-2xl border border-[#14212e]/15 bg-[#f2f6fb] px-4 py-3 text-sm font-semibold text-[#14212e] transition hover:border-[#14212e]/40"
                >
                  Facebook · {profile?.facebook_handle}
                </a>
              )}
              {websiteLink && (
                <a
                  href={websiteLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-2xl border border-[#14212e]/15 bg-[#f2f6fb] px-4 py-3 text-sm font-semibold text-[#14212e] transition hover:border-[#14212e]/40 sm:col-span-2"
                >
                  Visitar sitio web
                </a>
              )}
              {stravaProfileUrl && (
                <a
                  href={stravaProfileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-2xl border border-[#14212e]/15 bg-[#f2f6fb] px-4 py-3 text-sm font-semibold text-[#14212e] transition hover:border-[#14212e]/40"
                >
                  Perfil en Strava
                </a>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-[#14212e]">Biografía del vendedor</h3>
              <p className="text-sm text-[#14212e]/70">
                {profile?.bio
                  ? profile.bio
                  : 'Este vendedor todavía no comparte una presentación. Volvé pronto para conocer más detalles sobre su historia ciclista.'}
              </p>
              {profile?.preferred_brands?.length ? (
                <div>
                  <p className="text-sm font-semibold text-[#14212e]">Marcas favoritas</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {profile.preferred_brands.map((brand: string) => (
                      <li key={brand} className="rounded-full border border-[#14212e]/20 bg-white px-3 py-1 text-xs font-semibold text-[#14212e]">
                        {brand}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        )
      case 'Publicaciones':
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-[#14212e]">Publicaciones del vendedor</h2>
            {listingsVisible.length === 0 && (
              <div className="rounded-2xl border border-[#14212e]/10 bg-[#f2f6fb] p-6 text-sm text-[#14212e]/70">
                Este vendedor aún no tiene publicaciones visibles.
              </div>
            )}
            {listingsVisible.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {listingsVisible.map((listing) => (
                  <ListingCard key={listing.id} l={listing} />
                ))}
              </div>
            )}
          </div>
        )
      case 'Reseñas':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#14212e]">Reseñas</h2>
              {canReview?.allowed && (
                <button
                  type="button"
                  className="rounded-full border border-[#14212e]/20 px-3 py-1.5 text-sm text-[#14212e] hover:bg-[#14212e]/5"
                  onClick={() => setReviewModalOpen(true)}
                >
                  Escribir reseña
                </button>
              )}
            </div>
            {wantsReview && !user?.id && (
              <div className="rounded-2xl border border-[#14212e]/10 bg-[#f2f6fb] p-4 text-sm text-[#14212e]/80">
                Para dejar una reseña tenés que iniciar sesión.
                <div className="mt-3">
                  <Link
                    to={`/login?redirect=${encodeURIComponent(`/vendedor/${sellerId}?review=true${ratingFromUrl ? `&rating=${ratingFromUrl}` : ''}`)}`}
                    className="inline-flex items-center justify-center rounded-full bg-[#14212e] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1b2f3f]"
                  >
                    Iniciar sesión
                  </Link>
                </div>
              </div>
            )}
            {canReview && !canReview.allowed && (
              <div className="rounded-2xl border border-[#14212e]/10 bg-[#f2f6fb] p-3 text-xs text-[#14212e]/70">
                {canReview.reason || 'Aún no podés escribir una reseña.'}
              </div>
            )}
            {(!reviewsSummary || reviewsSummary.count === 0) ? (
              <div className="rounded-2xl border border-[#14212e]/10 bg-[#f2f6fb] p-6 text-sm text-[#14212e]/70">
                Aún no hay reseñas para este vendedor.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 text-[#14212e]">
                  <StarRating value={reviewsSummary.avgRating} />
                  <span className="text-sm">{reviewsSummary.avgRating.toFixed(1)} promedio · {reviewsSummary.count} reseñas</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-[#14212e]/10 bg-white p-4">
                    <p className="mb-2 text-sm font-semibold text-[#14212e]">Distribución</p>
                    <div className="space-y-1">
                      {([5, 4, 3, 2, 1] as const).map((star) => {
                        const dist = (reviewsSummary?.dist || {}) as Record<number, number>
                        const count = Number(dist[star] || 0)
                        const pct = reviewsSummary.count ? Math.round((count / reviewsSummary.count) * 100) : 0
                        return (
                          <div key={star} className="flex items-center gap-2 text-xs text-[#14212e]/80">
                            <span className="w-10 shrink-0">{star}★</span>
                            <div className="relative h-2 flex-1 overflow-hidden rounded bg-[#14212e]/10">
                              <div className="absolute inset-y-0 left-0 bg-amber-400" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-10 text-right">{count}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[#14212e]/10 bg-white p-4">
                    <p className="mb-2 text-sm font-semibold text-[#14212e]">Lo más mencionado</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries((reviewsSummary?.tagsCount || {}) as Record<string, number>)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 6)
                        .map(([tag, count]) => (
                          <span key={tag} className="rounded-full border border-[#14212e]/15 bg-[#f2f6fb] px-3 py-1 text-xs text-[#14212e]">
                            {tag.replace(/_/g, ' ')} · {count}
                          </span>
                        ))}
                      {Object.keys((reviewsSummary?.tagsCount || {})).length === 0 && (
                        <span className="text-xs text-[#14212e]/60">Sin etiquetas destacadas.</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  {reviews.map((r) => (
                    <div key={r.id} className="rounded-2xl border border-[#14212e]/10 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <StarRating value={r.rating} />
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-[#14212e]/10 bg-[#f2f6fb] text-xs font-semibold text-[#14212e]">
                              {r.buyer_avatar_url ? (
                                <img src={r.buyer_avatar_url} alt={r.buyer_name || 'Comprador'} className="h-full w-full object-cover" />
                              ) : (
                                <span>{(r.buyer_name || 'C').charAt(0)}</span>
                              )}
                            </div>
                            {r.buyer_name && (
                              <span className="text-xs font-semibold text-[#14212e]/80">{r.buyer_name}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-[#14212e]/60">{new Date(r.created_at).toLocaleDateString('es-AR')}</span>
                      </div>
                      {r.tags && r.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {r.tags.map((t) => (
                            <span key={t} className="rounded-full border border-[#14212e]/15 bg-[#14212e]/5 px-2 py-0.5 text-[11px] text-[#14212e]/80">{t.replace(/_/g, ' ')}</span>
                          ))}
                        </div>
                      )}
                      {r.comment && <p className="mt-2 text-sm text-[#14212e]/80">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      case 'Intereses':
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-[#14212e]">Intereses del vendedor</h2>
            <div className="rounded-2xl border border-[#14212e]/10 bg-[#f2f6fb] p-6 text-sm text-[#14212e]/70 space-y-3">
              <p>
                {profile?.preferred_bike
                  ? `Prefiere bicicletas de ${profile.preferred_bike}.`
                  : 'Este vendedor aún no indicó su bicicleta preferida.'}
              </p>
              {Array.isArray(profile?.bike_preferences) && profile?.bike_preferences?.length ? (
                <div>
                  <p className="text-sm font-semibold text-[#14212e]">Disciplinas favoritas</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {profile?.bike_preferences?.map((pref) => (
                      <li key={pref} className="rounded-full border border-[#14212e]/20 bg-white px-3 py-1 text-xs font-semibold text-[#14212e]">
                        {pref}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p>Esperamos más detalles sobre sus preferencias ciclistas.</p>
              )}
            </div>
          </div>
        )
      default:
        return null
    }
  }, [avatarUrl, displayName, locationLabel, lastUpdatedLabel, profile, listings, activeListings.length, totalListings, reviewsSummary, reviews, canReview, wantsReview, user?.id, sellerId, ratingFromUrl, isModerator, modAvailableCredits, modCreditHistory])

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-120px)] bg-gray-50 py-10">
        <Container>
          <div className="rounded-[28px] border border-gray-200 bg-white p-10 text-center text-gray-600 shadow-sm">
            Cargando perfil del vendedor…
          </div>
        </Container>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-120px)] bg-gray-50 py-10">
        <Container>
          <div className="rounded-[28px] border border-red-200 bg-red-50 p-10 text-center text-red-700">
            {error}
          </div>
        </Container>
      </div>
    )
  }

  const badgeForTab = (tab: SellerTab) => {
    if (tab === 'Publicaciones') return listings.length
    if (tab === 'Reseñas') return reviewsSummary?.count ?? 0
    return 0
  }

  if (isMobile) {
    const mobileTab = mobileActiveTab
    const activeMetadata = mobileTab ? TAB_METADATA[mobileTab] : null

    return (
      <>
        <div className="min-h-[calc(100vh-96px)] bg-gray-50 py-6 text-gray-900">
          <Container>
            <div className="space-y-6">
              <header className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.35em] text-gray-500">Perfil del vendedor</p>
                <h1 className="mt-2 text-2xl font-semibold">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-50 align-middle">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={displayNameAbbrev} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-sm text-gray-600">{displayNameAbbrev.charAt(0)}</span>
                      )}
                    </span>
                    <span>{displayNameAbbrev}</span>
                  </span>
                </h1>
                <p className="mt-1 text-sm text-gray-600">{locationLabel}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {websiteLink && (
                    <a
                      href={websiteLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                    >
                      Sitio web
                    </a>
                  )}
                  <Button to="/marketplace" className="bg-[#14212e] text-white shadow-[0_14px_40px_rgba(20,33,46,0.35)] hover:bg-[#1b2f3f]">
                    Ver marketplace
                  </Button>
                </div>
              </header>

              {mobileTab ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setMobileActiveTab(null)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-700 transition hover:bg-gray-50"
                      aria-label="Volver al menú"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" stroke="currentColor" fill="none" strokeWidth={1.6}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                      </svg>
                    </button>
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Sección</p>
                      <h2 className="text-lg font-semibold">{activeMetadata?.title ?? mobileTab}</h2>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-gray-200 bg-white px-3 py-3 text-[#14212e] shadow-sm">
                    {renderSection(mobileTab)}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3">
                    {TABS.map((tab) => {
                      const meta = TAB_METADATA[tab]
                      const badge = badgeForTab(tab)
                      return (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => handleSelectTab(tab)}
                          className="flex items-center justify-between gap-3 rounded-3xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:bg-gray-50"
                        >
                          <div className="flex w-full items-center gap-3">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-50 text-gray-700">
                              <SellerTabIcon tab={tab} />
                            </span>
                            <div className="flex flex-1 flex-col">
                              <p className="text-base font-semibold text-gray-900">{meta.title}</p>
                              <p className="text-xs text-gray-600">{meta.description}</p>
                            </div>
                            {badge > 0 && (
                              <span className="inline-flex min-w-[26px] shrink-0 items-center justify-center rounded-full bg-[#ff6b6b] px-2 py-0.5 text-[11px] font-semibold text-white">
                                {badge > 99 ? '99+' : badge}
                              </span>
                            )}
                          </div>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5 text-gray-400" stroke="currentColor" fill="none" strokeWidth={1.5}>
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

        {reviewModalOpen && (
          <ReviewModal
            onClose={() => setReviewModalOpen(false)}
            rating={reviewRating}
            setRating={setReviewRating}
            isVerifiedSale={reviewIsVerifiedSale}
            setIsVerifiedSale={setReviewIsVerifiedSale}
            tags={reviewTags}
            setTags={setReviewTags}
            comment={reviewComment}
            setComment={setReviewComment}
            loading={reviewSubmitting}
            onSubmit={async () => {
              if (!sellerId || !user?.id) return
              try {
                setReviewSubmitting(true)
                await submitReview({ sellerId, buyerId: user.id, rating: reviewRating, isVerifiedSale: reviewIsVerifiedSale, tags: reviewTags, comment: reviewComment })
                showToast('Gracias por tu reseña')
                setReviewModalOpen(false)
                setReviewRating(0)
                setReviewIsVerifiedSale(false)
                setReviewTags([])
                setReviewComment('')
                const data = await fetchSellerReviews(sellerId)
                if (data) {
                  setReviews(data.reviews)
                  setReviewsSummary({
                    count: data.summary.count,
                    avgRating: data.summary.avgRating,
                    dist: data.summary.dist,
                    tagsCount: data.summary.tagsCount,
                  })
                }
              } catch (err: any) {
                const raw = String(err?.message || '').trim().toLowerCase()
                const pretty = (() => {
                  if (!raw) return 'No pudimos guardar la reseña'
                  if (raw.includes('missing_fields')) return 'Faltan datos para enviar la reseña. Verificá que estés logueado y elijas una calificación.'
                  if (raw.includes('invalid_rating')) return 'La calificación debe ser de 1 a 5 estrellas.'
                  if (raw.includes('not_allowed')) return 'Para publicar una reseña necesitás haber contactado al vendedor (WhatsApp o email), y solo podés dejar una reseña por vendedor.'
                  if (raw.includes('insert_failed')) return 'No pudimos guardar la reseña en este momento. Probá de nuevo en unos minutos.'
                  if (raw.includes('unexpected_error')) return 'Ocurrió un error inesperado. Intentá nuevamente.'
                  return 'No pudimos guardar la reseña. ' + (err?.message || '')
                })()
                showToast(pretty, { variant: 'error' } as any)
              } finally {
                setReviewSubmitting(false)
              }
            }}
          />
        )}
      </>
    )
  }

  return (
    <>
      <div className="min-h-[calc(100vh-120px)] bg-gray-50 py-10">
        <Container>
          <div className="overflow-visible rounded-[28px] border border-gray-200 bg-white shadow-sm">
            <header className="border-b border-gray-200 bg-white px-6 py-6">
              <h1 className="text-xl font-semibold text-gray-900">Perfil del vendedor</h1>
            </header>

            <div className="grid gap-6 p-6 lg:grid-cols-[260px_1fr]">
              <nav className="hidden rounded-3xl border border-gray-200 bg-white p-3 text-sm text-gray-700 md:block">
                <ul className="grid gap-1">
                  {TABS.map((tab) => (
                    <li key={tab}>
                      <button
                        type="button"
                        onClick={() => handleSelectTab(tab)}
                        className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                          activeTab === tab ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-gray-50'
                        }`}
                      >
                        {tab}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>

              <section className="rounded-3xl border border-gray-200 bg-white px-7 py-6 md:p-6 shadow-sm">
                {renderSection(activeTab)}
              </section>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
            <span>¿Sos el vendedor? <Link to="/dashboard" className="underline text-gray-700">Administrá tu perfil desde el panel</Link>.</span>
            <span>
              <Link to="/marketplace" className="underline text-gray-700">
                Volver al marketplace
              </Link>
            </span>
          </div>
        </Container>
      </div>

      {reviewModalOpen && (
        <ReviewModal
          onClose={() => setReviewModalOpen(false)}
          rating={reviewRating}
          setRating={setReviewRating}
          isVerifiedSale={reviewIsVerifiedSale}
          setIsVerifiedSale={setReviewIsVerifiedSale}
          tags={reviewTags}
          setTags={setReviewTags}
          comment={reviewComment}
          setComment={setReviewComment}
          loading={reviewSubmitting}
          onSubmit={async () => {
            if (!sellerId || !user?.id) return
            try {
              setReviewSubmitting(true)
              await submitReview({ sellerId, buyerId: user.id, rating: reviewRating, isVerifiedSale: reviewIsVerifiedSale, tags: reviewTags, comment: reviewComment })
              showToast('Gracias por tu reseña')
              setReviewModalOpen(false)
              setReviewRating(0)
              setReviewIsVerifiedSale(false)
              setReviewTags([])
              setReviewComment('')
              const data = await fetchSellerReviews(sellerId)
              if (data) {
                setReviews(data.reviews)
                setReviewsSummary({
                  count: data.summary.count,
                  avgRating: data.summary.avgRating,
                  dist: data.summary.dist,
                  tagsCount: data.summary.tagsCount,
                })
              }
            } catch (err: any) {
              showToast(err?.message || 'No pudimos guardar la reseña', { variant: 'error' })
            } finally {
              setReviewSubmitting(false)
            }
          }}
        />
      )}
    </>
  )
}

function StarRating({ value }: { value: number }) {
  const full = Math.floor(value)
  const half = value - full >= 0.5
  const total = 5
  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      {Array.from({ length: total }).map((_, i) => {
        const idx = i + 1
        const type = idx <= full ? 'full' : idx === full + 1 && half ? 'half' : 'empty'
        return (
          <span key={idx} aria-hidden>
            {type === 'full' ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-400" fill="currentColor">
                <path d="M12 17.3 6.5 20.2l1-5.8L3 10.2l5.8-.9L12 4l3.2 5.3 5.8.9-4.5 4.2 1 5.8Z" />
              </svg>
            ) : type === 'half' ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-400" fill="currentColor">
                <defs>
                  <linearGradient id="half-grad-profile" x1="0" x2="1">
                    <stop offset="50%" stopColor="currentColor" />
                    <stop offset="50%" stopColor="transparent" />
                  </linearGradient>
                </defs>
                <path d="M12 17.3 6.5 20.2l1-5.8L3 10.2l5.8-.9L12 4l3.2 5.3 5.8.9-4.5 4.2 1 5.8Z" fill="url(#half-grad-profile)" />
                <path d="M12 17.3 6.5 20.2l1-5.8L3 10.2l5.8-.9L12 4l3.2 5.3 5.8.9-4.5 4.2 1 5.8Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M12 17.3 6.5 20.2l1-5.8L3 10.2l5.8-.9L12 4l3.2 5.3 5.8.9-4.5 4.2 1 5.8Z" />
              </svg>
            )}
          </span>
        )
      })}
    </span>
  )
}

function ProfileStat({ label, value, trend }: { label: string; value: number | string; trend?: string }) {
  return (
    <div className="rounded-2xl border border-[#14212e]/10 bg-[#14212e]/5 p-4">
      <p className="text-xs uppercase tracking-wide text-[#14212e]/50">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[#14212e]">{value}</p>
      {trend && <p className="text-xs text-[#14212e]/60">{trend}</p>}
    </div>
  )
}

function SellerTabIcon({ tab }: { tab: SellerTab }) {
  const common = {
    className: 'h-6 w-6',
    stroke: 'currentColor',
    fill: 'none',
    strokeWidth: 1.6,
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24',
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
    case 'Reseñas':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.75.75 0 011.04 0l2.122 2.122 2.122-2.122a.75.75 0 011.04 0l2.378 2.378a.75.75 0 010 1.06l-2.122 2.122 2.122 2.122a.75.75 0 010 1.06l-2.378 2.378a.75.75 0 01-1.04 0l-2.122-2.122-2.122 2.122a.75.75 0 01-1.06 0l-2.378-2.378a.75.75 0 010-1.06l2.122-2.122-2.122-2.122a.75.75 0 010-1.06l2.378-2.378z" />
        </svg>
      )
    case 'Intereses':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      )
    default:
      return null
  }
}
