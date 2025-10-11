import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Container from '../components/Container'
import Button from '../components/Button'
import ListingCard from '../components/ListingCard'
import { mockListings } from '../mock/mockData'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseEnabled } from '../services/supabase'
import { archiveListing, fetchListingsBySeller, reduceListingPrice, fetchListingsByIds, updateListingStatus, deleteListing } from '../services/listings'
import { fetchUserProfile, type UserProfileRecord, upsertUserProfile } from '../services/users'
import type { Listing } from '../types'
import { usePlans } from '../context/PlanContext'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { uploadAvatar } from '../services/storage'
import { PROVINCES, OTHER_CITY_OPTION } from '../constants/locations'
import { BIKE_CATEGORIES } from '../constants/catalog'
import { deriveProfileSlug, pickDiscipline } from '../utils/user'
import { normaliseWhatsapp, extractLocalWhatsapp, sanitizeLocalWhatsappInput } from '../utils/whatsapp'
import { useNotifications } from '../context/NotificationContext'
import useFaves from '../hooks/useFaves'

const TABS = ['Perfil', 'Publicaciones', 'Favoritos', 'Notificaciones', 'Editar perfil', 'Suscripción', 'Cerrar sesión'] as const
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
  'Editar perfil': {
    title: 'Editar perfil',
    description: 'Actualizá tus datos, redes y WhatsApp',
  },
  Suscripción: {
    title: 'Plan y beneficios',
    description: 'Controlá tu plan y próximas renovaciones',
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
  const { ids: favouriteIds } = useFaves()
  const favouritesCount = favouriteIds.length

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
        const [listingsData, profileData] = await Promise.all([
          fetchListingsBySeller(user.id),
          fetchUserProfile(user.id)
        ])
        setSellerListings(listingsData)
        setProfile(profileData)
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
          />
        )
      case 'Publicaciones':
        return <ListingsView listings={sellerListings} onRefresh={loadData} />
      case 'Notificaciones':
        return <NotificationsView />
      case 'Favoritos':
        return <FavoritesView favouriteIds={favouriteIds} />
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
      case 'Suscripción':
        return <SubscriptionView listings={sellerListings} />
      case 'Cerrar sesión':
        return <SignOutView onSignOut={logout} />
      default:
        return null
    }
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

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-120px)] bg-[#101c29] py-10">
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
      <div className="min-h-[calc(100vh-96px)] bg-[#0f1729] py-6 text-white">
        <Container>
          <div className="space-y-6">
            <header className="rounded-3xl border border-white/15 bg-white/10 p-5 shadow-[0_18px_40px_rgba(6,12,24,0.35)]">
              <p className="text-[11px] uppercase tracking-[0.35em] text-white/60">Panel de vendedor</p>
              <h1 className="mt-2 text-2xl font-semibold">Hola, {displayName}</h1>
              <p className="mt-1 text-sm text-white/70">Gestioná tu tienda y mantené al día tus publicaciones.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button to="/publicar" className="bg-white text-[#14212e] hover:bg-white/90">
                  Nueva publicación
                </Button>
                <Button to="/marketplace" variant="ghost" className="text-white/80">
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
                <div className="rounded-3xl border border-white/15 bg-white text-[#14212e] shadow-[0_18px_40px_rgba(6,12,24,0.25)]">
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
                  {TABS.map((tab) => {
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
    <div className="min-h-[calc(100vh-120px)] bg-[#101c29] py-10">
      <Container>
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_35px_80px_rgba(12,20,28,0.45)]">
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
              <Button to="/publicar" className="bg-white text-[#14212e] hover:bg-white/90">
                Nueva publicación
              </Button>
            </div>
          </header>

          <div className="grid gap-6 p-6 lg:grid-cols-[260px_1fr]">
            <nav className="hidden rounded-3xl border border-white/10 bg-white/[0.08] p-3 text-sm text-white/80 md:block">
              <ul className="grid gap-1">
                {TABS.map((tab) => (
                  <li key={tab}>
                    <button
                      type="button"
                      onClick={() => handleSelectTab(tab)}
                      className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                        activeTab === tab
                          ? 'bg-white text-[#14212e] shadow-lg'
                          : 'hover:bg白/10'.replace('白', 'white') /* evita encoding raro */
                      }`}
                    >
                      {tab}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <section className="rounded-3xl border border-white/10 bg-white p-6 shadow-[0_25px_60px_rgba(12,20,28,0.25)]">
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
                {TABS.map((tab) => (
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
  const stravaProfileUrl = profile?.website_url && profile.website_url.toLowerCase().includes('strava.com')
    ? normaliseUrl(profile.website_url)
    : null
  const stravaConnected = Boolean(stravaProfileUrl)
  const handleConnectStrava = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.open('https://www.strava.com/', '_blank', 'noopener')
    }
  }, [])

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

  const reputationScore = profile?.verified ? 5 : totalListings >= 5 ? 5 : totalListings >= 3 ? 4 : 3
  const reputationDescription = reputationScore >= 5
    ? 'Excelente reputación. Mantené la respuesta rápida para sostenerla.'
    : reputationScore >= 4
      ? 'Muy buena reputación. Seguí respondiendo a tiempo para llegar al máximo.'
      : 'Construí tu reputación completando tu perfil y respondiendo rápido.'
  return (
    <div className="space-y-6">
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
          label="Perfil de Strava"
          value={stravaConnected ? 'Conectado' : 'No conectado'}
          trend={
            stravaConnected ? (
              <a
                href={stravaProfileUrl ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-xs font-semibold text-[#14212e] underline"
              >
                Ver mi Strava
              </a>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={handleConnectStrava}
                className="w-full border border-dashed border-[#14212e]/30 text-[#14212e]"
              >
                Conectar Strava
              </Button>
            )
          }
        />
      </div>

      <div className="rounded-2xl border border-[#14212e]/10 bg-white p-5 shadow">
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
                  <span className="text-sm font-medium text-[#14212e]">{reputationScore} / 5</span>
                </div>
                <p className="mt-1 text-xs text-[#14212e]/60">{reputationDescription}</p>
              </dd>
            </div>
          </dl>
        </div>
        <div className="rounded-2xl border border-[#14212e]/10 bg-white p-5">
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

function ListingsView({ listings, onRefresh }: { listings: Listing[]; onRefresh?: () => Promise<void> | void }) {
  const navigate = useNavigate()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!successMessage || typeof window === 'undefined') return
    const timeout = window.setTimeout(() => setSuccessMessage(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [successMessage])
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
    setSuccessMessage('La publicación fue archivada. Podés reactivarla cuando quieras.')
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
    setSuccessMessage(isSold ? 'La publicación vuelve a estar activa.' : 'Marcaste la publicación como vendida.')
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
    setSuccessMessage('La publicación fue eliminada permanentemente.')
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
    setSuccessMessage('Se actualizó el precio correctamente.')
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#14212e]">Tus publicaciones</h2>
          <p className="text-sm text-[#14212e]/60">Gestioná precios, stock y visibilidad desde acá.</p>
        </div>
        <Button to="/publicar" className="bg-[#14212e] text-white hover:bg-[#1b2f3f]">
          Publicar nuevo aviso
        </Button>
      </header>
      {successMessage && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700" role="status" aria-live="polite">
          {successMessage}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 items-start">
        {listings.map((listing) => (
          <div key={listing.id} className="space-y-3">
            <ListingCard l={listing} />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                className="flex-1 min-w-[150px] text-xs py-2"
                onClick={() =>
                  navigate(
                    `/publicar/nueva?id=${listing.id}&type=${
                      listing.category === 'Accesorios'
                        ? 'accessory'
                        : listing.category === 'Indumentaria'
                          ? 'apparel'
                          : 'bike'
                    }`
                  )
                }
              >
                Editar
              </Button>
              <Button
                variant="secondary"
                className={`flex-1 min-w-[150px] text-xs py-2 ${listing.status === 'sold' ? 'border border-[#14212e]/20 bg-[#14212e]/10 text-[#14212e]' : ''}`}
                onClick={() => void handleToggleSold(listing)}
              >
                {listing.status === 'sold' ? 'Marcar disponible' : 'Marcar vendida'}
              </Button>
              <Button
                variant="secondary"
                className="flex-1 min-w-[150px] text-xs py-2"
                onClick={() => void handleReducePrice(listing)}
                disabled={listing.status === 'sold'}
              >
                Reducir precio
              </Button>
              <Button
                variant="ghost"
                className="flex-1 min-w-[150px] text-xs py-2"
                onClick={() => void handleArchive(listing.id)}
              >
                Archivar
              </Button>
              <Button
                variant="ghost"
                className="flex-1 min-w-[150px] text-xs py-2 text-red-600"
                onClick={() => void handleDelete(listing.id)}
              >
                Eliminar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
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
          Buscá modelos en el marketplace y marcá con ★ tus preferidas para compararlas más tarde.
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
    case 'Editar perfil':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.651-1.651a1.5 1.5 0 112.121 2.121L8.25 17.341 4.5 18.75l1.409-3.75L16.862 4.487z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5v6a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 16.5V8.25A2.25 2.25 0 016.75 6h6" />
        </svg>
      )
    case 'Suscripción':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6l1.902 3.855 4.258.62-3.08 3.002.727 4.237L12 15.75l-3.807 2.002.727-4.237-3.08-3.001 4.258-.62L12 6z" />
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
  const [whatsappLocal, setWhatsappLocal] = useState(() => sanitizeLocalWhatsappInput(extractLocalWhatsapp(profile?.whatsapp_number ?? '')))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const initialAvatar = profile?.avatar_url ?? listing?.sellerAvatar ?? ''
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setFullName(profile?.full_name ?? '')
    setProvince(profile?.province ?? '')
    setCity(profile?.city ?? '')
    setPreferredBike(profile?.preferred_bike ?? '')
    setInstagram(profile?.instagram_handle ?? '')
    setFacebook(profile?.facebook_handle ?? '')
    setWebsite(profile?.website_url ?? '')
    setWhatsappLocal(sanitizeLocalWhatsappInput(extractLocalWhatsapp(profile?.whatsapp_number ?? '')))
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
      if (supabaseEnabled && supabase) {
        await supabase.from('listings').update({ seller_avatar: url }).eq('seller_id', userId)
      }
      setAvatarUrl(url)
      if (onProfileUpdated) await onProfileUpdated()
      setSuccess('Se actualizó el perfil correctamente.')
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
      const formattedWhatsapp = whatsappLocal ? normaliseWhatsapp(whatsappLocal) : null
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
        whatsapp: formattedWhatsapp
      })
      if (!result.success) {
        throw new Error(result.error ?? 'No pudimos guardar tu perfil. Intentá nuevamente.')
      }
      if (onProfileUpdated) await onProfileUpdated()
      setSuccess('Se actualizó el perfil correctamente.')
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

        {/* WhatsApp — único input */}
        <label className="text-sm font-medium text-[#14212e]">
          WhatsApp (privado)
          <div className="mt-1 flex items-stretch">
            <span className="inline-flex items-center rounded-l-lg border border-[#14212e]/10 border-r-0 bg-[#14212e]/5 px-3 text-sm text-[#14212e]/80">
              +54
            </span>
            <input
              className="input mt-0 rounded-l-none"
              inputMode="numeric"
              pattern="[0-9]*"
              value={whatsappLocal}
              onChange={(e) => setWhatsappLocal(sanitizeLocalWhatsappInput(e.target.value))}
              placeholder="91122334455"
            />
          </div>
          <span className="text-xs text-[#14212e]/60">
            Ingresá tu número local sin el +54. Lo usamos para autocompletar tus publicaciones con botón de WhatsApp.
          </span>
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

function SubscriptionView({ listings }: { listings: Listing[] }) {
  const navigate = useNavigate()
  const { plans, activeSubscription, loading, cancelSubscription, updateAutoRenew } = usePlans()
  const [updatingAuto, setUpdatingAuto] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  if (loading) {
    return <div className="py-10 text-center text-[#14212e]/60">Cargando información de tu plan…</div>
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
    <div className="rounded-2xl border border-[#14212e]/10 bg-white p-4 shadow">
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
