import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Container from '../components/Container'
import ImageCarousel from '../components/ImageCarousel'
import Button from '../components/Button'
import { mockListings } from '../mock/mockData'
import { useCurrency } from '../context/CurrencyContext'
import { formatListingPrice } from '../utils/pricing'
import { getPlanLabel, hasPaidPlan, isPlanVerified } from '../utils/plans'
import { useCompare } from '../context/CompareContext'
import { useListingLike } from '../hooks/useServerLikes'
import { fetchListing, updateListingPlan, deleteListing, setListingWhatsapp, updateListingStatus, archiveListing, reduceListingPrice, extendListingExpiryDays, updateListingFields, upgradeListingPlan, setListingHighlightDays, normalizeListingVigencies } from '../services/listings'
import { supabaseEnabled, getSupabaseClient } from '../services/supabase'
import type { Listing } from '../types'
import { formatNameWithInitial, computeTrustLevel, trustLabel, trustColorClasses, trustBadgeBgClasses } from '../utils/user'
import { normaliseWhatsapp, buildWhatsappUrl } from '../utils/whatsapp'
import { useAuth } from '../context/AuthContext'
import { fetchUserProfile, fetchUserContactEmail, setUserVerificationStatus, type UserProfileRecord } from '../services/users'
import { logContactEvent, fetchSellerReviews } from '../services/reviews'
import SeoHead, { type SeoHeadProps } from '../components/SeoHead'
import { getOgImageUrlFromFirst } from '../lib/supabaseImages'
import { resolveSiteOrigin, toAbsoluteUrl as absoluteUrl, buildBreadcrumbList, categoryToCanonicalPath } from '../utils/seo'
import { trackMetaPixel } from '../lib/metaPixel'
import { track, trackOncePerSession } from '../services/track'
import { useToast } from '../context/ToastContext'
import ListingQuestionsSection from '../components/ListingQuestionsSection'
import HorizontalSlider from '../components/HorizontalSlider'
import ListingCard from '../components/ListingCard'
import { fetchListingsBySeller } from '../services/listings'
import { submitShareBoost } from '../services/shareBoost'
import useUpload from '../hooks/useUpload'
import { FALLBACK_PLANS } from '../services/plans'
import { buildPublicUrlSafe } from '../lib/supabaseImages'
import { canonicalPlanCode } from '../utils/planCodes'
import { extractListingId } from '../utils/slug'

export default function ListingDetail() {
  const params = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, isModerator } = useAuth()
  const { format, fx } = useCurrency()
  const { show: showToast } = useToast()
  const siteOrigin = useMemo(() => resolveSiteOrigin(), [])
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  // Oferta deshabilitada
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [moderatorUpdating, setModeratorUpdating] = useState(false)
  const [modAction, setModAction] = useState('')
  const [sellerVerified, setSellerVerified] = useState(false)
  const [applyingHighlight, setApplyingHighlight] = useState(false)
  const [sellerProfile, setSellerProfile] = useState<UserProfileRecord | null>(null)
  const [sellerAuthEmail, setSellerAuthEmail] = useState<string | null>(null)
  const [sellerRating, setSellerRating] = useState<{ avg: number; count: number } | null>(null)
  const [reduceOpen, setReduceOpen] = useState(false)
  const [reduceValue, setReduceValue] = useState('')
  const [extendOpen, setExtendOpen] = useState(false)
  const [extendDays, setExtendDays] = useState('7')
  const [editTitleOpen, setEditTitleOpen] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [editDescOpen, setEditDescOpen] = useState(false)
  const [editDescValue, setEditDescValue] = useState('')
  const [editFieldOpen, setEditFieldOpen] = useState(false)
  const [editFieldName, setEditFieldName] = useState<string>('')
  const [editFieldType, setEditFieldType] = useState<'text' | 'number' | 'textarea'>('text')
  const [editFieldValue, setEditFieldValue] = useState('')
  // Related items by seller (used in desktop slider) — must be before any early return
  const [sellerRelated, setSellerRelated] = useState<Listing[]>([])
  // Upgrade modal after publish
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  // Lightweight sticky banner for upgrade CTA
  const [bannerClosed, setBannerClosed] = useState(false)

  const openEditField = (name: string, value: string | number | null | undefined, type: 'text'|'number'|'textarea' = 'text') => {
    setEditFieldName(name)
    setEditFieldType(type)
    setEditFieldValue(value != null ? String(value) : '')
    setEditFieldOpen(true)
  }
  const { ids: compareIds, toggle: toggleCompare } = useCompare()
  const { liked: isFav, count: likeCount, toggle: toggleFav, canLike } = useListingLike(listing?.id || '')
  const listingKey = params.slug ?? params.id ?? ''
  const fallbackCanonicalPath = listingKey ? `/listing/${listingKey}` : undefined
  // Necesario antes de efectos que lo usan
  const isOwner = Boolean(user?.id && listing?.sellerId && user.id === listing.sellerId)
  
  // Head meta config early to keep hook order stable across loading/not-found states
  const seoHeadConfig = useMemo<Partial<SeoHeadProps>>(() => {
    const fallback = {
      title: 'Publicación no disponible',
      description: 'Revisá las últimas bicicletas publicadas en Ciclo Market.',
      canonicalPath: fallbackCanonicalPath,
      noIndex: true,
    }
    if (!listing) return fallback
    const slug = listing.slug ?? listing.id ?? listingKey
    const canonicalPath = slug ? `/listing/${slug}` : fallbackCanonicalPath
    const productName = `${[listing.brand, listing.model, listing.year].filter(Boolean).join(' ') || listing.title}`.trim()
    const ogImageUrl = getOgImageUrlFromFirst(listing)
    const desc = (listing.description || '').replace(/\s+/g, ' ').trim()
    const description = desc ? (desc.length > 160 ? `${desc.slice(0, 157)}…` : desc) : 'Bicicleta disponible en Ciclo Market.'
    // JSON-LD (Product + Breadcrumb) para rich snippets
    const canonicalUrl = absoluteUrl(canonicalPath, siteOrigin)
    const imagesAbs = (listing.images || [])
      .map((src) => absoluteUrl(src, siteOrigin))
      .filter((u): u is string => Boolean(u))

    const isUnavailable = (listing.status === 'sold' || listing.status === 'expired' || listing.status === 'archived' || listing.status === 'paused')
    const availability = isUnavailable ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock'
    const priceCurrency = (listing.priceCurrency || 'ARS').toUpperCase()

    // Inferir condición si está en la descripción/extras
    const rawCond = (listing.extras || listing.description || '').toLowerCase()
    const isUsed = rawCond.includes('usado') || rawCond.includes('poco uso') || rawCond.includes('uso')
    const itemCondition = isUsed ? 'https://schema.org/UsedCondition' : 'https://schema.org/NewCondition'

    const offers = {
      '@type': 'Offer',
      price: Number(listing.price || 0),
      priceCurrency,
      availability,
      url: canonicalUrl,
      itemCondition,
      seller: listing.sellerName
        ? { '@type': 'Organization', name: listing.sellerName }
        : undefined,
    }

    const productSchema = canonicalUrl
      ? {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: productName,
          description,
          sku: listing.id,
          brand: listing.brand ? { '@type': 'Brand', name: listing.brand } : undefined,
          category: listing.subcategory ? `${listing.category} > ${listing.subcategory}` : listing.category,
          image: imagesAbs.length ? imagesAbs : undefined,
          offers,
        }
      : null

    const breadcrumbItems: Array<{ name: string; item: string }> = [{ name: 'Inicio', item: '/' }, { name: 'Marketplace', item: '/marketplace' }]
    const catPath = categoryToCanonicalPath(listing.category)
    if (catPath) breadcrumbItems.push({ name: listing.category, item: catPath })
    if (canonicalPath) breadcrumbItems.push({ name: productName, item: canonicalPath })
    const breadcrumbSchema = buildBreadcrumbList(breadcrumbItems, siteOrigin)

    const jsonLdPayload = [breadcrumbSchema, productSchema].filter(Boolean) as any

    return { title: `${productName} en venta`, description, canonicalPath, ogImageUrl, jsonLd: jsonLdPayload }
  }, [listing, listingKey, fallbackCanonicalPath])
  
  const parseExtrasMap = (extras?: string | null) => {
    const out: Record<string, string> = {}
    if (!extras) return out
    const parts = extras.split('•').map((p) => p.trim()).filter(Boolean)
    for (const p of parts) {
      const idx = p.indexOf(':')
      if (idx === -1) continue
      const k = p.slice(0, idx).trim()
      const v = p.slice(idx + 1).trim()
      if (k) out[k] = v
    }
    return out
  }
  const getExtra = (map: Record<string,string>, key: string) => {
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const keyNorm = norm(key)
    for (const k of Object.keys(map)) {
      if (norm(k) === keyNorm) return map[k]
    }
    return ''
  }
  const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

  async function startUpgrade(planCode: 'PREMIUM'|'PRO') {
    try {
      const amount = planCode === 'PRO' ? 13000 : 9000
      const supabase = getSupabaseClient()
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      const userId = session.session?.user?.id
      if (!userId || !listing) return
      const redirectBase = window.location.origin
      const back = {
        success: `${redirectBase}/listing/${listing.slug || listing.id}`,
        failure: `${redirectBase}/listing/${listing.slug || listing.id}`,
        pending: `${redirectBase}/listing/${listing.slug || listing.id}`,
      }
      const endpoint = apiBase ? `${apiBase}/api/checkout` : '/api/checkout'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          planCode: planCode.toLowerCase(),
          amount,
          planCurrency: 'ARS',
          planName: planCode === 'PRO' ? 'Plan Pro' : 'Plan Premium',
          listingId: listing.id,
          listingSlug: listing.slug || listing.id,
          redirectUrls: back,
          userId,
        }),
      })
      const text = await res.text()
      let json: any = null
      try { json = JSON.parse(text) } catch { /* respuesta no es json */ }
      if (res.ok && json?.url) {
        window.location.assign(json.url)
        return
      }
      console.warn('[upgrade] unexpected response', { status: res.status, text })
      alert('No pudimos iniciar el checkout. Intentá nuevamente.')
    } catch (e) {
      console.warn('[upgrade] failed', e)
      alert('No pudimos iniciar el checkout. Intentá nuevamente.')
    }
  }

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
            const flag = searchParams.get('post_publish')
            if (flag === '1') setShowUpgradeModal(true)
          } catch {}
          try {
            // Track ViewContent when a listing is loaded
            trackMetaPixel('ViewContent', {
              content_ids: [result.id],
              content_type: 'product',
              content_category: result.category,
              value: Number(result.price) || 0,
              currency: (result.priceCurrency || 'ARS').toUpperCase()
            })
            trackOncePerSession(`listing_view_${result.id}`, () => {
              track('listing_view', {
                listing_id: result.id,
                store_user_id: result.sellerId || null,
                user_id: user?.id || null,
              })
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
          trackOncePerSession(`listing_view_${fallback.id}`, () => {
            track('listing_view', {
              listing_id: fallback.id,
              store_user_id: fallback.sellerId || null,
              user_id: user?.id || null,
            })
          })
        } catch { /* noop */ }
      }
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [listingKey, user?.id])

  // Mostrar upgrade modal para planes FREE cuando el owner ve su publicación,
  // con persistencia local para no mostrarlo en cada visita (salvo post_publish=1)
  useEffect(() => {
    if (!listing || !user?.id || user.id !== listing.sellerId) return
    const premiumActive = typeof listing.rankBoostUntil === 'number' && listing.rankBoostUntil > Date.now()
    const forceShow = searchParams.get('post_publish') === '1'
    if (premiumActive) return
    const key = `cm_upg_seen_${listing.id}`
    const seen = typeof window !== 'undefined' ? window.localStorage.getItem(key) === '1' : false
    if (forceShow || !seen) setShowUpgradeModal(true)
  }, [listing?.id, listing?.rankBoostUntil, user?.id, searchParams])

  const markUpgradeSeen = () => {
    try {
      if (!listing) return
      const key = `cm_upg_seen_${listing.id}`
      window.localStorage.setItem(key, '1')
    } catch {}
  }

  // Load seller-related items once listing is known; runs before any return
  useEffect(() => {
    let active = true
    const load = async () => {
      if (!listing?.sellerId) { setSellerRelated([]); return }
      const all = await fetchListingsBySeller(listing.sellerId)
      if (!active || !Array.isArray(all)) return
      const currentId = listing.id
      const targetSub = (listing.subcategory || '').toLowerCase()
      const groupFor = (cat: Listing['category']) => {
        if (cat === 'Nutrición') return 'Nutrición'
        if (cat === 'Indumentaria') return 'Indumentaria'
        return 'bikes'
      }
      const targetGroup = groupFor(listing.category)
      const allowed = all.filter((l) => {
        if (!l || l.id === currentId) return false
        const g = groupFor(l.category)
        if (targetGroup === 'bikes') return g === 'bikes'
        return g === targetGroup
      })
      const now = Date.now()
      const score = (item: Listing) => {
        const boost = typeof item.rankBoostUntil === 'number' && item.rankBoostUntil > now ? 2 : 0
        const sameSub = targetSub && item.subcategory?.toLowerCase() === targetSub ? 1 : 0
        const created = typeof item.createdAt === 'number' ? item.createdAt : 0
        return boost * 1e12 + sameSub * 1e9 + created
      }
      const sorted = [...allowed].sort((a, b) => score(b) - score(a))
      setSellerRelated(sorted)
    }
    void load()
    return () => { active = false }
  }, [listing?.id, listing?.sellerId, listing?.category])

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

  // Normalizar URL a slug canónico solo cuando el listing cargado
  // corresponde al parámetro actual (evita "rebote" al cambiar de aviso)
  useEffect(() => {
    const current = params.slug || ''
    if (!listing || !current || !listing.slug) return
    const currentId = extractListingId(current)
    if (currentId === listing.id && current !== listing.slug) {
      navigate(`/listing/${encodeURIComponent(listing.slug)}`, { replace: true })
    }
  }, [listing?.id, listing?.slug, params.slug, navigate])

  // Oferta deshabilitada

  if (loading) return <Container>Cargando publicación…</Container>
  if (!listing) return <Container>Publicación no encontrada.</Container>
  // Ocultar publicaciones vencidas al público (permitir al dueño o moderador verlas)
  {
    const now = Date.now()
    const byStatus = listing.status === 'expired'
    const byDate = typeof listing.expiresAt === 'number' && listing.expiresAt > 0 && listing.expiresAt < now
    const isExpiredPublic = (byStatus || byDate) && !isOwner && !isModerator
    if (isExpiredPublic) {
      return (
        <div className="bg-[#14212e] py-10 text-white">
          <Container>
            <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
              <h1 className="text-xl font-semibold">Publicación no disponible</h1>
              <p className="mt-2 text-white/80">Este aviso está vencido o fue desactivado por el vendedor.</p>
              <div className="mt-4">
                <a href="/marketplace" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#14212e] hover:bg-white/90">
                  Ver más bicicletas
                </a>
              </div>
            </div>
          </Container>
        </div>
          
      )
    }
  }

  

  const listingSlugOrId = listing.slug ?? listing.id
  const listingPath = `/listing/${listingSlugOrId}`
  const shareOrigin = siteOrigin
  const shareUrl = `${shareOrigin.replace(/\/$/, '')}${listingPath}`
  // URL con OG listo para previews (backend)
  // Usamos exclusivamente VITE_SHARE_BASE_URL para previews OG bajo el dominio principal
  const envShareBase = (import.meta.env.VITE_SHARE_BASE_URL || '').trim()
  const shareBase = envShareBase ? envShareBase.replace(/\/$/, '') : ''
  const previewCacheBust = listing.createdAt ? String(listing.createdAt) : String(Date.now())
  const previewKey = encodeURIComponent(listing.slug ?? listing.id)
  const previewUrl = shareBase ? `${shareBase}/share/listing/${previewKey}?v=${encodeURIComponent(previewCacheBust)}` : shareUrl
  const normalizeName = (value?: string | null) => {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  }
  const greetingName =
    normalizeName(sellerProfile?.store_enabled ? sellerProfile?.store_name : null) ??
    normalizeName(listing.sellerName) ??
    normalizeName(sellerProfile?.full_name) ??
    null
  const greetingPrefix = greetingName ? `¡Hola ${greetingName}!` : '¡Hola!'
  const listingTitleForMessage = (listing.title || '').trim()
  const contactMessage = `${greetingPrefix} Desde ciclomarket.ar vi tu anuncio: ${listingTitleForMessage} ${previewUrl} y me interesa saber más información.`.trim()
  const sellerWhatsappRaw = listing.sellerWhatsapp ?? sellerProfile?.whatsapp_number ?? sellerProfile?.store_phone ?? ''
  const sellerWhatsappNumber = normaliseWhatsapp(sellerWhatsappRaw)
  const waLink = buildWhatsappUrl(sellerWhatsappNumber ?? sellerWhatsappRaw, contactMessage)
  const emailSubject = `Consulta sobre ${listing.title}`
  const mailtoSubjectParam = encodeURIComponent(emailSubject)
  const mailtoBodyParam = encodeURIComponent(contactMessage)
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
  const isFeaturedListing = hasPaidPlan(effectivePlan, listing.sellerPlanExpires)
  const listingSold = listing.status === 'sold'
  const listingUnavailable = listingSold || listing.status === 'archived' || listing.status === 'paused' || listing.status === 'expired'
  const canSubmitOffer = !isOwner && !listingUnavailable

  const shareTitle = `${listing.brand} ${listing.model}${listing.year ? ` ${listing.year}` : ''}`.trim()
  const shareDescription = listing.description?.slice(0, 120) ?? 'Encontrá esta bicicleta en Ciclo Market.'
  const shareImage = listing.images?.[0]
  const shareText = `${shareTitle} - ${shareDescription}`

  const nowMs = Date.now()
  const expiresAtMs = typeof listing.expiresAt === 'number' ? listing.expiresAt : null
  const highlightExpiresMs = typeof listing.highlightExpires === 'number'
    ? listing.highlightExpires
    : typeof listing.sellerPlanExpires === 'number'
      ? listing.sellerPlanExpires
      : null
  const computeRemainingLabel = (target: number) => {
    const diffDays = Math.ceil((target - nowMs) / (24 * 60 * 60 * 1000))
    return diffDays <= 0 ? 'vencido' : `${diffDays} día${diffDays === 1 ? '' : 's'}`
  }
  const publicationRemainingLabel = expiresAtMs ? computeRemainingLabel(expiresAtMs) : null
  const highlightRemainingLabel = highlightExpiresMs ? computeRemainingLabel(highlightExpiresMs) : null
  const listingPlanCode = canonicalPlanCode(listing.plan ?? undefined)
  const listingPlanDef = FALLBACK_PLANS.find((plan) => canonicalPlanCode(plan.code ?? plan.id ?? plan.name) === listingPlanCode)
  const listingPlanDuration = listingPlanDef?.listingDurationDays ?? listingPlanDef?.periodDays ?? undefined
  const listingPlanName = listingPlanDef?.name ?? listingPlanCode ?? null

  // Extraer specs desde description/extras (tokens "Clave: Valor")
  const extractToken = (label: string): string | null => {
    const sources = [listing.description || '', listing.extras || '']
    const pattern = new RegExp(String.raw`${label}\s*:\s*([^•\n]+)`, 'i')
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

  // Tipo de transmisión: prioriza token explícito, si no infiere por grupo/detalle
  const inferTxType = (text?: string | null): 'Mecánico' | 'Electrónico' | null => {
    const t = (text || '').toLowerCase()
    if (!t) return null
    if (t.includes('electr')) return 'Electrónico'
    if (t.includes('mec')) return 'Mecánico'
    if (t.includes('di2') || t.includes('etap') || t.includes('axs') || t.includes('eps') || t.includes('steps')) return 'Electrónico'
    return 'Mecánico'
  }
  const specTxFromToken = extractToken('Tipo de transmisi[óo]n') || extractToken('Transmisi[óo]n') || null
  const specTxType = ((): string | null => {
    if (specTxFromToken) {
      const inferred = inferTxType(specTxFromToken)
      return inferred ?? specTxFromToken
    }
    // intentar derivar desde drivetrain_detail o drivetrain
    const fromDetail = inferTxType(listing.drivetrainDetail)
    if (fromDetail) return fromDetail
    const fromGroup = inferTxType(listing.drivetrain)
    if (fromGroup) return fromGroup
    return null
  })()

  const openShareWindow = (url: string) => {
    if (typeof window === 'undefined') return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleShare = (platform: 'whatsapp' | 'facebook') => {
    if (!shareUrl) return
    const encodedUrl = encodeURIComponent(previewUrl)
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
      // Para destaque, actualizar highlight_expires (plan se ignora para este caso)
      const updated = await setListingHighlightDays(listing.id, durationDays)
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

  const handleModeratorWhatsapp = async (enable: boolean) => {
    if (!listing) return
    setModeratorUpdating(true)
    try {
      const phone = enable ? (sellerProfile?.whatsapp_number || null) : null
      const updated = await setListingWhatsapp(listing.id, phone)
      if (updated) setListing(updated)
      if (enable && !phone) alert('El perfil no tiene WhatsApp cargado. Agregalo en el perfil para habilitar el botón.')
    } catch (err) {
      console.error('[listing-detail] moderator whatsapp failed', err)
      alert('No pudimos actualizar el botón de WhatsApp. Intentá nuevamente.')
    } finally {
      setModeratorUpdating(false)
    }
  }

  const handleModeratorUpgrade = async (plan: 'basic' | 'premium') => {
    if (!listing) return
    setModeratorUpdating(true)
    try {
      const result = await upgradeListingPlan({ id: listing.id, planCode: plan, useCredit: false, allowClientFallback: true })
      if (!result.ok) {
        if (result.error === 'missing_whatsapp') {
          alert('El vendedor no tiene un número de WhatsApp cargado. Agregalo desde su perfil antes de aplicar el plan.')
        } else {
          const detail = result.error ? ` (${result.error})` : ''
          alert(`No pudimos aplicar el plan. Intentá nuevamente.${detail}`)
        }
        return
      }
      if (result.listing) setListing(result.listing)
      showToast(`Aplicamos el plan ${plan === 'premium' ? 'Premium' : 'Básica'} a la publicación.`)
    } catch (err) {
      console.error('[listing-detail] moderator upgrade failed', err)
      alert('No pudimos aplicar el plan. Intentá nuevamente.')
    } finally {
      setModeratorUpdating(false)
    }
  }

  const runModeratorAction = async () => {
    if (!modAction) return
    const confirmAll = ['delete'].includes(modAction) ? window.confirm('Confirmá la acción seleccionada.') : true
    if (!confirmAll) return
    if (modAction === 'highlight7') return void handleModeratorHighlight('basic', 7)
    if (modAction === 'highlight14') return void handleModeratorHighlight('premium', 14)
    if (modAction === 'unhighlight') return void handleModeratorHighlight(null as any, null)
    if (modAction === 'verify') return void handleModeratorVerify(true)
    if (modAction === 'unverify') return void handleModeratorVerify(false)
    if (modAction === 'enable_wa') return void handleModeratorWhatsapp(true)
    if (modAction === 'disable_wa') return void handleModeratorWhatsapp(false)
    if (modAction === 'upgrade_basic') return void handleModeratorUpgrade('basic')
    if (modAction === 'upgrade_premium') return void handleModeratorUpgrade('premium')
    if (modAction === 'delete') return void handleModeratorDelete()
    if (modAction === 'mark_sold') {
      if (!listing) return
      setModeratorUpdating(true)
      const updated = await updateListingStatus(listing.id, 'sold')
      if (updated) setListing(updated)
      setModeratorUpdating(false)
      return
    }
    if (modAction === 'mark_active') {
      if (!listing) return
      setModeratorUpdating(true)
      const updated = await updateListingStatus(listing.id, 'active')
      if (updated) setListing(updated)
      setModeratorUpdating(false)
      return
    }
    if (modAction === 'archive') {
      if (!listing) return
      setModeratorUpdating(true)
      const ok = await archiveListing(listing.id)
      if (ok) setListing({ ...(listing as any), status: 'archived' } as any)
      setModeratorUpdating(false)
      return
    }
    if (modAction === 'reduce_price') {
      if (!listing) return
      const input = window.prompt('Reducí el precio (mismo formato que la moneda actual):', String(listing.price))
      if (input === null) return
      const normalized = Number(String(input).replace(/,/g, '.'))
      if (!Number.isFinite(normalized) || normalized <= 0 || normalized >= listing.price) {
        alert('Ingresá un monto válido menor al actual.')
        return
      }
      setModeratorUpdating(true)
      const updated = await reduceListingPrice({ id: listing.id, newPrice: normalized, currentPrice: listing.price, originalPrice: listing.originalPrice })
      if (updated) setListing(updated)
      setModeratorUpdating(false)
      return
    }
    if (modAction === 'extend_7' || modAction === 'extend_14') {
      if (!listing) return
      const days = modAction === 'extend_7' ? 7 : 14
      setModeratorUpdating(true)
      const updated = await extendListingExpiryDays(listing.id, days)
      if (updated) setListing(updated)
      setModeratorUpdating(false)
      return
    }
  }

  const ContactIcons = () => {
    const items: Array<{ id: string; label: string; onClick?: () => void; href?: string; icon: ReactNode; disabled?: boolean; className?: string }> = []
    const emailRecipient = sellerAuthEmail || sellerProfile?.email || listing.sellerEmail || null
    const isStoreLocal = Boolean(sellerProfile?.store_enabled)
    const canShowWhatsapp = Boolean(waLink && !isOwner && !listingUnavailable && (hadBasicOrPremium || isStoreLocal))

    // WhatsApp habilitado para publicaciones Básica o Premium (aunque el destaque haya vencido)
    if (canShowWhatsapp) {
      items.push({
        id: 'whatsapp',
        label: 'Abrir WhatsApp',
        href: waLink || undefined,
        icon: <WhatsappIcon />,
        className: 'bg-[#25D366]'
      })
    }
    if (emailRecipient) {
      items.push({
        id: 'email',
        label: 'Enviar correo',
        href: `mailto:${emailRecipient}?subject=${mailtoSubjectParam}&body=${mailtoBodyParam}`,
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
                      track('wa_click', {
                        listing_id: listing.id,
                        store_user_id: listing.sellerId || null,
                        user_id: user?.id || null,
                      })
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
        {/* Mensaje de gating solo para personas (no tiendas) cuando sí hay número y el bloqueo es por plan */}
        {waLink && !isOwner && !listingUnavailable && !isStoreLocal && !hadBasicOrPremium ? (
          <p className="mt-2 text-xs text-[#14212e]/60">El contacto por WhatsApp está disponible con planes Básica o Premium.</p>
        ) : null}
      </div>
    )
  }

  const isStore = Boolean(sellerProfile?.store_enabled)
  const storeLink = isStore ? (sellerProfile?.store_slug ? `/tienda/${sellerProfile.store_slug}` : `/tienda/${listing.sellerId}`) : null
  const sellerDisplayName = isStore
    ? (sellerProfile?.store_name || 'Tienda')
    : formatNameWithInitial(sellerProfile?.full_name || listing.sellerName || sellerProfile?.email || 'Vendedor', 'Vendedor')
  const sellerTrustLevel = computeTrustLevel(
    sellerProfile,
    sellerRating ? { count: sellerRating.count, avgRating: sellerRating.avg } : undefined
  )

  // Detailed SEO (JSON-LD, etc.) moved out to avoid hook order issues; using early minimal config instead.
  const isLifestyle = listing.category === 'Nutrición' || listing.category === 'Indumentaria'

  // Limit images for public detail using server-provided public_photos_limit (4/8/12),
  // fallback to premium_active heuristic only if missing.
  const displayImages = (() => {
    const imgs = Array.isArray(listing.images) ? listing.images : []
    // Prefer server-provided cap; else derive from rankBoostUntil + grantedVisiblePhotos
    let cap: number | null = null
    if (typeof (listing as any).public_photos_limit === 'number') cap = (listing as any).public_photos_limit
    if (cap == null) {
      const now = Date.now()
      const rbu = typeof listing.rankBoostUntil === 'number' ? listing.rankBoostUntil : (listing.rankBoostUntil ? Date.parse(listing.rankBoostUntil as any) : null)
      const boostActive = typeof rbu === 'number' && rbu > now
      if (boostActive) {
        const granted = typeof (listing as any).grantedVisiblePhotos === 'number' ? (listing as any).grantedVisiblePhotos : 4
        cap = granted >= 12 ? 12 : (granted >= 8 ? 8 : 4)
      } else {
        cap = 4
      }
    }
    return imgs.slice(0, Math.min(imgs.length, cap))
  })()

  return (
    <>
      <SeoHead {...seoHeadConfig} />
      <div className="bg-[#14212e]">
        <Container>
          <div className={isLifestyle
            ? 'flex flex-col w-full gap-5 lg:gap-6 lg:grid lg:grid-cols-[2fr_3fr]'
            : 'grid grid-cols-1 w-full gap-5 lg:gap-6 lg:grid-cols-[2fr_1fr]'}>
          {/* Fotos (siempre primero en mobile; desktop: col 1) */}
          <div className="w-full min-w-0 lg:col-start-1 lg:row-start-1">
            {isLifestyle ? (
              <ImageCarousel images={displayImages} aspect="auto" fit="contain" bg="light" maxHeightClass="lg:max-h-[500px]" thumbWhiteBg />
            ) : (
              <ImageCarousel images={displayImages} />
            )}
            {isModerator && listing && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link to={`/publicar/nueva?id=${encodeURIComponent(listing.id)}`}>
                  <Button>
                    Editar en formulario
                  </Button>
                </Link>
              </div>
            )}
          </div>
          {/* Desktop only (non-lifestyle): left column shows specs + description beneath images */}
          {!isLifestyle && (
            <div className="hidden lg:block w-full min-w-0 lg:col-start-1 lg:row-start-2 lg:space-y-6">
              <section className="card p-6">
                <h2 className="text-lg font-semibold text-[#14212e]">Especificaciones</h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Spec label="Marca" value={listing.brand} canEdit={isModerator} onEdit={() => openEditField('brand', listing.brand, 'text')} />
                  <Spec label="Modelo" value={listing.model} canEdit={isModerator} onEdit={() => openEditField('model', listing.model, 'text')} />
                  {listing.year ? <Spec label="Año" value={String(listing.year)} canEdit={isModerator} onEdit={() => openEditField('year', listing.year ?? '', 'number')} /> : null}
                  <Spec label="Categoría" value={listing.category} />
                  {/* Bike/Accesorios branch (non-lifestyle) */}
                  {(() => {
                    const parts = (listing.extras || '')
                      .split('•')
                      .map((p) => p.trim())
                      .filter(Boolean)
                    const token = parts.find((p) => p.toLowerCase().startsWith('talles:'))
                    const multi = token ? token.split(':').slice(1).join(':').trim() : ''
                    const sizeField = multi || listing.frameSize || null
                    return (
                      <>
                        {listing.material ? <Spec label="Material" value={listing.material} canEdit={isModerator} onEdit={() => openEditField('material', listing.material, 'text')} /> : null}
                        {listing.category === 'MTB' && specFork ? <Spec label="Horquilla" value={specFork} /> : null}
                        {sizeField ? <Spec label="Talle / Medida" value={String(sizeField)} /> : null}
                        {listing.wheelset ? <Spec label="Ruedas" value={listing.wheelset} /> : null}
                        {listing.wheelSize ? <Spec label="Rodado" value={listing.wheelSize} /> : null}
                        {(listing.drivetrain || listing.drivetrainDetail) ? (
                          <Spec label="Grupo" value={(listing.drivetrain || listing.drivetrainDetail) as string} />
                        ) : null}
                        {isBikeCategory && specTxType ? <Spec label="Tipo de transmisión" value={specTxType} /> : null}
                        {isBikeCategory && specBrake ? <Spec label="Freno" value={specBrake} /> : null}
                        {listing.category === 'Fixie' && specFixieRatio ? <Spec label="Relación" value={specFixieRatio} /> : null}
                        {listing.category === 'E-Bike' && specMotor ? <Spec label="Motor" value={specMotor} /> : null}
                        {listing.category === 'E-Bike' && specCharge ? <Spec label="Batería / Carga" value={specCharge} /> : null}
                        {isBikeCategory && specCondition ? <Spec label="Condición" value={specCondition} /> : null}
                        {listing.extras ? <Spec label="Extras" value={listing.extras} fullWidth /> : null}
                      </>
                    )
                  })()}
                </div>
              </section>
              <section className="card p-6">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-[#14212e]">Descripción</h2>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[#14212e]/80 whitespace-pre-wrap">
                  {listing.description}
                </p>
              </section>
            </div>
          )}
          <div className={`order-2 lg:order-none w-full min-w-0 mt-5 lg:mt-0 ${isLifestyle ? 'lg:col-start-2 lg:row-start-1 self-start' : 'lg:col-start-2 lg:row-start-1 self-start sticky top-[calc(var(--header-h)+16px)]'}`}>
            <div className="card p-6 lg:p-5">
              {/* Desktop (lg): unified two-column content for Nutrición/Indumentaria */}
              {isLifestyle && (
                <div className="hidden lg:grid lg:grid-cols-2 lg:gap-6 lg:divide-x lg:divide-[#14212e]/10">
                  {/* Left subcolumn: Especificaciones + Descripción */}
                  <div className="space-y-6">
                    <section>
                      <h2 className="text-lg font-semibold text-[#14212e]">Especificaciones</h2>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <Spec label="Marca" value={listing.brand} canEdit={isModerator} onEdit={() => openEditField('brand', listing.brand, 'text')} />
                        <Spec label="Modelo" value={listing.model} canEdit={isModerator} onEdit={() => openEditField('model', listing.model, 'text')} />
                        {listing.year ? <Spec label="Año" value={String(listing.year)} canEdit={isModerator} onEdit={() => openEditField('year', listing.year ?? '', 'number')} /> : null}
                        <Spec label="Categoría" value={listing.category} />
                        {listing.category === 'Nutrición' ? (
                          (() => {
                            const map = parseExtrasMap(listing.extras)
                            const porcion = getExtra(map, 'Porción') || getExtra(map, 'Porcion')
                            const carbs = getExtra(map, 'Carbohidratos')
                            const sodio = getExtra(map, 'Sodio')
                            const cafeina = getExtra(map, 'Cafeína') || getExtra(map, 'Cafeina')
                            const calorias = getExtra(map, 'Calorías') || getExtra(map, 'Calorias')
                            const porciones = getExtra(map, 'Porciones')
                            const sabor = getExtra(map, 'Sabor')
                            const vence = getExtra(map, 'Vence')
                            const ingredientes = getExtra(map, 'Ingredientes')
                            const alerg = getExtra(map, 'Alérgenos') || getExtra(map, 'Alergenos')
                            return (
                              <>
                                {listing.subcategory ? <Spec label="Tipo" value={listing.subcategory} /> : null}
                                {porcion ? <Spec label="Porción" value={porcion} /> : null}
                                {porciones ? <Spec label="Porciones" value={porciones} /> : null}
                                {carbs ? <Spec label="Carbohidratos" value={`${carbs}`} /> : null}
                                {sodio ? <Spec label="Sodio" value={`${sodio}`} /> : null}
                                {cafeina ? <Spec label="Cafeína" value={`${cafeina}`} /> : null}
                                {calorias ? <Spec label="Calorías" value={`${calorias}`} /> : null}
                                {sabor ? <Spec label="Sabor" value={sabor} /> : null}
                                {vence ? <Spec label="Vencimiento" value={vence} /> : null}
                                {ingredientes ? <Spec label="Ingredientes" value={ingredientes} fullWidth /> : null}
                                {alerg ? <Spec label="Alérgenos" value={alerg} fullWidth /> : null}
                              </>
                            )
                          })()
                        ) : (
                          <>
                            {listing.material ? <Spec label="Material" value={listing.material} canEdit={isModerator} onEdit={() => openEditField('material', listing.material, 'text')} /> : null}
                            {listing.category === 'MTB' && specFork ? <Spec label="Horquilla" value={specFork} /> : null}
                            {(() => {
                              const parts = (listing.extras || '')
                                .split('•')
                                .map((p) => p.trim())
                                .filter(Boolean)
                              const token = parts.find((p) => p.toLowerCase().startsWith('talles:'))
                              const multi = token ? token.split(':').slice(1).join(':').trim() : ''
                              if (multi) return <Spec label="Talles" value={multi} />
                              return listing.frameSize ? <Spec label="Talle / Medida" value={listing.frameSize} canEdit={isModerator} onEdit={() => openEditField('frameSize', listing.frameSize, 'text')} /> : null
                            })()}
                            {listing.wheelset ? <Spec label="Ruedas" value={listing.wheelset} canEdit={isModerator} onEdit={() => openEditField('wheelset', listing.wheelset, 'text')} /> : null}
                            {listing.wheelSize ? <Spec label="Rodado" value={listing.wheelSize} canEdit={isModerator} onEdit={() => openEditField('wheelSize', listing.wheelSize, 'text')} /> : null}
                          </>
                        )}
                      </div>
                    </section>
                    <section>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-[#14212e]">Descripción</h2>
                        {isModerator && (
                          <button
                            type="button"
                            className="rounded-full border border-[#14212e]/20 p-1 text-[#14212e] hover:bg-white/50"
                            aria-label="Editar descripción"
                            onClick={() => { setEditDescValue(listing.description || ''); setEditDescOpen(true) }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm14.71-9.04a1 1 0 0 0 0-1.41l-1.51-1.51a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.3-1.46Z"/></svg>
                          </button>
                        )}
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-[#14212e]/80 whitespace-pre-wrap">
                        {listing.description}
                      </p>
                    </section>
                  </div>
                  {/* Right subcolumn: Title/Price + Seller + CTAs */}
                  <div className="space-y-4 lg:pl-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h1 className="text-xl font-bold text-[#14212e] leading-tight">{listing.title}</h1>
                          {isModerator && (
                            <button
                              type="button"
                              className="rounded-full border border-[#14212e]/20 p-1 text-[#14212e] hover:bg-white/50"
                              aria-label="Editar título"
                              onClick={() => { setEditTitleValue(listing.title || ''); setEditTitleOpen(true) }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm14.71-9.04a1 1 0 0 0 0-1.41l-1.51-1.51a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.3-1.46Z"/></svg>
                            </button>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-[#14212e]/70">{listing.location}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const displayCount = likeCount > 0 ? likeCount : (isFav ? 1 : 0)
                          const content = displayCount > 0 ? `❤️ ${displayCount}` : '🤍'
                          if (canLike) {
                            return (
                              <button
                                type="button"
                                className={`rounded-full px-2 py-1 text-xs ${isFav ? 'bg-white/90 text-[#14212e]' : 'bg-[#14212e]/70 text-white/80'} border border-white/20`}
                                aria-label={isFav ? 'Quitar me gusta' : 'Me gusta'}
                                onClick={() => toggleFav()}
                              >
                                {content}
                              </button>
                            )
                          }
                          return (
                            <span
                              className={`rounded-full px-2 py-1 text-xs ${displayCount > 0 ? 'bg-white/90 text-[#14212e]' : 'bg-[#14212e]/70 text-white/80'} border border-white/20`}
                              aria-label={`Me gusta: ${displayCount}`}
                            >
                              {content}
                            </span>
                          )
                        })()}
                        <IconButton label={inCompare ? 'Quitar de comparativa' : 'Agregar a comparativa'} onClick={() => toggleCompare(listing.id)}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                            <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm2 0v16h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-6Z" />
                          </svg>
                        </IconButton>
                      </div>
                    </div>
                    <div className="flex items-end gap-3">
                      <span className="text-2xl font-extrabold text-[#14212e]">{formattedPrice}</span>
                      {originalPriceLabel && <span className="text-sm text-[#14212e]/60 line-through">{originalPriceLabel}</span>}
                    </div>
                    {isLifestyle && <hr className="my-3 border-t border-[#14212e]/20" />}
                    {/* Bloque de estado de publicación removido a pedido */}
                    {isOwner && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Link
                          to={`/publicar/nueva?id=${encodeURIComponent(listing.id)}`}
                          className="inline-flex items-center gap-2 rounded-full border border-[#14212e]/20 px-3 py-1.5 text-xs font-semibold text-[#14212e] hover:bg-[#14212e]/5"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.06 6.19l3.75 3.75" />
                          </svg>
                          Editar publicación
                        </Link>
                      </div>
                    )}
                    {/* Seller info + CTAs */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {sellerAvatarUrl && (
                          <img
                            src={buildPublicUrlSafe(sellerAvatarUrl) || ''}
                            sizes="40px"
                            alt={formatNameWithInitial(listing.sellerName, 'Vendedor')}
                            className="h-10 w-10 rounded-full object-cover border border-[#14212e]/10"
                            loading="lazy"
                            decoding="async"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm text-[#14212e]/70">Publicado por:</p>
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
                                {(() => {
                                  const c = trustColorClasses(sellerTrustLevel)
                                  return (
                                    <span className={`relative -top-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[12px] leading-none font-semibold ${trustBadgeBgClasses(sellerTrustLevel)} text-white border-[#0f1924]`}>
                                      {trustLabel(sellerTrustLevel, 'short')}
                                    </span>
                                  )
                                })()}
                              </Link>
                            )}
                          </h3>
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
                      {/* Visible divider before contact actions (lifestyle desktop) */}
                      {isLifestyle && <hr className="my-3 border-t border-[#14212e]/20" />}
                      <ContactIcons />
                    </div>
                  </div>
                </div>
              )}
              {/* Mobile: keep existing seller content; Desktop: hide for Lifestyle */}
              <div className={isLifestyle ? 'block lg:hidden' : ''}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl lg:text-xl font-bold text-[#14212e] leading-tight">{listing.title}</h1>
                    {isModerator && (
                      <button
                        type="button"
                        className="rounded-full border border-[#14212e]/20 p-1 text-[#14212e] hover:bg-white/50"
                        aria-label="Editar título"
                        onClick={() => { setEditTitleValue(listing.title || ''); setEditTitleOpen(true) }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm14.71-9.04a1 1 0 0 0 0-1.41l-1.51-1.51a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.3-1.46Z"/></svg>
                      </button>
                    )}
                  </div>
                  <p className="mt-2 lg:mt-1 text-sm text-[#14212e]/70">{listing.location}</p>
                  {/* Badge de destacada removido */}
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const displayCount = likeCount > 0 ? likeCount : (isFav ? 1 : 0)
                    const content = displayCount > 0 ? `❤️ ${displayCount}` : '🤍'
                    if (canLike) {
                      return (
                        <button
                          type="button"
                          className={`rounded-full px-2 py-1 text-xs ${isFav ? 'bg-white/90 text-[#14212e]' : 'bg-[#14212e]/70 text-white/80'} border border-white/20`}
                          aria-label={isFav ? 'Quitar me gusta' : 'Me gusta'}
                          onClick={() => toggleFav()}
                        >
                          {content}
                        </button>
                      )
                    }
                    return (
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${displayCount > 0 ? 'bg-white/90 text-[#14212e]' : 'bg-[#14212e]/70 text-white/80'} border border-white/20`}
                        aria-label={`Me gusta: ${displayCount}`}
                      >
                        {content}
                      </span>
                    )
                  })()}
                  <IconButton label={inCompare ? 'Quitar de comparativa' : 'Agregar a comparativa'} onClick={() => toggleCompare(listing.id)}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm2 0v16h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-6Z" />
                    </svg>
                  </IconButton>
                </div>
              </div>
              <div className="mt-2 flex items-end gap-3">
                <span className="text-3xl lg:text-2xl font-extrabold text-[#14212e]">{formattedPrice}</span>
                {originalPriceLabel && <span className="text-sm text-[#14212e]/60 line-through">{originalPriceLabel}</span>}
                {isModerator && (
                  <button
                    type="button"
                    className="ml-1 rounded-full border border-[#14212e]/20 p-1 text-[#14212e] hover:bg-white/50"
                    aria-label="Editar precio"
                    onClick={() => { setReduceValue(String(listing.price)); setReduceOpen(true) }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm14.71-9.04a1 1 0 0 0 0-1.41l-1.51-1.51a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.3-1.46Z"/></svg>
                  </button>
                )}
              </div>
              {/* Lifestyle mobile: no divider under price */}
              {isLifestyle && <div className="hidden lg:block"><hr className="my-3 border-t border-[#14212e]/20" /></div>}
              {/* Remove second spacer under price on mobile */}
              <div className={isLifestyle ? 'hidden' : 'hidden'} />
                  {/* Bloque de estado de publicación removido a pedido */}
              
              {/* Sección de información de la tienda (teléfono/dirección) removida a pedido */}
              <p className="mt-4 text-xs text-[#14212e]/60 lg:hidden">
                Guardá o compará esta bici para decidir más tarde.
              </p>

              <div className={`mt-5 lg:mt-4 space-y-3 lg:space-y-2 border-t pt-5 lg:pt-4 ${isLifestyle ? 'border-[#14212e]/20' : 'border-[#14212e]/10'}` }>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {sellerAvatarUrl && (
                      <img
                        src={buildPublicUrlSafe(sellerAvatarUrl) || ''}
                        sizes="40px"
                        alt={formatNameWithInitial(listing.sellerName, 'Vendedor')}
                        className="h-10 w-10 rounded-full object-cover border border-[#14212e]/10"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-[#14212e]/70">Publicado por:</p>
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
                            {(() => {
                              const c = trustColorClasses(sellerTrustLevel)
                              return (
                                <span className={`relative -top-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[12px] leading-none font-semibold ${trustBadgeBgClasses(sellerTrustLevel)} text-white border-[#0f1924]`}>
                                  {trustLabel(sellerTrustLevel, 'short')}
                                </span>
                              )
                            })()}
                          </Link>
                        )}
                      </h3>
                      {/* Ubicación bajo vendedor removida para evitar duplicado con la ubicación bajo el título */}
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
                {/* Quitar línea en mobile entre precio y publicado por; mantener solo en desktop si hiciera falta */}
                <div className={isLifestyle ? 'hidden lg:block my-3 h-px w-full bg-[#14212e]/30' : 'hidden'} />
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
                </div>
                <div className="space-y-3">
                  {/* Quitar línea antes de Contactate (mobile lifestyle).*/}
                  <div className={isLifestyle ? 'hidden lg:block my-3 h-px w-full bg-[#14212e]/30' : 'hidden'} />
                  <ContactIcons />
                  {isOwner && (
                    <div className="pt-2 border-t border-[#14212e]/10">
                      <div className="rounded-2xl border border-[#14212e]/15 bg-[#f5f9ff] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#14212e]/60">Mejorá tu aviso</p>
                            <p className="text-sm text-[#14212e]/80">Plan actual: Free · {listing.canUpgrade ? 'Podés subir a Premium/Pro' : 'Plan activo'}</p>
                          </div>
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full bg-[#14212e] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1b2f3f]"
                            onClick={() => setShowUpgradeModal(true)}
                          >
                            Ver planes
                          </button>
                        </div>
                        <ul className="mt-2 text-xs text-[#14212e]/70 space-y-1">
                          <li>• Más fotos visibles (8/12)</li>
                          <li>• Prioridad 90 días en el listado</li>
                          <li>• WhatsApp directo con compradores</li>
                        </ul>
                      </div>
                    </div>
                  )}
                  {!canSubmitOffer && listingSold && (
                    <p className="text-xs font-semibold text-[#0f766e]">Esta publicación está marcada como vendida.</p>
                  )}
                </div>
                {/* Texto relacionado a ofertas removido en mobile */}
                {/* Mensaje de destacado en mobile removido a pedido */}
                {sellerVerified && (
                  <p className="text-xs text-[#14212e]/70 lg:hidden">Vendedor verificado por el equipo de moderación.</p>
                )}
                {isModerator && (
                  <div className="mt-4 space-y-2 border-t border-[#14212e]/10 pt-3">
                    <p className="text-xs uppercase tracking-wide text-[#14212e]/60">Acciones de moderador</p>
                    {/* Info de vigencias */}
                    <div className="text-xs text-[#14212e]/70">
                      <div>Publicación (restante): {publicationRemainingLabel ?? 'sin fecha'}</div>
                      {listingPlanDuration ? (
                        <div>Plan: {listingPlanName ?? 'Estándar'} · {listingPlanDuration} días</div>
                      ) : null}
                      <div>Destaque (restante): {highlightRemainingLabel ?? 'sin destaque'}</div>
                    </div>
                    {/* Botón primario dinámico (sólo mod) */}
                    {(() => {
                      const hasHighlight = hasPaidPlan(listing.sellerPlan ?? (listing.plan as any), listing.sellerPlanExpires)
                      const isSold = listing.status === 'sold'
                      const modBasicLabel = listingPlanCode === 'basic' ? 'Renovar plan Básica' : 'Aplicar plan Básica'
                      const modPremiumLabel = listingPlanCode === 'premium' ? 'Renovar plan Premium' : 'Aplicar plan Premium'
                      return (
                        <div className="mb-2 flex flex-wrap gap-2">
                          <Button
                            variant="ghost"
                            disabled={moderatorUpdating}
                            onClick={async () => {
                              try {
                                setModeratorUpdating(true)
                                const updated = await normalizeListingVigencies(listing.id)
                                if (updated) {
                                  setListing(updated)
                                  showToast('Vigencias normalizadas según plan')
                                } else {
                                  showToast('No se pudo normalizar (revisá permisos/API)', { variant: 'error' } as any)
                                }
                              } finally {
                                setModeratorUpdating(false)
                              }
                            }}
                          >
                            Normalizar vigencias
                          </Button>
                          {!hasHighlight && listing.status !== 'archived' && (
                            <Button variant="ghost" disabled={moderatorUpdating} onClick={() => { setModAction('highlight7'); void runModeratorAction() }}>
                              Destacar 7 días 🔥
                            </Button>
                          )}
                          <Button variant="ghost" disabled={moderatorUpdating} onClick={() => { setModAction('upgrade_basic'); void runModeratorAction() }}>
                            {modBasicLabel}
                          </Button>
                          <Button variant="ghost" disabled={moderatorUpdating} onClick={() => { setModAction('upgrade_premium'); void runModeratorAction() }}>
                            {modPremiumLabel}
                          </Button>
                          {!isSold ? (
                            <Button variant="ghost" disabled={moderatorUpdating} onClick={() => { setModAction('mark_sold'); void runModeratorAction() }}>
                              Marcar vendida
                            </Button>
                          ) : (
                            <Button variant="ghost" disabled={moderatorUpdating} onClick={() => { setModAction('mark_active'); void runModeratorAction() }}>
                              Marcar disponible
                            </Button>
                          )}
                        </div>
                      )
                    })()}
                    {/* Dropdown de acciones rápidas + confirmar */}
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="select text-xs"
                        value={modAction}
                        onChange={(e) => setModAction(e.target.value)}
                      >
                        <option value="">Elegir acción…</option>
                        <option value="highlight7">Destacar 7 días</option>
                        <option value="highlight14">Destacar 14 días</option>
                        <option value="unhighlight">Quitar destaque</option>
                        <option value="upgrade_basic">Aplicar plan Básica</option>
                        <option value="upgrade_premium">Aplicar plan Premium</option>
                        <option value="verify">Verificar vendedor</option>
                        <option value="unverify">Quitar verificación</option>
                        <option value="enable_wa">Habilitar WhatsApp</option>
                        <option value="disable_wa">Deshabilitar WhatsApp</option>
                        <option value="mark_sold">Marcar como vendida</option>
                        <option value="mark_active">Marcar disponible</option>
                        <option value="archive">Archivar publicación</option>
                        <option value="reduce_price">Reducir precio</option>
                        <option value="extend_7">Extender 7 días</option>
                        <option value="extend_14">Extender 14 días</option>
                        <option value="delete">Eliminar publicación</option>
                      </select>
                      <Button variant="ghost" disabled={moderatorUpdating || !modAction} onClick={runModeratorAction}>
                        Confirmar
                      </Button>
                    </div>
                    {/* Modales: Reducir precio / Extender vigencia */}
                    {reduceOpen && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setReduceOpen(false)}>
                        <div className="w-full max-w-sm rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
                          <h3 className="text-sm font-semibold text-[#14212e]">Reducir precio</h3>
                          <p className="mt-1 text-xs text-[#14212e]/70">Ingresá el nuevo precio. Debe ser menor al actual.</p>
                          <input type="number" value={reduceValue} onChange={(e) => setReduceValue(e.target.value)} className="input mt-3 w-full" />
                          <div className="mt-3 flex justify-end gap-2">
                            <button className="rounded-full border border-[#14212e]/20 px-3 py-1.5 text-sm text-[#14212e]" onClick={() => setReduceOpen(false)}>Cancelar</button>
                            <button
                              className="rounded-full bg-[#14212e] px-3 py-1.5 text-sm font-semibold text-white"
                              onClick={async () => {
                                if (!listing) return
                                const normalized = Number(String(reduceValue).replace(/,/g, '.'))
                                if (!Number.isFinite(normalized) || normalized <= 0 || normalized >= listing.price) {
                                  alert('Ingresá un monto válido menor al actual.')
                                  return
                                }
                                setModeratorUpdating(true)
                                const updated = await reduceListingPrice({ id: listing.id, newPrice: normalized, currentPrice: listing.price, originalPrice: listing.originalPrice })
                                if (updated) setListing(updated)
                                setModeratorUpdating(false)
                                setReduceOpen(false)
                              }}
                            >
                              Confirmar
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {extendOpen && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setExtendOpen(false)}>
                        <div className="w-full max-w-sm rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
                          <h3 className="text-sm font-semibold text-[#14212e]">Extender vigencia</h3>
                          <p className="mt-1 text-xs text-[#14212e]/70">Cantidad de días para extender.</p>
                          <input type="number" value={extendDays} onChange={(e) => setExtendDays(e.target.value)} className="input mt-3 w-full" />
                          <div className="mt-3 flex justify-end gap-2">
                            <button className="rounded-full border border-[#14212e]/20 px-3 py-1.5 text-sm text-[#14212e]" onClick={() => setExtendOpen(false)}>Cancelar</button>
                            <button
                              className="rounded-full bg-[#14212e] px-3 py-1.5 text-sm font-semibold text-white"
                              onClick={async () => {
                                if (!listing) return
                                const val = parseInt(extendDays, 10)
                                if (!Number.isFinite(val) || val <= 0) {
                                  alert('Ingresá un número de días válido (> 0).')
                                  return
                                }
                                setModeratorUpdating(true)
                                const updated = await extendListingExpiryDays(listing.id, val)
                                if (updated) setListing(updated)
                                setModeratorUpdating(false)
                                setExtendOpen(false)
                              }}
                            >
                              Confirmar
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Botones individuales ocultos; usar el dropdown + Confirmar */}
                  </div>
                )}
              </div>
            </div>
          </div>
          

          <div className={`${isLifestyle ? 'order-3 lg:hidden' : 'order-3 lg:hidden'} w-full min-w-0 mt-5 lg:mt-0 ${isLifestyle ? 'lg:col-start-3' : 'lg:col-start-1'} lg:row-start-2`}>
            <section className="card p-6">
              <h2 className="text-lg font-semibold text-[#14212e]">Especificaciones</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Spec label="Marca" value={listing.brand} canEdit={isModerator} onEdit={() => openEditField('brand', listing.brand, 'text')} />
                <Spec label="Modelo" value={listing.model} canEdit={isModerator} onEdit={() => openEditField('model', listing.model, 'text')} />
                {listing.year ? <Spec label="Año" value={String(listing.year)} canEdit={isModerator} onEdit={() => openEditField('year', listing.year ?? '', 'number')} /> : null}
                <Spec label="Categoría" value={listing.category} />

                {listing.category === 'Nutrición' ? (
                  (() => {
                    const map = parseExtrasMap(listing.extras)
                    const porcion = getExtra(map, 'Porción') || getExtra(map, 'Porcion')
                    const carbs = getExtra(map, 'Carbohidratos')
                    const sodio = getExtra(map, 'Sodio')
                    const cafeina = getExtra(map, 'Cafeína') || getExtra(map, 'Cafeina')
                    const calorias = getExtra(map, 'Calorías') || getExtra(map, 'Calorias')
                    const porciones = getExtra(map, 'Porciones')
                    const sabor = getExtra(map, 'Sabor')
                    const vence = getExtra(map, 'Vence')
                    const ingredientes = getExtra(map, 'Ingredientes')
                    const alerg = getExtra(map, 'Alérgenos') || getExtra(map, 'Alergenos')
                    return (
                      <>
                        {listing.subcategory ? <Spec label="Tipo" value={listing.subcategory} /> : null}
                        {porcion ? <Spec label="Porción" value={porcion} /> : null}
                        {porciones ? <Spec label="Porciones" value={porciones} /> : null}
                        {carbs ? <Spec label="Carbohidratos" value={`${carbs}`} /> : null}
                        {sodio ? <Spec label="Sodio" value={`${sodio}`} /> : null}
                        {cafeina ? <Spec label="Cafeína" value={`${cafeina}`} /> : null}
                        {calorias ? <Spec label="Calorías" value={`${calorias}`} /> : null}
                        {sabor ? <Spec label="Sabor" value={sabor} /> : null}
                        {vence ? <Spec label="Vencimiento" value={vence} /> : null}
                        {ingredientes ? <Spec label="Ingredientes" value={ingredientes} fullWidth /> : null}
                        {alerg ? <Spec label="Alérgenos" value={alerg} fullWidth /> : null}
                      </>
                    )
                  })()
                ) : (
                  <>
                    {/* Orden: Material + Horquilla (si existe) + Talle */}
                    {listing.material ? <Spec label="Material" value={listing.material} canEdit={isModerator} onEdit={() => openEditField('material', listing.material, 'text')} /> : null}
                    {listing.category === 'MTB' && specFork ? <Spec label="Horquilla" value={specFork} /> : null}
                    {(() => {
                      const parts = (listing.extras || '')
                        .split('•')
                        .map((p) => p.trim())
                        .filter(Boolean)
                      const token = parts.find((p) => p.toLowerCase().startsWith('talles:'))
                      const multi = token ? token.split(':').slice(1).join(':').trim() : ''
                      if (multi) return <Spec label="Talles" value={multi} />
                      return listing.frameSize ? <Spec label="Talle / Medida" value={listing.frameSize} canEdit={isModerator} onEdit={() => openEditField('frameSize', listing.frameSize, 'text')} /> : null
                    })()}
                    {/* Luego Ruedas + Rodado */}
                    {listing.wheelset ? <Spec label="Ruedas" value={listing.wheelset} canEdit={isModerator} onEdit={() => openEditField('wheelset', listing.wheelset, 'text')} /> : null}
                    {listing.wheelSize ? <Spec label="Rodado" value={listing.wheelSize} canEdit={isModerator} onEdit={() => openEditField('wheelSize', listing.wheelSize, 'text')} /> : null}
                    {/* Grupo de transmisión */}
                    {(listing.drivetrain || listing.drivetrainDetail) ? (
                      <Spec label="Grupo" value={(listing.drivetrain || listing.drivetrainDetail) as string} canEdit={isModerator} onEdit={() => openEditField('drivetrain', (listing.drivetrain || listing.drivetrainDetail) as string, 'text')} />
                    ) : null}
                    {/* Tipo de transmisión */}
                    {isBikeCategory && specTxType ? <Spec label="Tipo de transmisión" value={specTxType} /> : null}
                    {/* Tipo de freno */}
                    {isBikeCategory && specBrake ? <Spec label="Freno" value={specBrake} /> : null}
                    {/* Opcionales según categoría */}
                    {listing.category === 'Fixie' && specFixieRatio ? <Spec label="Relación" value={specFixieRatio} /> : null}
                    {listing.category === 'E-Bike' && specMotor ? <Spec label="Motor" value={specMotor} /> : null}
                    {listing.category === 'E-Bike' && specCharge ? <Spec label="Batería / Carga" value={specCharge} /> : null}
                    {isBikeCategory && specCondition ? <Spec label="Condición" value={specCondition} /> : null}
                    {listing.extras ? <Spec label="Extras" value={listing.extras} fullWidth canEdit={isModerator} onEdit={() => openEditField('extras', listing.extras, 'textarea')} /> : null}
                  </>
                )}
              </div>
            </section>
          </div>

          <div className={`${isLifestyle ? 'order-4 lg:hidden' : 'order-4 lg:hidden'} w-full min-w-0 mt-5 lg:mt-0 ${isLifestyle ? 'lg:col-start-2' : 'lg:col-start-1'} lg:row-start-3`}>
            <section className="card p-6">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-[#14212e]">Descripción</h2>
                {isModerator && (
                  <button
                    type="button"
                    className="rounded-full border border-[#14212e]/20 p-1 text-[#14212e] hover:bg-white/50"
                    aria-label="Editar descripción"
                    onClick={() => { setEditDescValue(listing.description || ''); setEditDescOpen(true) }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm14.71-9.04a1 1 0 0 0 0-1.41l-1.51-1.51a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.3-1.46Z"/></svg>
                  </button>
                )}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[#14212e]/80 whitespace-pre-wrap">
                {listing.description}
              </p>
            </section>
          </div>

          

          </div>
        </div>
        {/* Upgrade modal post-publicación */}
        {showUpgradeModal && listing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => { markUpgradeSeen(); setShowUpgradeModal(false) }}>
          <div className="mx-4 w-full max-w-xl rounded-2xl border border-white/10 bg-white p-6 text-[#14212e] shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">Destacá tu publicación y vendé más rápido</h3>
                  <p className="mt-1 text-sm text-slate-600">Sumá prioridad en listado, WhatsApp directo y más fotos visibles. Sin volver a subir nada.</p>
                </div>
                <button aria-label="Cerrar" className="rounded-full border border-slate-200 p-2 hover:bg-slate-50" onClick={() => { markUpgradeSeen(); setShowUpgradeModal(false) }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18 18 6"/></svg>
                </button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-600">Premium</div>
                  <div className="mt-1 text-2xl font-extrabold text-[#14212e]">$9.000</div>
                  <ul className="mt-3 space-y-1 text-sm text-slate-700">
                    <li>• 8 fotos visibles</li>
                    <li>• Prioridad 90 días</li>
                    <li>• WhatsApp directo</li>
                  </ul>
                <button className="mt-4 w-full rounded-lg bg-[#14212e] py-2 text-white hover:opacity-90" onClick={() => { markUpgradeSeen(); startUpgrade('PREMIUM') }}>Elegir Premium</button>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 ring-2 ring-blue-500/50">
                  <div className="text-xs font-bold uppercase tracking-wider text-blue-700">Pro</div>
                  <div className="mt-1 text-2xl font-extrabold text-[#14212e]">$13.000</div>
                  <ul className="mt-3 space-y-1 text-sm text-slate-700">
                    <li>• 12 fotos visibles</li>
                    <li>• Máxima prioridad 90 días</li>
                    <li>• WhatsApp directo</li>
                  </ul>
                <button className="mt-4 w-full rounded-lg bg-blue-600 py-2 text-white hover:bg-blue-700" onClick={() => { markUpgradeSeen(); startUpgrade('PRO') }}>Elegir Pro</button>
              </div>
            </div>
              <p className="mt-3 text-center text-xs text-slate-500">Al vencer el período, tu publicación sigue activa y vuelve a Free automáticamente.</p>
            </div>
          </div>
        )}
        {/* Slider: relacionados (boost primero, misma subcategoría cuando haya) */}
        {sellerRelated.length > 0 && (
          <div className="mt-8">
            <HorizontalSlider
              title="Bicicletas similares o relacionadas"
              subtitle="Mostramos avisos parecidos según categoría y prioridad activa"
              items={sellerRelated.slice(0, 20)}
              maxItems={20}
              initialLoad={8}
              tone="dark"
              renderCard={(it) => <ListingCard l={it} priority={false} />}
            />
          </div>
        )}
        {/* Q&A: fuera de la grilla, sección aparte */}
        <div className="mt-5 lg:mt-8">
          <div className="lg:w-[70%] lg:mx-auto">
            <ListingQuestionsSection listing={listing} listingUnavailable={listingUnavailable} />
          </div>
        </div>
        </Container>
      </div>
      {/* Modal de oferta removido */}
      {/* Modal editar título */}
      {editTitleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditTitleOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[#14212e]">Editar título</h3>
            <input type="text" value={editTitleValue} onChange={(e) => setEditTitleValue(e.target.value)} className="input mt-3 w-full" />
            <div className="mt-3 flex justify-end gap-2">
              <button className="rounded-full border border-[#14212e]/20 px-3 py-1.5 text-sm text-[#14212e]" onClick={() => setEditTitleOpen(false)}>Cancelar</button>
              <button
                className="rounded-full bg-[#14212e] px-3 py-1.5 text-sm font-semibold text-white"
                onClick={async () => {
                  if (!listing) return
                  const val = editTitleValue.trim()
                  if (!val) { alert('El título no puede estar vacío.'); return }
                  setModeratorUpdating(true)
                  const updated = await updateListingFields(listing.id, { title: val })
                  if (updated) setListing(updated)
                  setModeratorUpdating(false)
                  setEditTitleOpen(false)
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar descripción */}
      {editDescOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditDescOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[#14212e]">Editar descripción</h3>
            <textarea value={editDescValue} onChange={(e) => setEditDescValue(e.target.value)} className="textarea mt-3 w-full" rows={8} />
            <div className="mt-3 flex justify-end gap-2">
              <button className="rounded-full border border-[#14212e]/20 px-3 py-1.5 text-sm text-[#14212e]" onClick={() => setEditDescOpen(false)}>Cancelar</button>
              <button
                className="rounded-full bg-[#14212e] px-3 py-1.5 text-sm font-semibold text-white"
                onClick={async () => {
                  if (!listing) return
                  const val = editDescValue.trim()
                  setModeratorUpdating(true)
                  const updated = await updateListingFields(listing.id, { description: val })
                  if (updated) setListing(updated)
                  setModeratorUpdating(false)
                  setEditDescOpen(false)
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
      {shareModalOpen && listing && isOwner && (
        <ShareBoostModal
          listingId={listing.id}
          sellerId={listing.sellerId}
          onClose={() => setShareModalOpen(false)}
        />
      )}

      {/* Modal editar campo genérico */}
      {editFieldOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditFieldOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[#14212e]">Editar {editFieldName}</h3>
            {editFieldType === 'textarea' ? (
              <textarea value={editFieldValue} onChange={(e) => setEditFieldValue(e.target.value)} className="textarea mt-3 w-full" rows={8} />
            ) : (
              <input type={editFieldType === 'number' ? 'number' : 'text'} value={editFieldValue} onChange={(e) => setEditFieldValue(e.target.value)} className="input mt-3 w-full" />
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button className="rounded-full border border-[#14212e]/20 px-3 py-1.5 text-sm text-[#14212e]" onClick={() => setEditFieldOpen(false)}>Cancelar</button>
              <button
                className="rounded-full bg-[#14212e] px-3 py-1.5 text-sm font-semibold text-white"
                onClick={async () => {
                  if (!listing) return
                  const patch: Partial<Listing> = {}
                  const val = editFieldValue
                  switch (editFieldName) {
                    case 'brand': patch.brand = val; break
                    case 'model': patch.model = val; break
                    case 'year': patch.year = val ? Number(val) : undefined; break
                    case 'material': patch.material = val; break
                    case 'frameSize': patch.frameSize = val; break
                    case 'wheelset': patch.wheelset = val; break
                    case 'wheelSize': patch.wheelSize = val; break
                    case 'drivetrain': patch.drivetrain = val; break
                    case 'extras': patch.extras = val; break
                    default: break
                  }
                  if (Object.keys(patch).length === 0) { setEditFieldOpen(false); return }
                  setModeratorUpdating(true)
                  const updated = await updateListingFields(listing.id, patch)
                  if (updated) setListing(updated)
                  setModeratorUpdating(false)
                  setEditFieldOpen(false)
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
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
  <img src="/whatsapp.webp" alt="" className="h-5 w-5" loading="lazy" decoding="async" aria-hidden="true" onError={(e)=>{try{const el=e.currentTarget as HTMLImageElement; if(el.src.endsWith('.webp')) el.src='/whatsapp.png';}catch{}}} />
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

function Spec({ label, value, fullWidth = false, canEdit = false, onEdit }: { label: string; value: string; fullWidth?: boolean; canEdit?: boolean; onEdit?: () => void }) {
  return (
    <div className={fullWidth ? 'col-span-2' : undefined}>
      <div className="flex items-center gap-2">
        <p className="text-xs uppercase tracking-wide text-[#14212e]/50">{label}</p>
        {canEdit && onEdit && (
          <button
            type="button"
            className="rounded-full border border-[#14212e]/20 p-0.5 text-[#14212e] hover:bg-white/50"
            aria-label={`Editar ${label}`}
            onClick={onEdit}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm14.71-9.04a1 1 0 0 0 0-1.41l-1.51-1.51a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.3-1.46Z"/></svg>
          </button>
        )}
      </div>
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
