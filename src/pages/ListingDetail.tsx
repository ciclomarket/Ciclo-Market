import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
import { supabaseEnabled } from '../services/supabase'
import type { Listing } from '../types'
import { formatNameWithInitial } from '../utils/user'
import { normaliseWhatsapp, extractLocalWhatsapp, sanitizeLocalWhatsappInput, buildWhatsappUrl } from '../utils/whatsapp'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { sendChatMessage } from '../services/chat'
import { fetchUserProfile, fetchUserContactEmail, setUserVerificationStatus, type UserProfileRecord } from '../services/users'
import { sendOfferEmail } from '../services/offers'
import SEO from '../components/SEO'

export default function ListingDetail() {
  const params = useParams()
  const navigate = useNavigate()
  const { user, isModerator } = useAuth()
  const { createThread } = useChat()
  const { format, fx } = useCurrency()
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [showOfferModal, setShowOfferModal] = useState(false)
  const [offerAmount, setOfferAmount] = useState('')
  const [offerWhatsappLocal, setOfferWhatsappLocal] = useState('')
  const [offerSubmitting, setOfferSubmitting] = useState(false)
  const [offerError, setOfferError] = useState<string | null>(null)
  const [moderatorUpdating, setModeratorUpdating] = useState(false)
  const [sellerVerified, setSellerVerified] = useState(false)
  const [sellerProfile, setSellerProfile] = useState<UserProfileRecord | null>(null)
  const [sellerAuthEmail, setSellerAuthEmail] = useState<string | null>(null)
  const { ids: compareIds, toggle: toggleCompare } = useCompare()
  const { has: hasFav, toggle: toggleFav } = useFaves()
  const listingKey = params.slug ?? params.id ?? ''

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
          return
        }
      }
      if (!active) return
      const fallback = mockListings.find((l) => l.slug === listingKey || l.id === listingKey) ?? null
      setListing(fallback)
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

  useEffect(() => {
    if (!showOfferModal) return
    if (offerWhatsappLocal) return
    const meta = user?.user_metadata ?? {}
    const candidate =
      (typeof meta.whatsapp === 'string' && meta.whatsapp.trim()) ||
      (typeof meta.phone === 'string' && meta.phone.trim()) ||
      ''
    if (candidate) {
      const local = sanitizeLocalWhatsappInput(extractLocalWhatsapp(candidate))
      if (local) setOfferWhatsappLocal(local)
    }
  }, [showOfferModal, offerWhatsappLocal, user?.user_metadata])

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
  const shareUrl = resolvedShareOrigin ? `${resolvedShareOrigin}/share/listing/${listingSlugOrId}` : canonicalUrl
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

  const formattedPrice = formatListingPrice(listing.price, listing.priceCurrency, format, fx)
  const originalPriceLabel = listing.originalPrice
    ? formatListingPrice(listing.originalPrice, listing.priceCurrency, format, fx)
    : null
  const effectivePlan = (listing.sellerPlan ?? (listing.plan as any))
  const planLabel = getPlanLabel(effectivePlan, listing.sellerPlanExpires)
  const paidPlanActive = hasPaidPlan(effectivePlan, listing.sellerPlanExpires)
  const verifiedVendor = sellerVerified
  const inCompare = compareIds.includes(listing.id)
  const isFav = hasFav(listing.id)
  const isOwner = user?.id === listing.sellerId
  const isFeaturedListing = hasPaidPlan(effectivePlan, listing.sellerPlanExpires)
  const listingSold = listing.status === 'sold'
  const listingUnavailable = listingSold || listing.status === 'archived' || listing.status === 'paused' || listing.status === 'expired'
  const canSubmitOffer = !isOwner && !listingUnavailable

  const shareTitle = `${listing.brand} ${listing.model}${listing.year ? ` ${listing.year}` : ''}`.trim()
  const shareDescription = listing.description?.slice(0, 120) ?? 'Encontrá esta bicicleta en Ciclo Market.'
  const shareImage = listing.images?.[0]
  const shareText = `${shareTitle} - ${shareDescription}`

  const openShareWindow = (url: string) => {
    if (typeof window === 'undefined') return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleShare = (platform: 'whatsapp' | 'facebook' | 'x' | 'sms') => {
    if (!shareUrl) return
    const encodedUrl = encodeURIComponent(shareUrl)
    const encodedText = encodeURIComponent(shareText)
    switch (platform) {
      case 'whatsapp':
        openShareWindow(`https://wa.me/?text=${encodedText}%20${encodedUrl}`)
        break
      case 'facebook':
        openShareWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`)
        break
      case 'x':
        openShareWindow(`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`)
        break
      case 'sms':
        if (typeof window !== 'undefined') {
          window.location.href = `sms:?body=${encodedText}%20${encodedUrl}`
        }
        break
      default:
        break
    }
  }

  const handleInstagramShare = async () => {
    if (!shareImage) {
      alert('Necesitás al menos una foto para compartir en Instagram.')
      return
    }
    try {
      const response = await fetch(shareImage)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${listing.slug ?? listing.id}-ciclomarket.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[listing-detail] instagram share failed', error)
      alert('No pudimos preparar la imagen. Intentá nuevamente.')
    }
  }

  const handleOfferSubmit = async () => {
    if (!listing?.sellerId) return
    if (!user) {
      navigate('/login', {
        state: { from: { pathname: `/listing/${listing.slug ?? listing.id}` } }
      })
      return
    }
    if (!offerAmount.trim()) {
      setOfferError('Ingresá un monto válido.')
      return
    }
    const numericAmount = Number(offerAmount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setOfferError('El monto debe ser mayor a cero.')
      return
    }
    const sanitizedWhatsapp = sanitizeLocalWhatsappInput(offerWhatsappLocal)
    if (!sanitizedWhatsapp) {
      setOfferError('Ingresá un número de WhatsApp para que el vendedor pueda contactarte.')
      return
    }
    const buyerWhatsappDigits = normaliseWhatsapp(sanitizedWhatsapp)
    if (!buyerWhatsappDigits) {
      setOfferError('Ingresá un número de WhatsApp válido.')
      return
    }
    const buyerWhatsappLink = `https://wa.me/${buyerWhatsappDigits}`
    setOfferSubmitting(true)
    setOfferError(null)
    try {
      const threadId = await createThread(listing.id, listing.sellerId)
      if (!threadId) {
        throw new Error('No se pudo iniciar el chat con el vendedor.')
      }
      const currency = listing.priceCurrency ?? 'USD'
      const amountLabel = new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'es-AR', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0
      }).format(numericAmount)
      const message = `Hola ${formatNameWithInitial(listing.sellerName, undefined)}. Te ofrezco ${amountLabel} por tu bicicleta ${listing.title}. Podés escribirme en ${buyerWhatsappLink}.`
      await sendChatMessage(threadId, message)

      const sellerEmail = sellerAuthEmail || sellerProfile?.email || listing.sellerEmail || null
      if (sellerEmail) {
        const buyerMetadata = user.user_metadata ?? {}
        const buyerName =
          (typeof buyerMetadata.full_name === 'string' && buyerMetadata.full_name.trim()) ||
          (typeof buyerMetadata.name === 'string' && buyerMetadata.name.trim()) ||
          user.email ||
          null
        const listingUrl = canonicalUrl
        try {
          await sendOfferEmail({
            sellerEmail,
            sellerName: listing.sellerName ?? sellerProfile?.full_name ?? null,
            listingTitle: listing.title,
            listingUrl,
            amountLabel,
            buyerName,
            buyerEmail: user.email ?? null,
            buyerWhatsapp: `+${buyerWhatsappDigits}`
          })
        } catch (notifyError) {
          console.warn('[listing-detail] offer email failed', notifyError)
        }
      }

      let whatsappNotice = ''
      if (sellerWhatsappNumber) {
        const whatsappMessage = `Hola ${formatNameWithInitial(listing.sellerName, undefined)}. Quisiera ofrecerte ${amountLabel} por tu bicicleta ${listing.title}. Podés escribirme por WhatsApp acá: ${buyerWhatsappLink}`
        const whatsappUrl = buildWhatsappUrl(sellerWhatsappNumber, whatsappMessage)
        if (whatsappUrl) {
          window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
          whatsappNotice = 'Abrimos WhatsApp para que envíes tu oferta.'
        } else {
          whatsappNotice = 'No pudimos abrir WhatsApp automáticamente. Verificá el número del vendedor.'
        }
      } else {
        whatsappNotice = 'El vendedor no tiene WhatsApp configurado, pero igual le enviaremos tu oferta por chat y correo.'
      }

      setShowOfferModal(false)
      setOfferAmount('')
      setOfferError(null)
      setOfferWhatsappLocal(sanitizedWhatsapp)
      if (whatsappNotice) {
        const finalMessage = whatsappNotice.includes('correo')
          ? whatsappNotice
          : `${whatsappNotice} También te avisaremos por email cuando el vendedor responda.`
        alert(finalMessage)
      }
    } catch (error: any) {
      console.error('[listing-detail] offer failed', error)
      setOfferError(error?.message ?? 'No pudimos enviar la oferta. Intentá nuevamente.')
    } finally {
      setOfferSubmitting(false)
    }
  }

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
      alert('La publicación fue eliminada correctamente.')
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

    if (waLink && !isOwner && !listingUnavailable) {
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
      </div>
    )
  }

  const firstImage = listing.images?.[0]
  const metaDescription = listing.description?.trim() || 'Bicicleta disponible en Ciclo Market.'
  const priceAmount = Number.isFinite(listing.price) ? listing.price.toString() : null
  const priceCurrency = (listing.priceCurrency ?? 'ARS').toUpperCase()
  const productAvailability = listing.status === 'sold' ? 'oos' : 'instock'

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
      </SEO>
      <Container>
      <div className="grid w-full gap-6 lg:grid-cols-[2fr_1fr] lg:grid-rows-[auto_auto]">
        <div className="order-1 w-full min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          <ImageCarousel images={listing.images} />
        </div>

        <div className="order-2 w-full min-w-0 lg:col-start-2 lg:row-start-1">
          <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
            <div className="card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#14212e] leading-tight">{listing.title}</h1>
                  <p className="mt-2 text-sm text-[#14212e]/70">{listing.location}</p>
                  {isFeaturedListing && (
                    <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#14212e] px-3 py-1 text-xs font-semibold text-white">
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
              <div className="mt-4 flex items-end gap-3">
                <span className="text-3xl font-extrabold text-mb-primary">{formattedPrice}</span>
                {originalPriceLabel && <span className="text-sm text-[#14212e]/60 line-through">{originalPriceLabel}</span>}
              </div>
              <p className="mt-4 text-xs text-[#14212e]/60">
                Guardá o compará esta bici para decidir más tarde.
              </p>
            </div>

            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-[#14212e]/70">Publicado por</p>
                  <h3 className="text-lg font-semibold text-[#14212e]">
                    <Link
                      to={`/vendedor/${listing.sellerId}`}
                      className="inline-flex items-center gap-2 transition hover:text-mb-primary"
                    >
                      {formatNameWithInitial(listing.sellerName, undefined)}
                      {sellerVerified && <VerifiedCheck />}
                    </Link>
                  </h3>
                  <p className="text-xs text-[#14212e]/60">{listing.sellerLocation || 'Ubicación reservada'}</p>
                </div>
              </div>
              <div className="text-xs text-[#14212e]/60">
                <Link to={`/vendedor/${listing.sellerId}`} className="inline-flex items-center gap-1 text-[#14212e] underline">
                  Ver perfil del vendedor
                </Link>
                {isFeaturedListing && <p className="mt-1 text-[11px] text-[#14212e]/60">Publicación destacada en el marketplace.</p>}
              </div>
              <div className="space-y-3">
                {canSubmitOffer && (
                  <button
                    type="button"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#14212e] px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-[#1b2f3f]"
                    onClick={() => setShowOfferModal(true)}
                  >
                    Hacer oferta
                  </button>
                )}
                <ContactIcons />
                {!canSubmitOffer && listingSold && (
                  <p className="text-xs font-semibold text-[#0f766e]">Esta publicación está marcada como vendida.</p>
                )}
                {!canSubmitOffer && !listingSold && !isOwner && (
                  <p className="text-xs text-[#14212e]/60">La publicación no está disponible para recibir ofertas en este momento.</p>
                )}
              </div>
              <div className="pt-4">
                <p className="text-xs text-[#14212e]/60 uppercase tracking-wide">Compartir</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <IconCircleButton
                    label="Compartir por WhatsApp"
                    onClick={() => handleShare('whatsapp')}
                    className="bg-[#25D366]"
                    icon={<WhatsappIcon />}
                  />
                  <IconCircleButton
                    label="Compartir en Facebook"
                    onClick={() => handleShare('facebook')}
                    className="bg-[#1877F2]"
                    icon={<FacebookIcon />}
                  />
                  <IconCircleButton
                    label="Compartir en X"
                    onClick={() => handleShare('x')}
                    className="bg-black"
                    icon={<XIcon />}
                  />
                  <IconCircleButton
                    label="Compartir por SMS"
                    onClick={() => handleShare('sms')}
                    className="bg-[#0f766e]"
                    icon={<SmsIcon />}
                  />
                  <IconCircleButton
                    label="Descargar para Instagram"
                    onClick={handleInstagramShare}
                    className="bg-gradient-to-tr from-pink-500 via-fuchsia-500 to-yellow-400"
                    icon={<InstagramIcon />}
                  />
                </div>
              </div>
              <p className="text-xs text-[#14212e]/60">
              {verifiedVendor
                ? 'Vendedor verificado: tus ofertas generan alertas prioritarias en su bandeja y correo.'
                : 'Las ofertas llegan a la bandeja de Mensajes del vendedor y se notifican por correo.'}
              </p>
              {isFeaturedListing && (
                <p className="text-xs font-semibold text-[#14212e]">
                  Esta publicación está destacada con prioridad en la sección de destacados.
                </p>
              )}
              {sellerVerified && (
                <p className="text-xs text-[#14212e]/70">Vendedor verificado por el equipo de moderación.</p>
              )}
              {isModerator && (
                <div className="mt-4 space-y-2 border-t border-[#14212e]/10 pt-3">
                  <p className="text-xs uppercase tracking-wide text-[#14212e]/60">Acciones de moderador</p>
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

        <div className="order-3 space-y-6 lg:col-start-1 lg:row-start-2">
          <section className="card p-6">
            <h2 className="text-lg font-semibold text-[#14212e]">Descripción</h2>
            <p className="mt-3 text-sm leading-relaxed text-[#14212e]/80 whitespace-pre-wrap">
              {listing.description}
            </p>
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-semibold text-[#14212e]">Especificaciones</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Spec label="Marca" value={listing.brand} />
              <Spec label="Modelo" value={listing.model} />
              <Spec label="Año" value={listing.year ? String(listing.year) : '—'} />
              <Spec label="Categoría" value={listing.category} />
              <Spec label="Material" value={listing.material || '—'} />
              <Spec label="Talle / Medida" value={listing.frameSize || '—'} />
              <Spec label="Grupo" value={listing.drivetrain || listing.drivetrainDetail || '—'} />
              <Spec label="Ruedas" value={listing.wheelset || '—'} />
              <Spec label="Rodado" value={listing.wheelSize || '—'} />
              <Spec label="Extras" value={listing.extras || '—'} fullWidth />
            </div>
          </section>
        </div>
      </div>
      {showOfferModal && (
        <OfferModal
          amount={offerAmount}
          onChange={(value) => {
            setOfferAmount(value)
            if (offerError) setOfferError(null)
          }}
          whatsapp={offerWhatsappLocal}
          onWhatsappChange={(value) => {
            setOfferWhatsappLocal(value)
            if (offerError) setOfferError(null)
          }}
          onSubmit={handleOfferSubmit}
          onClose={() => {
            setShowOfferModal(false)
            setOfferError(null)
          }}
          loading={offerSubmitting}
          error={offerError}
        />
      )}
      </Container>
    </>
  )
}

function OfferModal({
  amount,
  onChange,
  whatsapp,
  onWhatsappChange,
  onSubmit,
  onClose,
  loading,
  error
}: {
  amount: string
  onChange: (value: string) => void
  whatsapp: string
  onWhatsappChange: (value: string) => void
  onSubmit: () => Promise<void> | void
  onClose: () => void
  loading: boolean
  error: string | null
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#14212e]">Enviar oferta</h2>
            <p className="text-sm text-[#14212e]/70">Indicá el monto que querés ofrecer al vendedor.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-[#14212e]">Monto ofertado</label>
            <input
              className="input mt-1"
              type="number"
              min={0}
              value={amount}
              onChange={(event) => onChange(event.target.value)}
              placeholder="Ej.: 1200000"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#14212e]">Tu WhatsApp</label>
            <div className="mt-1 flex items-stretch">
              <span className="inline-flex items-center rounded-l-lg border border-[#14212e]/10 border-r-0 bg-[#14212e]/5 px-3 text-sm text-[#14212e]/80">
                +54
              </span>
              <input
                className="input mt-0 rounded-l-none"
                inputMode="numeric"
                pattern="[0-9]*"
                value={whatsapp}
                onChange={(event) => onWhatsappChange(sanitizeLocalWhatsappInput(event.target.value))}
                placeholder="91122334455"
              />
            </div>
            <p className="mt-1 text-xs text-[#14212e]/60">Compartiremos este número en el mensaje automático de WhatsApp.</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button onClick={() => void onSubmit()} disabled={loading || !amount.trim() || !whatsapp.trim()} className="bg-[#14212e] text-white hover:bg-[#1b2f3f]">
              {loading ? 'Enviando…' : 'Enviar oferta'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function IconCircleButton({ label, icon, onClick, className }: { label: string; icon: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-white shadow transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 ${className ?? ''}`}
    >
      <span className="sr-only">{label}</span>
      <span className="text-white">{icon}</span>
    </button>
  )
}

const WhatsappIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16.7 14.2c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.1-.2.1-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.4.1-.6l.5-.6c.1-.2.2-.3.3-.5.1-.2 0-.3-.1-.5-.2-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.5s1 2.9 1.1 3.1c.1.2 2 3 4.8 4.2 1.8.8 2.5.9 2.9.8.5 0 1.5-.6 1.7-1.1.2-.5.2-1 .1-1.1-.1-.1-.3-.2-.6-.4Z" />
    <path d="M12 21a9 9 0 1 0-3.9-.9L6 21l1.9-5.4" />
  </svg>
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
    <div className={fullWidth ? 'sm:col-span-2' : undefined}>
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
