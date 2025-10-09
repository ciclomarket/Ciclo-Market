import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Container from '../components/Container'
import ListingCard from '../components/ListingCard'
import Button from '../components/Button'
import { fetchUserProfile, type UserProfileRecord } from '../services/users'
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
  const navigate = useNavigate()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<SellerTab>('Perfil')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [profile, setProfile] = useState<UserProfileRecord | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
          const [profileData, listingsData] = await Promise.all([
            fetchUserProfile(sellerId),
            fetchListingsBySeller(sellerId)
          ])
          if (!active) return
          setProfile(profileData)
          setListings(listingsData)
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
  const activeListings = useMemo(() => listings.filter((item) => item.status !== 'archived'), [listings])
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
    <div className="min-h-[calc(100vh-120px)] bg-[#f6f8fb] py-10">
      <Container>
        <div className="overflow-hidden rounded-[28px] border border-[#14212e]/10 bg-white shadow-[0_35px_80px_rgba(12,20,28,0.15)]">
          <header className="border-b border-[#14212e]/10 bg-[#14212e] px-6 py-6 text-white">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start justify-between gap-3 md:block">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/70">Perfil del vendedor</p>
                  <h1 className="text-2xl font-semibold">{displayName}</h1>
                  <p className="text-sm text-white/70">{locationLabel}</p>
                  {memberSinceLabel && (
                    <p className="mt-1 text-xs text-white/60">Miembro desde {memberSinceLabel}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(true)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 text-white transition hover:border-white/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:hidden"
                  aria-label="Abrir menú del vendedor"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6" stroke="currentColor" fill="none" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
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
              </div>
            </div>
          </header>

          <div className="grid gap-6 p-6 md:grid-cols-[260px_1fr]">
            <nav className="hidden rounded-3xl border border-[#14212e]/10 bg-[#14212e]/5 p-3 text-sm text-[#14212e]/80 md:block">
              <ul className="grid gap-1">
                {TABS.map((tab) => (
                  <li key={tab}>
                    <button
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                        activeTab === tab ? 'bg-white text-[#14212e] shadow' : 'hover:bg-white/40'
                      }`}
                    >
                      {tab}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <section className="rounded-3xl border border-[#14212e]/10 bg-white p-6 shadow-[0_25px_60px_rgba(12,20,28,0.12)]">
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
                      label="Perfil de Strava"
                      value={stravaProfileUrl ? 'Conectado' : 'No conectado'}
                      trend={stravaProfileUrl ? 'Comparte sus rutas con la comunidad.' : 'Todavía no vinculó su actividad.'}
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
                  <h2 className="text-lg font-semibold text-[#14212e]">Reseñas</h2>
                  <div className="rounded-2xl border border-[#14212e]/10 bg-[#f2f6fb] p-6 text-sm text-[#14212e]/70">
                    Las reseñas de compradores estarán disponibles próximamente.
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
