import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Container from '../components/Container'
import ListingCard from '../components/ListingCard'
import Button from '../components/Button'
import { fetchUserProfile, type UserProfileRecord } from '../services/users'
import { fetchSellerReviews, canUserReviewSeller, submitReview, type ReviewRecord } from '../services/reviews'
import { useToast } from '../context/ToastContext'
import { fetchListingsBySeller } from '../services/listings'
import { supabaseEnabled } from '../services/supabase'
import { mockListings } from '../mock/mockData'
import type { Listing } from '../types'
import { useAuth } from '../context/AuthContext'

const TABS = ['Perfil', 'Publicaciones', 'Reseñas', 'Intereses'] as const
type SellerTab = (typeof TABS)[number]

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' })

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
  const navigate = useNavigate()
  const { user } = useAuth()
  const { show: showToast } = useToast()
  const [activeTab, setActiveTab] = useState<SellerTab>('Perfil')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [profile, setProfile] = useState<UserProfileRecord | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviews, setReviews] = useState<ReviewRecord[]>([])
  const [reviewsSummary, setReviewsSummary] = useState<{ count: number; avgRating: number } | null>(null)
  const [canReview, setCanReview] = useState<{ allowed: boolean; reason?: string } | null>(null)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewTags, setReviewTags] = useState<string[]>([])
  const [reviewComment, setReviewComment] = useState('')

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
            fetchListingsBySeller(sellerId),
            fetchSellerReviews(sellerId)
          ])
          if (!active) return
          setProfile(profileData)
          setListings(listingsData)
          if (reviewsData) {
            setReviews(reviewsData.reviews)
            setReviewsSummary({
              count: reviewsData.summary.count,
              avgRating: reviewsData.summary.avgRating,
              // pasar dist y tagsCount para que funcionen los gráficos
              ...(reviewsData.summary.dist ? { dist: reviewsData.summary.dist } : {}),
              ...(reviewsData.summary.tagsCount ? { tagsCount: reviewsData.summary.tagsCount } : {}),
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
              avatar_url: listing.sellerAvatar ?? undefined
            })
          }
        }
        if (active) {
          setLoading(false)
        }
      } catch (err: any) {
        if (!active) return
        console.error('[seller-profile] load failed', err)
        setError('No pudimos cargar los datos del vendedor.')
        setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [sellerId])

  useEffect(() => {
    if (!user?.id || !sellerId) { setCanReview(null); return }
    void (async () => {
      const result = await canUserReviewSeller(user.id, sellerId)
      setCanReview(result)
    })()
  }, [user?.id, sellerId])

  // Deep-link: ?review=1 abre pestaña Reseñas y modal si está permitido
  useEffect(() => {
    if (!sellerId) return
    const wantsReview = searchParams.get('review') === '1'
    if (!wantsReview) return
    setActiveTab('Reseñas')
    // Esperar a que cargue canReview
    const t = setTimeout(() => {
      if (canReview?.allowed) setReviewModalOpen(true)
    }, 100)
    return () => clearTimeout(t)
  }, [sellerId, searchParams, canReview?.allowed])

  // Limpiar el query param después de abrir
  useEffect(() => {
    if (!reviewModalOpen) return
    if (searchParams.has('review')) {
      searchParams.delete('review')
      setSearchParams(searchParams, { replace: true })
    }
  }, [reviewModalOpen])

  useEffect(() => {
    if (!mobileNavOpen) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [mobileNavOpen])

  useEffect(() => {
    if (!mobileNavOpen) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [mobileNavOpen])

  const displayName = profile?.full_name || listings[0]?.sellerName || 'Vendedor Ciclo Market'
  const avatarUrl = profile?.avatar_url || listings[0]?.sellerAvatar || null
  const totalListings = listings.length
  const activeListings = useMemo(
    () => listings.filter((item) => !item.status || item.status === 'active'),
    [listings]
  )
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

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-120px)] bg-[#f6f8fb] py-12">
        <Container>
          <div className="mx-auto max-w-2xl rounded-3xl border border-black/10 bg-white p-8 text-center text-sm text-black/60 shadow">
            Cargando perfil del vendedor…
          </div>
        </Container>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-120px)] bg-[#f6f8fb] py-12">
        <Container>
          <div className="mx-auto max-w-2xl rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-600 shadow">
            {error}
          </div>
        </Container>
      </div>
    )
  }

  const latestListing = listings[0]
  const lastUpdatedLabel = latestListing?.createdAt
    ? relativeTimeFromNow(new Date(latestListing.createdAt).toISOString())
    : null

  return (
    <div className="min-h-[calc(100vh-120px)] bg-[#14212e] py-10">
      <Container>
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#14212e] shadow-[0_35px_80px_rgba(12,20,28,0.35)]">
          <header className="border-b border-white/10 bg-[#14212e] px-6 py-6 text-white">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <div className="size-16 overflow-hidden rounded-2xl border border-white/20 bg-white/10">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-white/80">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/70">Perfil del vendedor</p>
                  <h1 className="text-2xl font-semibold">{displayName}</h1>
                  <p className="text-sm text-white/70">{locationLabel}</p>
                  {reviewsSummary && reviewsSummary.count > 0 && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-white/80">
                      <StarRating value={reviewsSummary.avgRating} />
                      <span>({reviewsSummary.count})</span>
                    </div>
                  )}
                  {memberSinceLabel && (
                    <p className="mt-1 text-xs text-white/60">Miembro desde {memberSinceLabel}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {websiteLink && (
                  <a
                    href={websiteLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white transition hover:border-white"
                  >
                    Sitio web
                  </a>
                )}
                <Button to="/marketplace" variant="secondary" className="bg-white text-[#14212e] hover:bg-white/90">
                  Ver marketplace
                </Button>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(true)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 text-white transition hover:border-white/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:hidden"
                  aria-label="Abrir menú del vendedor"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6" stroke="currentColor" fill="none" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="mt-4 text-xs text-white/70">Inicio / Vendedor / <span className="text-white">{displayName}</span></div>
          </header>

          <div className="grid gap-6 p-6 md:grid-cols-[260px_1fr]">
            <nav className="hidden rounded-3xl border border-white/15 bg-[#14212e] p-3 text-sm text-white md:block">
              <ul className="grid gap-1">
                {TABS.map((tab) => (
                  <li key={tab}>
                    <button
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                        activeTab === tab ? 'bg-white text-[#14212e] shadow' : 'text-white hover:bg-white/10'
                      }`}
                    >
                      {tab}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <section className="rounded-3xl border border-white/10 bg-white p-6 shadow-[0_25px_60px_rgba(12,20,28,0.35)]">
              {activeTab === 'Perfil' && (
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
                      <h2 className="text-2xl font-semibold text-[#14212e]">{displayName}</h2>
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
                      label="Señales de confianza"
                      value={profile?.verified ? 'Vendedor verificado' : 'Perfil en construcción'}
                      trend={`Antigüedad: ${profile?.created_at ? new Intl.DateTimeFormat('es-AR', { year: 'numeric', month: 'short' }).format(new Date(profile.created_at)) : '—'} • ${profile?.whatsapp_number ? 'WhatsApp cargado' : 'Sin WhatsApp'}`}
                    />
                  </div>

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
                  </div>
                </div>
              )}

              {activeTab === 'Publicaciones' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-[#14212e]">Publicaciones del vendedor</h2>
                  {listings.length === 0 && (
                    <div className="rounded-2xl border border-[#14212e]/10 bg-[#f2f6fb] p-6 text-sm text-[#14212e]/70">
                      Este vendedor aún no tiene publicaciones visibles.
                    </div>
                  )}
                  {listings.length > 0 && (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {listings.map((listing) => (
                        <ListingCard key={listing.id} l={listing} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'Reseñas' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-[#14212e]">Reseñas</h2>
                    {canReview?.allowed && (
                      <button type="button" className="rounded-full border border-[#14212e]/20 px-3 py-1.5 text-sm text-[#14212e] hover:bg-[#14212e]/5" onClick={() => setReviewModalOpen(true)}>
                        Escribir reseña
                      </button>
                    )}
                  </div>
                  {canReview && !canReview.allowed && (
                    <div className="rounded-2xl border border-[#14212e]/10 bg-[#f2f6fb] p-3 text-xs text-[#14212e]/70">
                      {canReview.reason || 'Aún no podés escribir una reseña.'}
                    </div>
                  )}
                  {(!reviewsSummary || reviewsSummary.count === 0) && (
                    <div className="rounded-2xl border border-[#14212e]/10 bg-[#f2f6fb] p-6 text-sm text-[#14212e]/70">
                      Aún no hay reseñas para este vendedor.
                    </div>
                  )}
                  {reviewsSummary && reviewsSummary.count > 0 && (
                    <div className="flex items-center gap-3 text-[#14212e]">
                      <StarRating value={reviewsSummary.avgRating} />
                      <span className="text-sm">{reviewsSummary.avgRating.toFixed(1)} promedio · {reviewsSummary.count} reseñas</span>
                    </div>
                  )}
                  {reviewsSummary && reviewsSummary.count > 0 && (
                    <div className="grid gap-4 md:grid-cols-2">
                      {/* Distribución de estrellas */}
                      <div className="rounded-2xl border border-[#14212e]/10 bg-white p-4">
                        <p className="mb-2 text-sm font-semibold text-[#14212e]">Distribución</p>
                        <div className="space-y-1">
                          {([5,4,3,2,1] as const).map((star) => {
                            const dist = (reviewsSummary?.dist as any) || {}
                            const count = Number((dist as any)[star] || 0)
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
                      {/* Etiquetas más mencionadas */}
                      <div className="rounded-2xl border border-[#14212e]/10 bg-white p-4">
                        <p className="mb-2 text-sm font-semibold text-[#14212e]">Lo más mencionado</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(((reviewsSummary?.tagsCount || {}) as Record<string, number>))
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
                  )}
                  <div className="space-y-3">
                    {reviews.map((r) => (
                      <div key={r.id} className="rounded-2xl border border-[#14212e]/10 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <StarRating value={r.rating} />
                            </div>
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
                              <span key={t} className="rounded-full border border-[#14212e]/15 bg-[#14212e]/5 px-2 py-0.5 text-[11px] text-[#14212e]/80">{t.replace(/_/g,' ')}</span>
                            ))}
                          </div>
                        )}
                        {r.comment && <p className="mt-2 text-sm text-[#14212e]/80">{r.comment}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'Intereses' && (
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
              )}
            </section>
          </div>
        </div>

        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden"
            role="dialog"
            aria-modal="true"
            onClick={() => setMobileNavOpen(false)}
          >
            <div
              className="absolute inset-x-5 top-28 rounded-3xl border border-[#14212e]/10 bg-white p-5 text-[#14212e] shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Secciones</h2>
                <button
                  type="button"
                  aria-label="Cerrar"
                  onClick={() => setMobileNavOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#14212e]/15 text-[#14212e] hover:border-[#14212e]/40"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" stroke="currentColor" fill="none" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18 18 6" />
                  </svg>
                </button>
              </div>
              <ul className="mt-4 grid gap-2">
                {TABS.map((tab) => (
                  <li key={`mobile-${tab}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab(tab)
                        setMobileNavOpen(false)
                      }}
                      className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                        activeTab === tab
                          ? 'border-[#14212e] bg-[#14212e] text-white shadow'
                          : 'border-[#14212e]/20 bg-white hover:border-[#14212e]/40'
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

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-xs text-[#14212e]/60">
          <span>¿Sos el vendedor? <Link to="/dashboard" className="underline">Administrá tu perfil desde el panel</Link>.</span>
          <span>
            <Link to="/marketplace" className="underline">
              Volver al marketplace
            </Link>
          </span>
        </div>
      </Container>
      {reviewModalOpen && user?.id && sellerId && (
        <ReviewModal
          onClose={() => setReviewModalOpen(false)}
          rating={reviewRating}
          setRating={setReviewRating}
          tags={reviewTags}
          setTags={setReviewTags}
          comment={reviewComment}
          setComment={setReviewComment}
          loading={reviewSubmitting}
          onSubmit={async () => {
            try {
              setReviewSubmitting(true)
              await submitReview({ sellerId, buyerId: user.id, rating: reviewRating, tags: reviewTags, comment: reviewComment })
              showToast('Gracias por tu reseña')
              setReviewModalOpen(false)
              setReviewRating(0)
              setReviewTags([])
              setReviewComment('')
              const data = await fetchSellerReviews(sellerId)
              if (data) {
                setReviews(data.reviews)
                setReviewsSummary({
                  count: data.summary.count,
                  avgRating: data.summary.avgRating,
                  ...(data.summary.dist ? { dist: data.summary.dist } : {}),
                  ...(data.summary.tagsCount ? { tagsCount: data.summary.tagsCount } : {}),
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
    </div>
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
        const type = idx <= full ? 'full' : (idx === full + 1 && half ? 'half' : 'empty')
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

function ReviewModal({ onClose, rating, setRating, tags, setTags, comment, setComment, loading, onSubmit }: {
  onClose: () => void
  rating: number
  setRating: (v: number) => void
  tags: string[]
  setTags: (v: string[]) => void
  comment: string
  setComment: (v: string) => void
  loading: boolean
  onSubmit: () => Promise<void> | void
}) {
  const OPTIONS = [
    { id: 'atencion', label: 'Buena atención' },
    { id: 'respetuoso', label: 'Respetuoso' },
    { id: 'buen_vendedor', label: 'Buen vendedor' },
    { id: 'compre', label: 'Concreté compra' },
    { id: 'puntual', label: 'Puntual' },
    { id: 'buena_comunicacion', label: 'Buena comunicación' },
    { id: 'recomendado', label: 'Recomendado' },
  ]
  const toggle = (id: string) => {
    setTags(tags.includes(id) ? tags.filter((t) => t !== id) : [...tags, id])
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-[#14212e]/10 bg-white shadow-[0_25px_80px_rgba(12,20,28,0.3)]">
        <div className="flex items-center justify-between bg-[#14212e] px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M12 17.3 6.5 20.2l1-5.8L3 10.2l5.8-.9L12 4l3.2 5.3 5.8.9-4.5 4.2 1 5.8Z"/></svg>
            </span>
            <div>
              <h2 className="text-base font-semibold leading-none">Dejá tu reseña</h2>
              <p className="mt-1 text-xs text-white/80">Contanos cómo fue tu experiencia con el vendedor.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-full p-1 text-white/80 hover:bg-white/10">✕</button>
        </div>
        <div className="p-6">
          <div>
            <p className="text-sm font-medium text-[#14212e]">Calificación</p>
            <div className="mt-2 flex items-center gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRating(i + 1)}
                  aria-label={`Calificar ${i + 1}`}
                  className="transition-transform hover:scale-110"
                >
                  <svg viewBox="0 0 24 24" className={`h-8 w-8 ${i < rating ? 'text-amber-400' : 'text-[#14212e]/20'}`} fill="currentColor">
                    <path d="M12 17.3 6.5 20.2l1-5.8L3 10.2l5.8-.9L12 4l3.2 5.3 5.8.9-4.5 4.2 1 5.8Z" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <p className="text-sm font-medium text-[#14212e]">Etiquetas</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggle(opt.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    tags.includes(opt.id)
                      ? 'border-[#14212e] bg-[#14212e]/10 text-[#14212e]'
                      : 'border-[#14212e]/20 text-[#14212e]/80 hover:bg-[#14212e]/5'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <p className="text-sm font-medium text-[#14212e]">Comentario (opcional)</p>
            <textarea
              className="textarea mt-2"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Dejá detalles útiles para otros compradores"
              rows={4}
            />
          </div>
          <div className="mt-6 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={() => void onSubmit()} disabled={loading || rating < 1} className="bg-[#14212e] text-white hover:bg-[#1b2f3f]">
              {loading ? 'Enviando…' : 'Enviar reseña'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProfileStat({ label, value, trend }: { label: string; value: number | string; trend?: string }) {
  return (
    <div className="rounded-2xl border border-[#14212e]/15 bg-[#f2f6fb] px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-[#14212e]/50">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[#14212e]">{value}</p>
      {trend && <p className="text-xs text-[#14212e]/60">{trend}</p>}
    </div>
  )
}
