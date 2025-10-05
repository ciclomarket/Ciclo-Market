
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Container from '../components/Container'
import Button from '../components/Button'
import ListingCard from '../components/ListingCard'
import { mockListings } from '../mock/mockData'
import { getPlanLabel, isPlanActive } from '../utils/plans'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseEnabled } from '../services/supabase'
import { fetchListingsBySeller } from '../services/listings'
import { fetchUserProfile, type UserProfileRecord, upsertUserProfile } from '../services/users'
import type { Listing } from '../types'
import { usePlans } from '../context/PlanContext'
import { useNavigate } from 'react-router-dom'
import { uploadAvatar } from '../services/storage'
import { PROVINCES, OTHER_CITY_OPTION } from '../constants/locations'
import { BIKE_CATEGORIES } from '../constants/catalog'

const TABS = ['Perfil', 'Publicaciones', 'Notificaciones', 'Chat', 'Editar perfil', 'Suscripción', 'Cerrar sesión'] as const

export default function Dashboard() {
  const { user, logout } = useAuth()
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

  const profileNeedsInfo = useMemo(() => {
    if (!user) return false
    const prefs = profile?.bike_preferences ?? []
    return !profile || !profile.province || !profile.city || prefs.length === 0
  }, [user, profile])

  const [showProfileModal, setShowProfileModal] = useState(false)

  useEffect(() => {
    if (!loading && profileNeedsInfo) {
      setShowProfileModal(true)
    }
  }, [loading, profileNeedsInfo])

  const sellerProfile = sellerListings[0]

  const notifications = useMemo(
    () => [
      {
        id: 'notif-1',
        title: 'Nueva oferta recibida',
        body: 'Mariana hizo una oferta por tu Specialized Tarmac SL7 por USD 5.400.',
        time: 'Hace 2 horas',
      },
      {
        id: 'notif-2',
        title: 'Publicación destacada',
        body: 'Tu plan Destacado está activo. Aprovechá para compartir en redes.',
        time: 'Ayer',
      },
      {
        id: 'notif-3',
        title: 'Recordatorio de entrega',
        body: 'Coordiná la logística con Javier para la Domane SL 6.',
        time: 'Hace 3 días',
      },
    ],
    []
  )

  const chats = useMemo(
    () => [
      {
        id: 'chat-1',
        name: 'Mariana López',
        listing: sellerListings[0]?.title ?? 'Tu publicación',
        lastMessage: '¿Podemos coordinar una visita esta semana? 😄',
        time: '15:42',
        unread: 2,
      },
      {
        id: 'chat-2',
        name: 'Javier Torres',
        listing: sellerListings[1]?.title ?? 'Consulta',
        lastMessage: 'Perfecto, confirmame la horario.',
        time: 'Ayer',
        unread: 0,
      },
      {
        id: 'chat-3',
        name: 'Ana Pereyra',
        listing: sellerListings[2]?.title ?? 'Publicación',
        lastMessage: '¿Aceptás permuta por cuadro?',
        time: 'Hace 3 días',
        unread: 0,
      },
    ],
    [sellerListings]
  )

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
                />
              )}
              {activeTab === 'Publicaciones' && <ListingsView listings={sellerListings} />}
              {activeTab === 'Notificaciones' && <NotificationsView items={notifications} />}
              {activeTab === 'Chat' && <ChatView items={chats} />}
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
          username={user?.user_metadata?.username || user?.user_metadata?.user_name || user?.email?.split('@')[0] || undefined}
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
}: {
  listing: Listing | undefined
  profile: UserProfileRecord | null
  totalListings: number
  fallbackEmail?: string
  onEditProfile: () => void
  profileNeedsInfo: boolean
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
          <h2 className="text-2xl font-semibold text-[#14212e]">{displayName}</h2>
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

function ListingsView({ listings }: { listings: Listing[] }) {
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
          <ListingCard key={listing.id} l={listing} />
        ))}
      </div>
    </div>
  )
}

function NotificationsView({ items }: { items: { id: string; title: string; body: string; time: string }[] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-[#14212e]">Notificaciones</h2>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-[#14212e]/10 bg-[#14212e]/5 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#14212e]">{item.title}</h3>
              <span className="text-xs text-[#14212e]/60">{item.time}</span>
            </div>
            <p className="mt-2 text-sm text-[#14212e]/80">{item.body}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-[#14212e]/60">
        Recibirás un correo por cada nueva oferta o mensaje importante.
      </p>
    </div>
  )
}

function ChatView({ items }: { items: { id: string; name: string; listing: string; lastMessage: string; time: string; unread: number }[] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-[#14212e]">Chats y ofertas</h2>
      <div className="space-y-3">
        {items.map((chat) => (
          <button
            key={chat.id}
            type="button"
            className="w-full rounded-2xl border border-[#14212e]/10 bg-white p-4 text-left shadow hover:border-[#14212e]/30"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#14212e]">{chat.name}</p>
                <p className="text-xs text-[#14212e]/50">{chat.listing}</p>
              </div>
              <div className="text-xs text-[#14212e]/50 text-right">
                <p>{chat.time}</p>
                {chat.unread > 0 && (
                  <span className="mt-1 inline-flex items-center justify-center rounded-full bg-[#14212e] px-2 py-0.5 text-[10px] font-semibold text-white">
                    {chat.unread}
                  </span>
                )}
              </div>
            </div>
            <p className="mt-2 text-sm text-[#14212e]/80 line-clamp-2">{chat.lastMessage}</p>
          </button>
        ))}
      </div>
      <p className="text-xs text-[#14212e]/60">
        Los chats activos también envían alertas por mail para que no pierdas ofertas.
      </p>
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
  const initialAvatar = profile?.avatar_url ?? listing?.sellerAvatar ?? ''
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (initialAvatar && initialAvatar !== avatarUrl) {
      setAvatarUrl(initialAvatar)
    }
  }, [initialAvatar, avatarUrl])

  const handleAvatarUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    if (!userId) {
      setAvatarError('Necesitás iniciar sesión para actualizar tu foto de perfil.')
      return
    }
    const file = fileList[0]
    setAvatarUploading(true)
    setAvatarError(null)
    try {
      const url = await uploadAvatar(file, userId)
      if (!url) throw new Error('No pudimos obtener la URL de la imagen')
      await upsertUserProfile({ id: userId, avatarUrl: url })
      if (supabaseEnabled && supabase) {
        await supabase
          .from('listings')
          .update({ seller_avatar: url })
          .eq('seller_id', userId)
      }
      setAvatarUrl(url)
      if (onProfileUpdated) await onProfileUpdated()
    } catch (error: any) {
      setAvatarError(error?.message ?? 'No pudimos subir la imagen. Intentá nuevamente.')
    } finally {
      setAvatarUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const displayName = profile?.full_name ?? listing?.sellerName ?? ''
  const displayLocation = profile?.city
    ? profile.province
      ? `${profile.city}, ${profile.province}`
      : profile.city
    : listing?.sellerLocation ?? ''
  const whatsapp = listing?.sellerWhatsapp ?? ''

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-[#14212e]">Editar perfil</h2>
      <form className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-[#14212e] sm:col-span-2">
          Foto de perfil
          <div className="mt-2 flex items-center gap-3">
            <div className="size-16 overflow-hidden rounded-2xl bg-[#14212e]/10">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName || 'Vendedor'} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm text-[#14212e]/60">
                  {(displayName || 'CM')[0]}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
              >
                {avatarUploading ? 'Subiendo…' : 'Subir nueva foto'}
              </Button>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="hidden"
                onChange={(event) => handleAvatarUpload(event.target.files)}
              />
              {avatarError && <span className="text-xs text-red-600">{avatarError}</span>}
              <span className="text-xs text-[#14212e]/60">Usá imágenes JPG o PNG de hasta 5MB.</span>
            </div>
          </div>
        </label>

        <label className="text-sm font-medium text-[#14212e]">
          Nombre completo
          <input className="input mt-1" defaultValue={displayName} placeholder="Nombre y apellido" />
        </label>
        <label className="text-sm font-medium text-[#14212e]">
          Email de contacto
          <input className="input mt-1" defaultValue={profile?.email ?? ''} placeholder="hola@tudominio.com" />
        </label>
        <label className="text-sm font-medium text-[#14212e]">
          Ubicación
          <input className="input mt-1" defaultValue={displayLocation} placeholder="Ciudad, Provincia" />
        </label>
        <label className="text-sm font-medium text-[#14212e]">
          WhatsApp comercial
          <input className="input mt-1" defaultValue={whatsapp} placeholder="+54911..." />
        </label>
        <label className="text-sm font-medium text-[#14212e]">
          Contraseña actual
          <input className="input mt-1" type="password" placeholder="••••••" />
        </label>
        <label className="text-sm font-medium text-[#14212e]">
          Nueva contraseña
          <input className="input mt-1" type="password" placeholder="••••••" />
        </label>
        <label className="text-sm font-medium text-[#14212e] sm:col-span-2">
          Descripción para compradores
          <textarea className="textarea mt-1" placeholder="Contá brevemente cómo trabajás, entregas, políticas, etc." defaultValue="Vendedor confiable, entrega inmediata en CABA y envíos a todo el país." />
        </label>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <Button type="button" className="bg-[#14212e] text-white hover:bg-[#1b2f3f]">
            Guardar cambios
          </Button>
          <span className="text-xs text-[#14212e]/60">Los cambios se reflejarán en tu perfil público y publicaciones.</span>
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
  username,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  profile: UserProfileRecord | null
  userId?: string
  userEmail?: string | null
  username?: string | null
  onSaved?: () => Promise<void> | void
}) {
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [province, setProvince] = useState(profile?.province ?? '')
  const [city, setCity] = useState(profile?.city ?? '')
  const [cityOther, setCityOther] = useState('')
  const [bikePrefs, setBikePrefs] = useState<string[]>(profile?.bike_preferences ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setFullName(profile?.full_name ?? '')
    setProvince(profile?.province ?? '')
    setCity(profile?.city ?? '')
    setBikePrefs(profile?.bike_preferences ?? [])
  }, [profile])

  const togglePref = (value: string) => {
    setBikePrefs((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

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
        username: username ?? userEmail.split('@')[0],
        fullName: fullName.trim(),
        province,
        city: finalCity,
        bikePreferences: bikePrefs,
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
          <div>
            <span className="text-sm font-medium text-[#14212e]">¿Qué bici te interesa?</span>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {BIKE_CATEGORIES.map((category) => {
                const checked = bikePrefs.includes(category)
                return (
                  <label key={category} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? 'border-mb-primary bg-mb-primary/10' : 'border-black/10'}`}>
                    <input
                      type="checkbox"
                      className="accent-mb-primary"
                      checked={checked}
                      onChange={() => togglePref(category)}
                    />
                    <span>{category}</span>
                  </label>
                )
              })}
            </div>
          </div>
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
