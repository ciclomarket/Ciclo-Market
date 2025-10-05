
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Container from '../components/Container'
import Button from '../components/Button'
import ListingCard from '../components/ListingCard'
import { mockListings } from '../mock/mockData'
import { getPlanLabel, isPlanActive } from '../utils/plans'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseEnabled } from '../services/supabase'
import { archiveListing, fetchListingsBySeller, reduceListingPrice } from '../services/listings'
import { fetchUserProfile, type UserProfileRecord, upsertUserProfile } from '../services/users'
import type { Listing } from '../types'
import { usePlans } from '../context/PlanContext'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { uploadAvatar } from '../services/storage'
import { PROVINCES, OTHER_CITY_OPTION } from '../constants/locations'
import { BIKE_CATEGORIES } from '../constants/catalog'
import { deriveProfileSlug, pickDiscipline } from '../utils/user'
import { useNotifications } from '../context/NotificationContext'
import { useChat } from '../context/ChatContext'

const TABS = ['Perfil', 'Publicaciones', 'Notificaciones', 'Chat', 'Editar perfil', 'Suscripción', 'Cerrar sesión'] as const

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' })

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
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Perfil')
  const [sellerListings, setSellerListings] = useState<Listing[]>([])
  const [profile, setProfile] = useState<UserProfileRecord | null>(null)
  const [loading, setLoading] = useState(true)

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
    const tabParam = searchParams.get('tab')
    if (tabParam && TABS.includes(tabParam as (typeof TABS)[number])) {
      setActiveTab(tabParam as (typeof TABS)[number])
    }
    const threadParam = searchParams.get('thread')
    if (threadParam) {
      setActiveTab('Chat')
    }
  }, [searchParams])

  const profileNeedsInfo = useMemo(() => {
    if (!user) return false
    const preferredBike = profile?.preferred_bike ?? ''
    return !profile || !profile.province || !profile.city || !preferredBike.trim()
  }, [user, profile])

  const [showProfileModal, setShowProfileModal] = useState(false)

  useEffect(() => {
    if (!loading && profileNeedsInfo) {
      setShowProfileModal(true)
    }
  }, [loading, profileNeedsInfo])

  const sellerProfile = sellerListings[0]

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

  return (
    <div className="min-h-[calc(100vh-120px)] bg-[#101c29] py-10">
      <Container>
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_35px_80px_rgba(12,20,28,0.45)]">
          <header className="border-b border-white/10 bg-[#14212e]/90 px-6 py-6 text-white">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-white/70">Panel de vendedor</p>
                <h1 className="text-2xl font-semibold">Bienvenido, {sellerProfile?.sellerName || 'Ciclista'}</h1>
              </div>
              <Button to="/publicar/nueva" className="bg-white text-[#14212e] hover:bg-white/90">
                Nueva publicación
              </Button>
            </div>
          </header>

          <div className="grid gap-6 p-6 lg:grid-cols-[260px_1fr]">
            <nav className="rounded-3xl border border-white/10 bg-white/[0.08] p-3 text-sm text-white/80">
              <ul className="grid gap-1">
                {TABS.map((tab) => (
                  <li key={tab}>
                    <button
                      type="button"
                      onClick={() => setActiveTab(tab)}
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

            <section className="rounded-3xl border border-white/10 bg-white p-6 shadow-[0_25px_60px_rgba(12,20,28,0.25)]">
              {activeTab === 'Perfil' && (
                <ProfileView
                  listing={sellerProfile}
                  profile={profile}
                  totalListings={sellerListings.length}
                  fallbackEmail={user?.email ?? undefined}
                  onEditProfile={() => setShowProfileModal(true)}
                  profileNeedsInfo={profileNeedsInfo}
                  isModerator={isModerator}
                />
              )}
              {activeTab === 'Publicaciones' && <ListingsView listings={sellerListings} onRefresh={loadData} />}
              {activeTab === 'Notificaciones' && <NotificationsView />}
              {activeTab === 'Chat' && (
                <ChatView
                  initialThreadId={searchParams.get('thread')}
                  clearThreadParam={() => {
                    const next = new URLSearchParams(searchParams)
                    next.delete('thread')
                    setSearchParams(next, { replace: true })
                  }}
                />
              )}
              {activeTab === 'Editar perfil' && (
                <EditProfileView
                  profile={profile}
                  listing={sellerProfile}
                  userId={user?.id}
                  onProfileUpdated={loadData}
                />
              )}
              {activeTab === 'Suscripción' && <SubscriptionView listings={sellerListings} />}
              {activeTab === 'Cerrar sesión' && <SignOutView onSignOut={logout} />}
            </section>
          </div>
        </div>
        <ProfileDetailsModal
          open={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          profile={profile}
          userId={user?.id}
          userEmail={user?.email}
          onSaved={loadData}
        />
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
}: {
  listing: Listing | undefined
  profile: UserProfileRecord | null
  totalListings: number
  fallbackEmail?: string
  onEditProfile: () => void
  profileNeedsInfo: boolean
  isModerator: boolean
}) {
  const planLabel = getPlanLabel(listing?.sellerPlan, listing?.sellerPlanExpires)
  const planActive = isPlanActive(listing?.sellerPlan, listing?.sellerPlanExpires)
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
  const websiteLink = profile?.website_url ? normaliseUrl(profile.website_url) : null
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
          <div
            className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
              planActive ? 'bg-[#14212e]/10 text-[#14212e]' : 'bg-[#14212e]/5 text-[#14212e]/60'
            }`}
          >
            <span className={`size-2 rounded-full ${planActive ? 'bg-[#14212e]' : 'bg-[#14212e]/40'}`} />
            {planLabel}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <ProfileStat label="Publicaciones activas" value={totalListings} />
        <ProfileStat label="Consultas sin responder" value={3} trend="+1 hoy" />
        <ProfileStat label="Plan" value={planLabel} trend={planActive ? 'Activo' : 'Vencido'} />
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
          <ul className="mt-3 space-y-2 text-sm text-[#14212e]/80">
            <li>• Última venta concretada: 12 de febrero</li>
            <li>• Valor promedio de publicación: USD 4.200</li>
            <li>• 5 compradores con reputación positiva este mes</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-[#14212e]/10 bg-white p-5">
          <h3 className="text-sm font-semibold text-[#14212e] uppercase tracking-wide">Próximos pasos sugeridos</h3>
          <ul className="mt-3 space-y-2 text-sm text-[#14212e]/80">
            <li>• Actualizá tus fotos con luz natural para destacar en portada.</li>
            <li>• Activá envío asegurado en la Domane SL 6.</li>
            <li>• Configurá respuestas rápidas para agilizar tus chats.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function ListingsView({ listings, onRefresh }: { listings: Listing[]; onRefresh?: () => Promise<void> | void }) {
  const navigate = useNavigate()
  if (!listings.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <h3 className="text-lg font-semibold text-[#14212e]">Todavía no tenés publicaciones activas</h3>
        <p className="max-w-md text-sm text-[#14212e]/70">
          Subí tu primera bicicleta o accesorio y aparecé en las búsquedas del Marketplace. Recordá que podés destacarte con el plan Destacada o Pro.
        </p>
        <Button to="/publicar/nueva" className="bg-[#14212e] text-white hover:bg-[#1b2f3f]">
          Publicar ahora
        </Button>
      </div>
    )
  }

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('¿Seguro que querés archivar esta publicación? Podrás reactivarla luego.')
    if (!confirmed) return
    const ok = await archiveListing(id)
    if (!ok) {
      alert('No pudimos archivar la publicación. Intentá nuevamente.')
      return
    }
    if (onRefresh) await onRefresh()
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
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#14212e]">Tus publicaciones</h2>
          <p className="text-sm text-[#14212e]/60">Gestioná precios, stock y visibilidad desde acá.</p>
        </div>
        <Button to="/publicar/nueva" className="bg-[#14212e] text-white hover:bg-[#1b2f3f]">
          Publicar nueva bicicleta
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {listings.map((listing) => (
          <div key={listing.id} className="space-y-3">
            <ListingCard l={listing} />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                className="flex-1 min-w-[150px] text-xs py-2"
                onClick={() => navigate(`/publicar/nueva?id=${listing.id}`)}
              >
                Editar
              </Button>
              <Button
                variant="secondary"
                className="flex-1 min-w-[150px] text-xs py-2"
                onClick={() => void handleReducePrice(listing)}
              >
                Reducir precio
              </Button>
              <Button
                variant="ghost"
                className="flex-1 min-w-[150px] text-xs py-2 text-red-600"
                onClick={() => void handleDelete(listing.id)}
              >
                Archivar
              </Button>
            </div>
          </div>
        ))}
      </div>
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
        Recibirás alertas por email para que ninguna oferta o mensaje importante se pierda.
      </p>
    </div>
  )
}

function ChatView({ initialThreadId, clearThreadParam }: { initialThreadId?: string | null; clearThreadParam?: () => void }) {
  const { user } = useAuth()
  const { threads, loadingThreads, activeThreadId, selectThread, messages, loadingMessages, sendMessage } = useChat()
  const [draft, setDraft] = useState('')

  const activeThread = useMemo(() => threads.find((thread) => thread.id === activeThreadId) ?? null, [threads, activeThreadId])

  useEffect(() => {
    if (!initialThreadId) return
    const exists = threads.some((thread) => thread.id === initialThreadId)
    if (exists) {
      selectThread(initialThreadId)
      if (clearThreadParam) clearThreadParam()
    }
  }, [initialThreadId, threads, selectThread, clearThreadParam])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.trim()) return
    await sendMessage(draft)
    setDraft('')
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-[#14212e]">Chats y ofertas</h2>
      <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
        <div className="space-y-2">
          {loadingThreads && (
            <div className="rounded-2xl border border-[#14212e]/10 bg-[#14212e]/5 p-4 text-sm text-[#14212e]/70">
              Cargando conversaciones…
            </div>
          )}
          {!loadingThreads && threads.length === 0 && (
            <div className="rounded-2xl border border-[#14212e]/10 bg-[#14212e]/5 p-6 text-sm text-[#14212e]/70">
              Todavía no tenés chats. Respondé consultas desde tus publicaciones.
            </div>
          )}
          {threads.map((thread) => {
            const timeAgo = relativeTimeFromNow(thread.lastMessageCreatedAt ?? thread.last_message_at)
            const isActive = thread.id === activeThreadId
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => selectThread(thread.id)}
                className={`flex w-full flex-col gap-1 rounded-2xl border px-4 py-3 text-left transition ${
                  isActive ? 'border-[#14212e] bg-white shadow' : 'border-[#14212e]/10 bg-white/80 hover:border-[#14212e]/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-full bg-[#14212e]/10 text-sm font-semibold text-[#14212e]">
                      {thread.otherParticipantName.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[#14212e]">{thread.otherParticipantName}</p>
                      <p className="text-xs text-[#14212e]/50">{thread.listing_title ?? 'Consulta privada'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-[#14212e]/50">{timeAgo || 'hace instantes'}</p>
                    {thread.unreadCount > 0 && (
                      <span className="mt-1 inline-flex items-center justify-center rounded-full bg-[#14212e] px-2 py-0.5 text-[10px] font-semibold text-white">
                        {thread.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
                {thread.lastMessageSnippet && (
                  <p className="text-xs text-[#14212e]/60 line-clamp-2">
                    {thread.lastMessageAuthorId === user?.id ? 'Vos: ' : ''}{thread.lastMessageSnippet}
                  </p>
                )}
              </button>
            )
          })}
        </div>

        <div className="rounded-2xl border border-[#14212e]/10 bg-white p-0">
          {!activeThread && (
            <div className="flex h-full items-center justify-center p-6 text-sm text-[#14212e]/60">
              Seleccioná una conversación para verla.
            </div>
          )}

          {activeThread && (
            <div className="flex h-full flex-col">
              <header className="flex items-center gap-3 border-b border-[#14212e]/10 bg-[#14212e]/5 px-4 py-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-[#14212e]/20 text-lg font-semibold text-[#14212e]">
                  {activeThread.otherParticipantName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#14212e]">{activeThread.otherParticipantName}</h3>
                  <p className="text-xs text-[#14212e]/60">{activeThread.listing_title ?? 'Consulta directa'}</p>
                </div>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {loadingMessages && (
                  <div className="text-sm text-[#14212e]/60">Cargando mensajes…</div>
                )}
                {!loadingMessages && messages.length === 0 && (
                  <div className="text-sm text-[#14212e]/60">Todavía no hay mensajes en este hilo.</div>
                )}
                {messages.map((message) => {
                  const isMine = message.author_id === user?.id
                  const timeAgo = relativeTimeFromNow(message.created_at)
                  const displayName = isMine ? 'Vos' : activeThread.otherParticipantName
                  return (
                    <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow ${
                          isMine ? 'bg-[#14212e] text-white' : 'bg-[#f2f6fb] text-[#14212e]'
                        }`}
                      >
                        <p className={`text-[11px] font-semibold ${isMine ? 'text-white/70' : 'text-[#14212e]/70'}`}>{displayName}</p>
                        <p className="mt-1 whitespace-pre-line text-sm">{message.body}</p>
                        <span className={`mt-2 block text-[10px] ${isMine ? 'text-white/70' : 'text-[#14212e]/60'}`}>
                          {timeAgo || 'Hace instantes'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <form onSubmit={handleSubmit} className="border-t border-[#14212e]/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <input
                    className="input flex-1"
                    placeholder="Escribí tu mensaje"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <Button type="submit" disabled={!draft.trim()} className="bg-[#14212e] text-white hover:bg-[#1b2f3f]">
                    Enviar
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EditProfileView({
  profile,
  listing,
  userId,
  onProfileUpdated,
}: {
  profile: UserProfileRecord | null
  listing: Listing | undefined
  userId?: string
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setAvatarUrl(initialAvatar)
  }, [profile, initialAvatar])

  const cityOptions = province ? PROVINCES.find((item) => item.name === province)?.cities ?? [] : []
  const showCityOther = city === OTHER_CITY_OPTION

  const handleAvatarUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !userId) return
    setAvatarUploading(true)
    setAvatarError(null)
    try {
      const url = await uploadAvatar(fileList[0], userId)
      if (!url) throw new Error('No pudimos subir la imagen')
      await upsertUserProfile({ id: userId, avatarUrl: url })
      if (supabaseEnabled && supabase) {
        await supabase.from('listings').update({ seller_avatar: url }).eq('seller_id', userId)
      }
      setAvatarUrl(url)
      if (onProfileUpdated) await onProfileUpdated()
    } catch (err: any) {
      setAvatarError(err?.message ?? 'No pudimos subir la imagen. Intentá nuevamente.')
    } finally {
      setAvatarUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!userId || !profile?.email) {
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
      await upsertUserProfile({
        id: userId,
        email: profile.email,
        fullName: fullName.trim(),
        province,
        city: finalCity,
        profileSlug: deriveProfileSlug({
          fullName: fullName.trim(),
          discipline: pickDiscipline(preferredBike ? [preferredBike] : []),
          fallback: profile.email.split('@')[0] ?? 'usuario'
        }),
        preferredBike: preferredBike || null,
        instagramHandle: instagram ? normaliseHandle(instagram) : null,
        facebookHandle: facebook ? normaliseUrl(facebook) : null,
        websiteUrl: website ? normaliseUrl(website) : null
      })
      if (onProfileUpdated) await onProfileUpdated()
    } catch (err: any) {
      setError(err?.message ?? 'No pudimos guardar tu perfil. Intentá nuevamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-[#14212e]">Editar perfil</h2>
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

function ProfileDetailsModal({
  open,
  onClose,
  profile,
  userId,
  userEmail,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  profile: UserProfileRecord | null
  userId?: string
  userEmail?: string | null
  onSaved?: () => Promise<void> | void
}) {
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [province, setProvince] = useState(profile?.province ?? '')
  const [city, setCity] = useState(profile?.city ?? '')
  const [cityOther, setCityOther] = useState('')
  const [preferredBike, setPreferredBike] = useState(profile?.preferred_bike ?? '')
  const [instagram, setInstagram] = useState(profile?.instagram_handle ?? '')
  const [facebook, setFacebook] = useState(profile?.facebook_handle ?? '')
  const [website, setWebsite] = useState(profile?.website_url ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setFullName(profile?.full_name ?? '')
    setProvince(profile?.province ?? '')
    setCity(profile?.city ?? '')
    setPreferredBike(profile?.preferred_bike ?? '')
    setInstagram(profile?.instagram_handle ?? '')
    setFacebook(profile?.facebook_handle ?? '')
    setWebsite(profile?.website_url ?? '')
  }, [profile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || !userEmail) {
      setError('Necesitás una sesión activa para guardar el perfil.')
      return
    }
    const finalCity = city === OTHER_CITY_OPTION ? cityOther.trim() : city
    if (!fullName.trim() || !province || !finalCity.trim()) {
      setError('Completá nombre, provincia y ciudad.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await upsertUserProfile({
        id: userId,
        email: userEmail,
        fullName: fullName.trim(),
        province,
        city: finalCity,
        profileSlug: deriveProfileSlug({
          fullName: fullName.trim(),
          discipline: pickDiscipline(preferredBike ? [preferredBike] : []),
          fallback: userEmail.split('@')[0] ?? 'usuario'
        }),
        preferredBike: preferredBike || null,
        instagramHandle: instagram ? normaliseHandle(instagram) : null,
        facebookHandle: facebook ? normaliseUrl(facebook) : null,
        websiteUrl: website ? normaliseUrl(website) : null
      })
      if (onSaved) await onSaved()
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'No pudimos guardar el perfil. Intentá nuevamente.')
    } finally {
      setSaving(false)
    }
  }

  const cityOptions = province ? PROVINCES.find((p) => p.name === province)?.cities ?? [] : []
  const showCityOther = city === OTHER_CITY_OPTION

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#14212e]">Completá tu perfil</h2>
            <p className="text-sm text-[#14212e]/70">Necesitamos tu ubicación y preferencias para personalizar tu experiencia.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="mt-4 grid gap-4" onSubmit={handleSubmit}>
          <label className="text-sm font-medium text-[#14212e]">
            Nombre completo
            <input className="input mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} />
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
              <select
                className="select mt-1"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={!province}
              >
                <option value="">{province ? 'Seleccioná ciudad' : 'Elegí provincia primero'}</option>
                {cityOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
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
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" className="bg-[#14212e] text-white hover:bg-[#1b2f3f]" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar perfil'}
            </Button>
          </div>
        </form>
      </div>
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

function ProfileStat({ label, value, trend }: { label: string; value: number | string; trend?: string }) {
  return (
    <div className="rounded-2xl border border-[#14212e]/10 bg-white p-4 shadow">
      <p className="text-xs uppercase tracking-wide text-[#14212e]/50">{label}</p>
      <div className="mt-2 text-2xl font-bold text-[#14212e]">{value}</div>
      {trend && <p className="text-xs text-[#14212e]/60">{trend}</p>}
    </div>
  )
}
