import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Container from '../components/Container'
import ImageCarousel from '../components/ImageCarousel'
import Button from '../components/Button'
import { mockListings } from '../mock/mockData'
import { useCurrency } from '../context/CurrencyContext'
import { formatListingPrice } from '../utils/pricing'
import { getPlanLabel, hasPaidPlan, isPlanVerified } from '../utils/plans'
import { useCompare } from '../context/CompareContext'
import useFaves from '../hooks/useFaves'
import { fetchListing, updateListingPlan, deleteListing } from '../services/listings'
import { supabaseEnabled, getSupabaseClient } from '../services/supabase'
import type { Listing } from '../types'
import { formatNameWithInitial } from '../utils/user'
import { normaliseWhatsapp, buildWhatsappUrl } from '../utils/whatsapp'
import { useAuth } from '../context/AuthContext'
import { fetchUserProfile, fetchUserContactEmail, setUserVerificationStatus, type UserProfileRecord } from '../services/users'
import { logContactEvent, fetchSellerReviews } from '../services/reviews'
import SEO from '../components/SEO'
import JsonLd from '../components/JsonLd'
import { trackMetaPixel } from '../lib/metaPixel'
import { useToast } from '../context/ToastContext'
import ListingQuestionsSection from '../components/ListingQuestionsSection'
import { submitShareBoost } from '../services/shareBoost'
import useUpload from '../hooks/useUpload'

export default function ListingDetail() {
  const params = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, isModerator } = useAuth()
  const { format, fx } = useCurrency()
  const { show: showToast } = useToast()
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  // Oferta deshabilitada
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [moderatorUpdating, setModeratorUpdating] = useState(false)
  const [sellerVerified, setSellerVerified] = useState(false)
  const [applyingHighlight, setApplyingHighlight] = useState(false)
  const [sellerProfile, setSellerProfile] = useState<UserProfileRecord | null>(null)
  const [sellerAuthEmail, setSellerAuthEmail] = useState<string | null>(null)
  const [sellerRating, setSellerRating] = useState<{ avg: number; count: number } | null>(null)
  const { ids: compareIds, toggle: toggleCompare } = useCompare()
  const { has: hasFav, toggle: toggleFav } = useFaves()
  const listingKey = params.slug ?? params.id ?? ''
  // Necesario antes de efectos que lo usan
  const isOwner = Boolean(user?.id && listing?.sellerId && user.id === listing.sellerId)

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!listingKey) {
        setListing(null)
        setLoading(false)
        return
      }
      setLoading(true)
      if (supabaseEnabled) {
        const result = await fetchListing(listingKey)
        if (!active) return
        if (result) {
          setListing(result)
          setLoading(false)
          try {
            // Track ViewContent when a listing is loaded
            trackMetaPixel('ViewContent', {
              content_ids: [result.id],
              content_type: 'product',
              content_category: result.category,
              value: Number(result.price) || 0,
              currency: (result.priceCurrency || 'ARS').toUpperCase()
            })
          } catch { /* noop */ }
          return
        }
      }
      if (!active) return
      const fallback = mockListings.find((l) => l.slug === listingKey || l.id === listingKey) ?? null
      setListing(fallback)
      if (fallback) {
        try {
          trackMetaPixel('ViewContent', {
            content_ids: [fallback.id],
            content_type: 'product',
            content_category: fallback.category,
            value: Number(fallback.price) || 0,
            currency: (fallback.priceCurrency || 'ARS').toUpperCase()
          })
        } catch { /* noop */ }
      }
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [listingKey])

  useEffect(() => {
    const loadSellerProfile = async () => {
      if (!listing?.sellerId || !supabaseEnabled) {
        setSellerProfile(null)
        setSellerVerified(false)
        return
      }
      setSellerVerified(false)
      const profile = await fetchUserProfile(listing.sellerId)
      setSellerProfile(profile)
      setSellerVerified(Boolean(profile?.verified))
    }
    void loadSellerProfile()
  }, [listing?.sellerId])

  // Aplicar destaque automáticamente tras volver de checkout (Option A)
  useEffect(() => {
    const doApply = async () => {
      if (!listing || !isOwner) return
      const payment = searchParams.get('payment')
      const hd = Number(searchParams.get('highlightDays') || '')
      if (payment !== 'success' || !hd || applyingHighlight) return
      try {
        setApplyingHighlight(true)
        // Obtener token de supabase
        if (supabaseEnabled) {
          const client = getSupabaseClient()
          const { data } = await client.auth.getSession()
          const t = data.session?.access_token || null
          const res = await fetch(`/api/listings/${listing.id}/highlight`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
            body: JSON.stringify({ days: hd })
          })
          if (!res.ok) throw new Error('No pudimos aplicar el destaque')
          showToast('Destaque aplicado')
          // Limpiar params
          searchParams.delete('payment'); searchParams.delete('highlightDays')
          setSearchParams(searchParams, { replace: true })
          // refrescar datos
          setListing((prev) => prev ? { ...prev, sellerPlan: 'featured' as any } : prev)
        }
      } catch (e) {
        console.warn('[listing-detail] auto-highlight failed', e)
        showToast('No pudimos aplicar el destaque automáticamente', { variant: 'error' } as any)
      } finally {
        setApplyingHighlight(false)
      }
    }
    void doApply()
  }, [listing?.id, isOwner, applyingHighlight, searchParams, setSearchParams])

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!listing?.sellerId) { setSellerRating(null); return }
      const data = await fetchSellerReviews(listing.sellerId)
      if (!active) return
      if (data?.summary) setSellerRating({ avg: data.summary.avgRating, count: data.summary.count })
    }
    void load()
    return () => { active = false }
  }, [listing?.sellerId])

  useEffect(() => {
    let active = true
    if (!listing?.sellerId) {
      setSellerAuthEmail(null)
      return
    }
    const load = async () => {
      try {
        const email = await fetchUserContactEmail(listing.sellerId)
        if (active) setSellerAuthEmail(email)
      } catch {
        if (active) setSellerAuthEmail(null)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [listing?.sellerId])

  // Oferta deshabilitada

  if (loading) return <Container>Cargando publicación…</Container>
  if (!listing) return <Container>Publicación no encontrada.</Container>

  const articleSummaryParts = [listing.brand, listing.model, listing.year ? String(listing.year) : null].filter(Boolean)
  const articleSummary = articleSummaryParts.length ? articleSummaryParts.join(' ') : listing.title
  const listingSlugOrId = listing.slug ?? listing.id
  const listingPath = `/listing/${listingSlugOrId}`
  const envFrontendOrigin = (import.meta.env.VITE_FRONTEND_URL || '').trim()
  const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const frontendOrigin = (envFrontendOrigin || runtimeOrigin || 'https://ciclomarket.ar').replace(/\/$/, '')
  const canonicalUrl = `${frontendOrigin}${listingPath}`
  const envShareBase = (import.meta.env.VITE_SHARE_BASE_URL || import.meta.env.VITE_API_BASE_URL || '').trim()
  const shareBase = envShareBase ? envShareBase.replace(/\/$/, '') : ''
  const resolvedShareOrigin = (shareBase || frontendOrigin || '').replace(/\/$/, '')
  // Para previews OG en WhatsApp/Facebook, usamos siempre el ID en el endpoint del backend
  const shareId = listing.id
  const cacheBust = listing.createdAt ? String(listing.createdAt) : String(Date.now())
  const shareUrl = resolvedShareOrigin
    ? `${resolvedShareOrigin}/share/listing/${shareId}?v=${encodeURIComponent(cacheBust)}`
    : `${canonicalUrl}?v=${encodeURIComponent(cacheBust)}`
  const sellerPreferredLink =
    sellerProfile?.website_url ??
    (listing as any)?.sellerLink ??
    (listing as any)?.sellerWebsite ??
    (listing as any)?.sellerUrl ??
    null
  const linkForMessage = sellerPreferredLink || shareUrl
  const waMessageBase = `Hola! Me interesa este artículo ${articleSummary}.`
  const waMessage = linkForMessage ? `${waMessageBase} ${linkForMessage}` : waMessageBase
  const sellerWhatsappRaw = listing.sellerWhatsapp ?? sellerProfile?.whatsapp_number ?? ''
  const sellerWhatsappNumber = normaliseWhatsapp(sellerWhatsappRaw)
  const waLink = buildWhatsappUrl(sellerWhatsappNumber ?? sellerWhatsappRaw, waMessage.trim())
  const sellerAvatarUrl = sellerProfile?.store_avatar_url || listing.sellerAvatar || sellerProfile?.avatar_url || null

  const formattedPrice = formatListingPrice(listing.price, listing.priceCurrency, format, fx)
  const originalPriceLabel = listing.originalPrice
    ? formatListingPrice(listing.originalPrice, listing.priceCurrency, format, fx)
    : null
  const effectivePlan = (listing.sellerPlan ?? (listing.plan as any))
  const planLabel = getPlanLabel(effectivePlan, listing.sellerPlanExpires)
  const paidPlanActive = hasPaidPlan(effectivePlan, listing.sellerPlanExpires)
  const hadBasicOrPremium = effectivePlan === 'basic' || effectivePlan === 'premium'
  const verifiedVendor = sellerVerified
  const inCompare = compareIds.includes(listing.id)
  const isFav = hasFav(listing.id)
  const isFeaturedListing = hasPaidPlan(effectivePlan, listing.sellerPlanExpires)
  const listingSold = listing.status === 'sold'
  const listingUnavailable = listingSold || listing.status === 'archived' || listing.status === 'paused' || listing.status === 'expired'
  const canSubmitOffer = !isOwner && !listingUnavailable

  const shareTitle = `${listing.brand} ${listing.model}${listing.year ? ` ${listing.year}` : ''}`.trim()
  const shareDescription = listing.description?.slice(0, 120) ?? 'Encontrá esta bicicleta en Ciclo Market.'
  const shareImage = listing.images?.[0]
  const shareText = `${shareTitle} - ${shareDescription}`

  // Extraer specs desde description/extras (tokens "Clave: Valor")
  const extractToken = (label: string): string | null => {
    const sources = [listing.description || '', listing.extras || '']
    const pattern = new RegExp(`${label}\s*:\s*([^•\n]+)`, 'i')
    for (const src of sources) {
      const m = src.match(pattern)
      if (m && m[1]) return m[1].trim()
    }
    return null
  }
  const specCondition = extractToken('Condici[óo]n')
  const specBrake = extractToken('Tipo de freno') || extractToken('Freno')
  const specFork = extractToken('Horquilla')
  const specFixieRatio = extractToken('Relaci[óo]n')
  const specMotor = extractToken('Motor')
  const specCharge = extractToken('Carga')
  const isBikeCategory = listing.category !== 'Accesorios' && listing.category !== 'Indumentaria'

  const openShareWindow = (url: string) => {
    if (typeof window === 'undefined') return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleShare = (platform: 'whatsapp' | 'facebook') => {
    if (!shareUrl) return
    const encodedUrl = encodeURIComponent(shareUrl)
    const encodedText = encodeURIComponent(shareText)
    switch (platform) {
      case 'whatsapp':
        openShareWindow(`https://wa.me/?text=${encodedText}%20${encodedUrl}`)
        break
      case 'facebook':
        // Usa sharer con quote para prellenar texto; la imagen se toma de las OG tags
        openShareWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`)
        break
      default:
        break
    }
  }

  const handleInstagramShare = async () => {
    // Intento 1: Web Share API (móvil) para abrir hoja de compartir (incluye Instagram si está instalada)
    try {
      const navShare = (navigator as any)?.share
      if (navShare && typeof navShare === 'function') {
        await (navigator as any).share({ title: shareTitle, text: shareText, url: shareUrl })
        return
      }
    } catch (err) {
      // Si el usuario cancela o falla, seguimos al fallback
      console.warn('[listing-detail] web share cancelled or failed', err)
    }

    // Intento 2: Copiar enlace al portapapeles y abrir Instagram Direct en una pestaña nueva
    try {
      await navigator.clipboard?.writeText?.(shareUrl)
      showToast('Link copiado. Abrimos Instagram Direct…')
    } catch {
      // ignorar si no hay permisos
    }
    openShareWindow('https://www.instagram.com/direct/new/')
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard?.writeText?.(shareUrl)
      showToast('Link copiado al portapapeles')
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = shareUrl
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        showToast('Link copiado al portapapeles')
      } catch {
        showToast('No pudimos copiar el link automáticamente', { variant: 'error' })
      }
    }
  }

  // Oferta deshabilitada

  const handleModeratorHighlight = async (plan: Listing['sellerPlan'] | null, durationDays: number | null) => {
    if (!listing) return
    setModeratorUpdating(true)
    try {
      const updated = await updateListingPlan({ id: listing.id, plan, durationDays })
      if (updated) {
        setListing(updated)
      }
    } catch (error) {
      console.error('[listing-detail] moderator highlight failed', error)
      alert('No pudimos actualizar el destaque. Intentá nuevamente.')
    } finally {
      setModeratorUpdating(false)
    }
  }

  const handleModeratorVerify = async (verified: boolean) => {
    if (!listing?.sellerId) return
    setModeratorUpdating(true)
    try {
      const ok = await setUserVerificationStatus(listing.sellerId, verified)
      if (ok) {
        setSellerVerified(verified)
      }
    } catch (error) {
      console.error('[listing-detail] moderator verify failed', error)
      alert('No pudimos actualizar la verificación. Intentá nuevamente.')
    } finally {
      setModeratorUpdating(false)
    }
  }

  const handleModeratorDelete = async () => {
    if (!listing) return
    const confirmed = window.confirm('Estás por eliminar esta publicación de forma permanente. ¿Confirmás que querés continuar?')
    if (!confirmed) return
    setModeratorUpdating(true)
    try {
      const ok = await deleteListing(listing.id)
      if (!ok) {
        alert('No pudimos eliminar la publicación. Intentá nuevamente.')
        return
      }
      showToast('La publicación fue eliminada correctamente')
      navigate('/marketplace')
    } catch (error) {
      console.error('[listing-detail] moderator delete failed', error)
      alert('No pudimos eliminar la publicación. Intentá nuevamente.')
    } finally {
      setModeratorUpdating(false)
    }
  }

  const ContactIcons = () => {
    if (!user) {
      return (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#14212e]/60">
            Contactate con el vendedor
          </p>
          <p className="text-sm text-[#14212e]/70">Registrate para ver información de contacto</p>
        </div>
      )
    }

    const items: Array<{ id: string; label: string; onClick?: () => void; href?: string; icon: ReactNode; disabled?: boolean; className?: string }> = []
    const emailRecipient = sellerAuthEmail || sellerProfile?.email || listing.sellerEmail || null

    // WhatsApp habilitado para publicaciones Básica o Premium (aunque el destaque haya vencido)
    if (waLink && !isOwner && !listingUnavailable && hadBasicOrPremium) {
      items.push({
        id: 'whatsapp',
        label: 'Abrir WhatsApp',
        href: waLink,
        icon: <WhatsappIcon />,
        className: 'bg-[#25D366]'
      })
    }
    if (emailRecipient) {
      items.push({
        id: 'email',
        label: 'Enviar correo',
        href: `mailto:${emailRecipient}?subject=${encodeURIComponent(`Consulta sobre ${listing.title}`)}`,
        icon: <MailIcon />,
        className: 'bg-[#0b1724]'
      })
    }

    if (items.length === 0) return null

    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#14212e]/60">
          Contactate con el vendedor
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {items.map((item) =>
            item.href ? (
              <a
                key={item.id}
                href={item.href}
                target={item.href.startsWith('mailto:') ? undefined : '_blank'}
                rel={item.href.startsWith('mailto:') ? undefined : 'noreferrer'}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-white shadow transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 ${item.className}`}
                aria-label={item.label}
                title={item.label}
                onClick={() => {
                  try {
                    if (item.id === 'whatsapp') {
                      trackMetaPixel('Contact', { method: 'whatsapp', content_ids: [listing.id], content_type: 'product' })
                      logContactEvent({ sellerId: listing.sellerId, listingId: listing.id, buyerId: user?.id || null, type: 'whatsapp' })
                    } else if (item.id === 'email') {
                      trackMetaPixel('Contact', { method: 'email', content_ids: [listing.id], content_type: 'product' })
                      logContactEvent({ sellerId: listing.sellerId, listingId: listing.id, buyerId: user?.id || null, type: 'email' })
                    }
                  } catch { /* noop */ }
                }}
              >
                <span className="sr-only">{item.label}</span>
                <span className="text-white">{item.icon}</span>
              </a>
            ) : (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                disabled={item.disabled}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-white shadow transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 ${item.className} ${item.disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                aria-label={item.label}
                title={item.label}
              >
                <span className="sr-only">{item.label}</span>
                <span className="text-white">{item.icon}</span>
              </button>
            )
          )}
        </div>
        {!hadBasicOrPremium && (
          <p className="mt-2 text-xs text-[#14212e]/60">El contacto por WhatsApp está disponible con planes Básica o Premium.</p>
        )}
      </div>
    )
  }

  const firstImage = listing.images?.[0]
  const metaDescription = listing.description?.trim() || 'Bicicleta disponible en Ciclo Market.'
  const priceAmount = Number.isFinite(listing.price) ? listing.price.toString() : null
  const priceCurrency = (listing.priceCurrency ?? 'ARS').toUpperCase()
  const productAvailability = listing.status === 'sold' ? 'oos' : 'instock'

  const isStore = Boolean(sellerProfile?.store_enabled)
  const storeLink = isStore ? (sellerProfile?.store_slug ? `/tienda/${sellerProfile.store_slug}` : `/tienda/${listing.sellerId}`) : null
  const sellerDisplayName = isStore
    ? (sellerProfile?.store_name || 'Tienda')
    : formatNameWithInitial(listing.sellerName, undefined)

  return (
    <>
      <SEO title={listing.title} description={metaDescription} image={firstImage} url={canonicalUrl} type="product">
        <meta property="product:availability" content={productAvailability} />
        {priceAmount ? (
          <>
            <meta property="product:price:amount" content={priceAmount} />
            <meta property="product:price:currency" content={priceCurrency} />
          </>
        ) : null}
        {/* JSON-LD Product */}
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: listing.title,
            description: metaDescription,
            image: Array.isArray(listing.images) && listing.images.length ? listing.images : (firstImage ? [firstImage] : []),
            brand: listing.brand || undefined,
            category: listing.category || undefined,
            offers: priceAmount
              ? {
                  '@type': 'Offer',
                  price: priceAmount,
                  priceCurrency,
                  availability: productAvailability === 'instock' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                  url: canonicalUrl,
                }
              : undefined,
          }}
        />
      </SEO>
      <div className="bg-[#14212e]">
        <Container>
          <div className="grid w-full gap-4 lg:gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="order-2 w-full min-w-0 lg:col-start-2 lg:row-start-1 lg:self-start lg:sticky lg:top-32">
            <div className="card p-6 lg:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl lg:text-xl font-bold text-[#14212e] leading-tight">{listing.title}</h1>
                  <p className="mt-2 lg:mt-1 text-sm text-[#14212e]/70">{listing.location}</p>
                  {isFeaturedListing && (
                    <span className="mt-3 lg:mt-2 inline-flex items-center gap-2 rounded-full bg-[#14212e] px-3 py-1 text-xs font-semibold text-white">
                      Destacada 🔥
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <IconButton label={isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'} onClick={() => toggleFav(listing.id)}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                      <path d="M12 21.35s-6.63-4.35-9.33-8.35C-0.03 9.78.36 5.96 3.05 4.04 5.06 2.62 7.92 3 9.7 4.79L12 7.1l2.3-2.31c1.78-1.78 4.64-2.17 6.65-.75 2.69 1.92 3.08 5.74.38 8.96C18.63 17 12 21.35 12 21.35Z" />
                    </svg>
                  </IconButton>
                  <IconButton label={inCompare ? 'Quitar de comparativa' : 'Agregar a comparativa'} onClick={() => toggleCompare(listing.id)}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm2 0v16h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-6Z" />
                    </svg>
                  </IconButton>
                </div>
              </div>
              <div className="mt-2 flex items-end gap-3">
                <span className="text-3xl lg:text-2xl font-extrabold text-mb-primary">{formattedPrice}</span>
                {originalPriceLabel && <span className="text-sm text-[#14212e]/60 line-through">{originalPriceLabel}</span>}
              </div>
              {/* Sección de información de la tienda (teléfono/dirección) removida a pedido */}
              <p className="mt-4 text-xs text-[#14212e]/60 lg:hidden">
                Guardá o compará esta bici para decidir más tarde.
              </p>

              <div className="mt-5 lg:mt-4 space-y-3 lg:space-y-2 border-t border-[#14212e]/10 pt-5 lg:pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {sellerAvatarUrl && (
                      <img
                        src={sellerAvatarUrl}
                        alt={formatNameWithInitial(listing.sellerName, 'Vendedor')}
                        className="h-10 w-10 rounded-full object-cover border border-[#14212e]/10"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-[#14212e]/70">Publicado por</p>
                      <h3 className="text-lg font-semibold text-[#14212e]">
                        {isStore ? (
                          <Link to={storeLink!} className="inline-flex items-center gap-2 transition hover:text-mb-primary">
                            <span className="truncate">{sellerDisplayName}</span>
                            <span className="text-[#14212e]/40">|</span>
                            <VerifiedCheck />
                            <span className="text-sm text-[#14212e]/80">Tienda oficial</span>
                          </Link>
                        ) : (
                          <Link to={`/vendedor/${listing.sellerId}`} className="inline-flex items-center gap-2 transition hover:text-mb-primary">
                            {sellerDisplayName}
                            {sellerVerified && <VerifiedCheck />}
                          </Link>
                        )}
                      </h3>
                      {!isStore && (
                        <p className="text-xs text-[#14212e]/60">{listing.sellerLocation || 'Ubicación reservada'}</p>
                      )}
                      {sellerRating && sellerRating.count > 0 && (
                        <div className="mt-1 flex items-center gap-2 text-xs text-[#14212e]/70">
                          <StarRating value={sellerRating.avg} />
                          <span>({sellerRating.count})</span>
                        </div>
                      )}
                      {isStore && (
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#14212e]/70">
                          {sellerProfile?.store_website && (
                            <a href={sellerProfile.store_website} target="_blank" rel="noreferrer" className="underline">Sitio web</a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-[#14212e]/60">
                  {isStore ? (
                    <Link to={storeLink!} className="inline-flex items-center gap-1 text-[#14212e] underline">
                      Ver tienda oficial
                    </Link>
                  ) : (
                    <Link to={`/vendedor/${listing.sellerId}`} className="inline-flex items-center gap-1 text-[#14212e] underline">
                      Ver perfil del vendedor
                    </Link>
                  )}
                  {isFeaturedListing && <p className="mt-1 text-[11px] text-[#14212e]/60">Publicación destacada en el marketplace.</p>}
                </div>
                <div className="space-y-3">
                  {/* Botón de oferta removido */}
                  <ContactIcons />
                  {isOwner && (
                    <div className="pt-2 border-t border-[#14212e]/10">
                      <Link
                        to={`/listing/${listingSlugOrId}/destacar`}
                        className="inline-flex items-center gap-2 rounded-full bg-[#14212e] px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-[#1b2f3f]"
                      >
                        Destacar publicación
                      </Link>
                    </div>
                  )}
                  {!canSubmitOffer && listingSold && (
                    <p className="text-xs font-semibold text-[#0f766e]">Esta publicación está marcada como vendida.</p>
                  )}
                  {/* Mensaje de ofertas removido */}
                </div>
                <div className="mt-3 pt-3 border-t border-[#14212e]/10">
                  <p className="text-xs text-[#14212e]/60 uppercase tracking-wide">Compartir publicación</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <IconCircleButton
                      size="sm"
                      label="Copiar link"
                      onClick={handleCopyLink}
                      className="bg-white text-[#14212e] border border-[#14212e]"
                      icon={<LinkIcon />}
                    />
                    <IconCircleButton
                      size="sm"
                      label="Compartir por WhatsApp"
                      onClick={() => handleShare('whatsapp')}
                      className="bg-white text-[#25D366] border border-[#25D366]"
                      icon={<WhatsappIcon />}
                    />
                    <IconCircleButton
                      size="sm"
                      label="Compartir en Facebook"
                      onClick={() => handleShare('facebook')}
                      className="bg-white text-[#1877F2] border border-[#1877F2]"
                      icon={<FacebookIcon />}
                    />
                    <IconCircleButton
                      size="sm"
                      label="Enviar por Instagram"
                      onClick={handleInstagramShare}
                      className="bg-white text-[#c13584] border border-[#c13584]"
                      icon={<InstagramIcon />}
                    />
                  </div>
                  {isOwner && (
                    <div className="mt-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-[#14212e]/20 px-3 py-1.5 text-xs font-semibold text-[#14212e] hover:bg-[#14212e]/5"
                        onClick={() => setShareModalOpen(true)}
                      >
                        Compartí y ganá 7 días de destaque
                      </button>
                    </div>
                  )}
                </div>
                {/* Texto relacionado a ofertas removido en mobile */}
                {isFeaturedListing && (
                  <p className="text-xs font-semibold text-[#14212e] lg:hidden">
                    Esta publicación está destacada con prioridad en la sección de destacados.
                  </p>
                )}
                {sellerVerified && (
                  <p className="text-xs text-[#14212e]/70 lg:hidden">Vendedor verificado por el equipo de moderación.</p>
                )}
                {isModerator && (
                  <div className="mt-4 space-y-2 border-t border-[#14212e]/10 pt-3">
                    <p className="text-xs uppercase tracking-wide text-[#14212e]/60">Acciones de moderador</p>
                    {/* Info de vigencias */}
                    <div className="text-xs text-[#14212e]/70">
                      {(() => {
                        const now = Date.now()
                        const expiresAt = listing.expiresAt || null
                        const planExpires = listing.sellerPlanExpires || null
                        const fmt = (ms: number) => {
                          const days = Math.ceil((ms - now) / (24*60*60*1000))
                          return days <= 0 ? 'vencido' : `${days} día${days===1?'':'s'}`
                        }
                        return (
                          <>
                            <div>Publicación activa: {expiresAt ? fmt(expiresAt) : 'sin fecha'}</div>
                            <div>Destaque: {planExpires ? fmt(planExpires) : 'sin destaque'}</div>
                          </>
                        )
                      })()}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        disabled={moderatorUpdating}
                        onClick={() => handleModeratorHighlight('basic', 7)}
                      >
                        Destacar 7 días 🔥
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={moderatorUpdating}
                        onClick={() => handleModeratorHighlight('premium', 14)}
                      >
                        Destacar 14 días ⚡
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={moderatorUpdating}
                        onClick={() => handleModeratorHighlight(null as any, null)}
                        className="text-red-600"
                      >
                        Quitar destaque
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        disabled={moderatorUpdating || sellerVerified}
                        onClick={() => handleModeratorVerify(true)}
                      >
                        Verificar vendedor
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={moderatorUpdating || !sellerVerified}
                        onClick={() => handleModeratorVerify(false)}
                        className="text-red-600"
                      >
                        Quitar verificación
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        disabled={moderatorUpdating}
                        onClick={() => void handleModeratorDelete()}
                        className="text-red-600"
                      >
                        Eliminar publicación
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="order-1 w-full min-w-0 lg:col-start-1 lg:row-start-1">
            <ImageCarousel images={listing.images} />
          </div>

          <div className="order-3 w-full min-w-0 lg:col-start-1 lg:row-start-2">
            <section className="card p-6">
              <h2 className="text-lg font-semibold text-[#14212e]">Especificaciones</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Spec label="Marca" value={listing.brand} />
                <Spec label="Modelo" value={listing.model} />
                {listing.year ? <Spec label="Año" value={String(listing.year)} /> : null}
                <Spec label="Categoría" value={listing.category} />
                {/* Orden: Material + Horquilla (si existe) + Talle */}
                {listing.material ? <Spec label="Material" value={listing.material} /> : null}
                {listing.category === 'MTB' && specFork ? <Spec label="Horquilla" value={specFork} /> : null}
                {listing.frameSize ? <Spec label="Talle / Medida" value={listing.frameSize} /> : null}
                {/* Luego Ruedas + Rodado */}
                {listing.wheelset ? <Spec label="Ruedas" value={listing.wheelset} /> : null}
                {listing.wheelSize ? <Spec label="Rodado" value={listing.wheelSize} /> : null}
                {/* Grupo de transmisión */}
                {(listing.drivetrain || listing.drivetrainDetail) ? (
                  <Spec label="Grupo" value={(listing.drivetrain || listing.drivetrainDetail) as string} />
                ) : null}
                {/* Tipo de freno */}
                {isBikeCategory && specBrake ? <Spec label="Freno" value={specBrake} /> : null}
                {/* Opcionales según categoría */}
                {listing.category === 'Fixie' && specFixieRatio ? <Spec label="Relación" value={specFixieRatio} /> : null}
                {listing.category === 'E-Bike' && specMotor ? <Spec label="Motor" value={specMotor} /> : null}
                {listing.category === 'E-Bike' && specCharge ? <Spec label="Batería / Carga" value={specCharge} /> : null}
                {isBikeCategory && specCondition ? <Spec label="Condición" value={specCondition} /> : null}
                {listing.extras ? <Spec label="Extras" value={listing.extras} fullWidth /> : null}
              </div>
            </section>
          </div>

          <div className="order-4 w-full min-w-0 lg:col-start-1 lg:row-start-3">
            <section className="card p-6">
              <h2 className="text-lg font-semibold text-[#14212e]">Descripción</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#14212e]/80 whitespace-pre-wrap">
                {listing.description}
              </p>
            </section>
          </div>

          

          <div className="order-6 w-full min-w-0 lg:col-start-1 lg:row-start-4">
            <ListingQuestionsSection listing={listing} listingUnavailable={listingUnavailable} />
          </div>
        </div>
        </Container>
      </div>
      {/* Modal de oferta removido */}
      {shareModalOpen && listing && isOwner && (
        <ShareBoostModal
          listingId={listing.id}
          sellerId={listing.sellerId}
          onClose={() => setShareModalOpen(false)}
        />
      )}
    </>
  )
}

// Modal de oferta eliminado

function IconCircleButton({ label, icon, onClick, className, size = 'md' }: { label: string; icon: ReactNode; onClick: () => void; className?: string; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex ${sizeClass} items-center justify-center rounded-full shadow transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 ${className ?? ''}`}
    >
      <span className="sr-only">{label}</span>
      <span>{icon}</span>
    </button>
  )
}

const WhatsappIcon = () => (
  <img src="/whatsapp.png" alt="" className="h-5 w-5" loading="lazy" decoding="async" aria-hidden="true" />
)

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
    <path d="M13.5 8.5V6.8c0-.8.5-1 1-.9h1.8V3h-2.6C10.5 3 10 5.3 10 6.6v1.9H8v3h2v9h3.5v-9h2.3l.5-3h-2.8Z" />
  </svg>
)

const XIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
    <path d="M4 3h3.3l4.2 6.2L16.1 3H20l-6.1 8.2L20 21h-3.3l-4.5-6.6L7.9 21H4l6.2-9L4 3Z" />
  </svg>
)

const SmsIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
    <path d="M4 3h16c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H8l-4 4v-4H4c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2Zm2 6v1h12V9H6Zm0-3v1h12V6H6Zm0 5v1h8v-1H6Z" />
  </svg>
)

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
    <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3.5a4.5 4.5 0 1 1-4.5 4.5A4.5 4.5 0 0 1 12 7.5Zm0 2a2.5 2.5 0 1 0 2.5 2.5A2.5 2.5 0 0 0 12 9.5Zm5-3a1 1 0 1 1-1-1 1 1 0 0 1 1 1Z" />
  </svg>
)

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path vectorEffect="non-scaling-stroke" d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 1 0-7.07-7.07L10.6 5.33" />
    <path vectorEffect="non-scaling-stroke" d="M14 11a5 5 0 0 0-7.07 0L4.81 13.1a5 5 0 0 0 7.07 7.07L13.4 18.67" />
  </svg>
)

const VerifiedCheck = () => (
  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#1d9bf0] text-white" aria-hidden="true">
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 7.5 4.1 3 6v6c0 5 3.4 9.4 9 10 5.6-.6 9-5 9-10V6l-4.5-1.9L12 2Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  </span>
)

const MailIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
    <path d="M4 5h16a2 2 0 0 1 2 2v10c0 1.1-.9 2-2 2H4a2 2 0 0 1-2-2V7c0-1.1.9-2 2-2Zm0 2v.5l8 5 8-5V7H4Zm16 10v-7.3l-7.4 4.6a1 1 0 0 1-1.2 0L4 9.7V17h16Z" />
  </svg>
)

function Spec({ label, value, fullWidth = false }: { label: string; value: string; fullWidth?: boolean }) {
  return (
    <div className={fullWidth ? 'col-span-2' : undefined}>
      <p className="text-xs uppercase tracking-wide text-[#14212e]/50">{label}</p>
      <p className="mt-1 text-sm font-medium text-[#14212e]">{value || '—'}</p>
    </div>
  )
}

function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      className="rounded-full border border-[#14212e]/10 bg-white/80 p-2 text-[#14212e] transition hover:bg-[#14212e]/10"
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ShareBoostModal({ listingId, sellerId, onClose }: { listingId: string; sellerId: string; onClose: () => void }) {
  const { show: showToast } = useToast()
  const { uploadFiles, uploading, progress } = useUpload()
  const [handle, setHandle] = useState('')
  const [note, setNote] = useState('')
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [type, setType] = useState<'story' | 'post'>('story')
  const [reward, setReward] = useState<'boost7' | 'photos2'>('boost7')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    try {
      const urls = await uploadFiles([files[0]])
      setProofUrl(urls[0] || null)
    } catch (err: any) {
      setError(err?.message || 'No pudimos subir la imagen')
    }
  }

  const onSubmit = async () => {
    setSaving(true)
    setError(null)
    try {
      await submitShareBoost({ listingId, sellerId, type, handle: handle.trim() || null, proofUrl, note: note.trim() || null, reward })
      showToast('Enviamos tu comprobante. Lo revisaremos en breve.')
      onClose()
    } catch (err: any) {
      setError(err?.message || 'No pudimos enviar el comprobante.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#14212e]">Compartí y obtené beneficios</h2>
            <p className="text-sm text-[#14212e]/70">Enviá una captura de tu story o post mencionando @ciclomarket.ar</p>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose}>✕</button>
        </div>
        <div className="mt-4 space-y-3">
          <div className="flex gap-3">
            <label className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${type === 'story' ? 'border-[#14212e] bg-[#14212e]/10 text-[#14212e]' : 'border-[#14212e]/20 text-[#14212e]/80'}`}>
              <input type="radio" name="sb-type" checked={type === 'story'} onChange={() => setType('story')} /> Story
            </label>
            <label className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${type === 'post' ? 'border-[#14212e] bg-[#14212e]/10 text-[#14212e]' : 'border-[#14212e]/20 text-[#14212e]/80'}`}>
              <input type="radio" name="sb-type" checked={type === 'post'} onChange={() => setType('post')} /> Post
            </label>
          </div>
          <div className="flex gap-3">
            <label className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${reward === 'boost7' ? 'border-[#14212e] bg-[#14212e]/10 text-[#14212e]' : 'border-[#14212e]/20 text-[#14212e]/80'}`}>
              <input type="radio" name="sb-reward" checked={reward === 'boost7'} onChange={() => setReward('boost7')} /> 7 días destacado
            </label>
            <label className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${reward === 'photos2' ? 'border-[#14212e] bg-[#14212e]/10 text-[#14212e]' : 'border-[#14212e]/20 text-[#14212e]/80'}`}>
              <input type="radio" name="sb-reward" checked={reward === 'photos2'} onChange={() => setReward('photos2')} /> +2 fotos
            </label>
          </div>
          <div>
            <label className="text-sm font-medium text-[#14212e]">Tu Instagram (opcional)</label>
            <input className="input mt-1" placeholder="@tu_usuario" value={handle} onChange={(e) => setHandle(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-[#14212e]">Nota (opcional)</label>
            <input className="input mt-1" placeholder="Algo para que veamos en la captura" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-[#14212e]">Subí una captura</label>
            <input className="mt-1" type="file" accept="image/*" onChange={(e) => onUpload(e.target.files)} />
            {uploading && <p className="text-xs text-[#14212e]/60 mt-1">Subiendo… {progress}%</p>}
            {proofUrl && <p className="text-xs text-[#14212e]/70 mt-1">Comprobante cargado ✔</p>}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={() => void onSubmit()} disabled={saving} className="bg-[#14212e] text-white hover:bg-[#1b2f3f]">{saving ? 'Enviando…' : 'Enviar'}</Button>
          </div>
        </div>
      </div>
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
                  <linearGradient id="half-grad" x1="0" x2="1">
                    <stop offset="50%" stopColor="currentColor" />
                    <stop offset="50%" stopColor="transparent" />
                  </linearGradient>
                </defs>
                <path d="M12 17.3 6.5 20.2l1-5.8L3 10.2l5.8-.9L12 4l3.2 5.3 5.8.9-4.5 4.2 1 5.8Z" fill="url(#half-grad)" />
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
