
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Listing } from '../types'
import { buildCardImageUrlSafe } from '../lib/supabaseImages'
import { buildImageSource } from '../lib/imageUrl'
import { useListingLike } from '../hooks/useServerLikes'
import { useCurrency } from '../context/CurrencyContext'
import { formatListingPrice } from '../utils/pricing'
import { buildListingSlug } from '../utils/slug'
import { hasPaidPlan } from '../utils/plans'

export default function ListingCard({ l, storeLogoUrl, priority = false, likeCount }: { l: Listing; storeLogoUrl?: string | null; priority?: boolean; likeCount?: number }) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const { liked, count, toggle, canLike } = useListingLike(l.id, likeCount)
  const { format, fx } = useCurrency()
  const fav = liked
  const priceLabel = formatListingPrice(l.price, l.priceCurrency, format, fx)
  const hasOffer = typeof l.originalPrice === 'number' && l.originalPrice > l.price && l.originalPrice > 0
  const originalPriceLabel = hasOffer ? formatListingPrice(l.originalPrice as number, l.priceCurrency, format, fx) : null
  const slug = l.slug ?? buildListingSlug({ id: l.id, title: l.title, brand: l.brand, model: l.model, category: l.category })
  const highlighted = hasPaidPlan(l.sellerPlan ?? (l.plan as any), l.sellerPlanExpires)
  const discountPct = hasOffer ? Math.round((1 - l.price / (l.originalPrice as number)) * 100) : null
  const isLifestyle = l.category === 'Indumentaria' || l.category === 'Nutrición'
  const city = l.location?.split(',')[0]?.trim() || null
  const cityDisplay = (() => {
    if (!city) return null
    const norm = city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    if (norm.includes('ciudad autonoma de buenos aires') || norm === 'caba' || norm.includes('capital federal')) return 'CABA'
    return city
  })()
  const extrasTokens = (l.extras ?? '').split('•').map((part) => part.trim()).filter(Boolean)
  const getExtraValue = (label: string) => {
    const token = extrasTokens.find((part) => part.toLowerCase().startsWith(`${label.toLowerCase()}:`))
    if (!token) return null
    return token.split(':').slice(1).join(':').trim() || null
  }
  const rawTalles = getExtraValue('Talles')
  const tallesFirst = rawTalles ? rawTalles.split(',').map((s) => s.trim()).filter(Boolean)[0] || null : null
  const sizeValue = (tallesFirst || getExtraValue('Talle') || l.frameSize || '').toString().trim() || null
  const drivetrainFromExtras = getExtraValue('Grupo') || getExtraValue('Transmisión') || getExtraValue('Transmision') || null
  const drivetrainValue = (l.drivetrain?.trim() || l.drivetrainDetail?.trim() || drivetrainFromExtras || '') || null
  let metaDisplay = [sizeValue || null, drivetrainValue || null, cityDisplay || null].filter(Boolean) as string[]
  if (l.category === 'Accesorios') {
    const bikeType = getExtraValue('Uso') || getExtraValue('Tipo') || null
    const condFromExtras = getExtraValue('Condición') || getExtraValue('Condicion') || null
    const condFromDesc = (() => {
      const text = (l.description || '').toString()
      const m = text.match(/condici[oó]n:\s*([^\n•]+)/i)
      return m && m[1] ? m[1].trim() : null
    })()
    const condition = condFromExtras || condFromDesc || null
    metaDisplay = [bikeType, condition, cityDisplay || null].filter(Boolean) as string[]
  } else if (l.category === 'Nutrición') {
    const typeValue = getExtraValue('Tipo') || l.subcategory || null
    metaDisplay = [typeValue ? `Tipo: ${typeValue}` : null, cityDisplay || null].filter(Boolean) as string[]
  } else if (l.category === 'Indumentaria') {
    const genderRaw = getExtraValue('Género') || getExtraValue('Genero') || getExtraValue('Fit') || null
    const gender = (() => {
      if (!genderRaw) return null
      const v = genderRaw.trim().toLowerCase()
      if (v.includes('hombre') || v.includes('masc')) return 'Masculino'
      if (v.includes('mujer') || v.includes('fem')) return 'Femenino'
      if (v.includes('unisex')) return 'Unisex'
      return genderRaw
    })()
    const multiSizes = getExtraValue('Talles')
    const singleSize = getExtraValue('Talle')
    const mergedSize = multiSizes || singleSize || null
    const condFromExtras = getExtraValue('Condición') || getExtraValue('Condicion') || null
    const condFromDesc = (() => {
      const text = (l.description || '').toString()
      const m = text.match(/condici[oó]n:\s*([^\n•]+)/i)
      return m && m[1] ? m[1] : null
    })()
    const condition = (condFromExtras || condFromDesc || '').trim() || null
    metaDisplay = [gender, mergedSize, condition, cityDisplay || null].filter(Boolean) as string[]
  }
  const now = Date.now()
  const isExpired = l.status === 'expired' || (typeof l.expiresAt === 'number' && l.expiresAt > 0 && l.expiresAt < now)
  const isSold = l.status === 'sold'
  const isArchived = l.status === 'archived'
  const statusLabel = isSold ? 'Vendida' : isArchived ? 'Archivada' : isExpired ? 'Vencida' : null
  const imageStatusClass = isArchived || isExpired ? 'opacity-60 grayscale' : isSold ? 'opacity-85' : ''
  const primaryImage = typeof l.images?.[0] === 'string' ? l.images[0] : null
  const media = useMemo(() => {
    if (!primaryImage) return null
    const sizes = '(max-width: 1279px) 50vw, 33vw'
    const overrides = isLifestyle ? { resize: 'contain' as const, background: 'ffffff' } : undefined
    return buildImageSource(primaryImage, { profile: 'card', sizes, overrides })
  }, [primaryImage, isLifestyle])
  const imageSrcSet = media?.srcSet
  const imageSizes = media?.sizes
  const publicImageSrc = primaryImage ? (buildCardImageUrlSafe(primaryImage) || '/no-image.webp') : null
  const preferredImageSrc = media?.src || publicImageSrc
  const [currentImageSrc, setCurrentImageSrc] = useState(preferredImageSrc)
  const hasImage = Boolean(primaryImage)
  useEffect(() => {
    setCurrentImageSrc(preferredImageSrc)
    if (!preferredImageSrc) setImageLoaded(true)
    else setImageLoaded(false)
  }, [preferredImageSrc])
  const titleClass = isArchived || isExpired ? 'line-clamp-2 font-semibold text-[#14212e]/50' : 'line-clamp-2 font-semibold text-[#14212e]'
  const metaClass = isArchived || isExpired ? 'mt-1 text-xs text-[#14212e]/50 line-clamp-1 sm:line-clamp-2' : 'mt-1 text-xs text-[#14212e]/70 line-clamp-1 sm:line-clamp-2'
  const premiumActive = (l as any).premium_active === true
  const hasPriority = Boolean(l.priorityActive || l.planTier === 'PRO' || l.planTier === 'PREMIUM')
  const waPublic = typeof (l as any).wa_public === 'boolean' ? (l as any).wa_public : premiumActive && !!l.whatsappEnabled
  const viewCount = (typeof l.viewCount === 'number' ? l.viewCount : ((l as any).views ?? (l as any).view_count ?? (l as any).views_count ?? 0)) as number
  const usingTransformed = Boolean(media?.src) && currentImageSrc === media?.src
  void highlighted
  void imageLoaded
  void toggle
  void canLike
  return (
    <div className="relative h-full">
      <Link to={`/listing/${slug}`} className="card-flat group flex h-full flex-col overflow-hidden">
        <div className={`relative overflow-hidden rounded-2xl aspect-[5/4] sm:aspect-video ${isLifestyle ? 'bg-white' : 'bg-transparent'}`}>
          <div className="absolute top-2 left-2 right-2 z-10 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              {statusLabel && (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold text-white shadow ${isSold ? 'bg-[#0f766e]' : isArchived ? 'bg-[#6b7280]' : 'bg-[#9ca3af]'}`}>
                  {statusLabel}
                </span>
              )}
              {!statusLabel && hasPriority && (
                <span className="rounded-full px-3 py-1 text-xs font-semibold text-white shadow bg-gradient-to-r from-orange-500 to-red-500 flex items-center gap-1">
                  <span role="img" aria-label="Destacada">🔥</span> Destacada
                </span>
              )}
              {waPublic && (
                <span className="rounded-full px-2 py-1 text-xs bg-[#25D366] text-white shadow">WhatsApp disponible</span>
              )}
            </div>
          </div>
          {hasImage ? (
            <img
              src={currentImageSrc || undefined}
              srcSet={usingTransformed ? imageSrcSet : undefined}
              sizes={usingTransformed ? imageSizes : undefined}
              alt={l.title}
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              {...(priority ? ({ fetchPriority: 'high' as const }) : {})}
              onLoad={() => setImageLoaded(true)}
              onError={(e) => {
                if (!publicImageSrc) {
                  setImageLoaded(true)
                  return
                }
                const el = e.currentTarget as HTMLImageElement
                const current = el?.getAttribute('src') || ''
                if (current && current !== publicImageSrc) {
                  setImageLoaded(false)
                  setCurrentImageSrc(publicImageSrc)
                  return
                }
                setImageLoaded(true)
              }}
              className={`${isLifestyle ? 'h-full w-auto mx-auto object-contain' : 'h-full w-full object-cover object-center'} ${imageStatusClass}`}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs font-medium uppercase tracking-wide text-black/40">Sin imagen</div>
          )}
          <div className="absolute top-2 left-2 z-10 flex flex-col items-start gap-2">
            {!statusLabel && hasPriority && (
              <span className="rounded-full px-3 py-1 text-xs font-semibold text-white shadow bg-gradient-to-r from-orange-500 to-red-500 flex items-center gap-1">
                <span role="img" aria-label="Destacada">🔥</span> Destacada
              </span>
            )}
            {statusLabel && (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold text-white shadow ${isSold ? 'bg-[#0f766e]' : isArchived ? 'bg-[#6b7280]' : 'bg-[#9ca3af]'}`}>
                {statusLabel}
              </span>
            )}
            {waPublic && (
              <span className="rounded-full px-2 py-1 text-xs bg-[#25D366] text-white shadow">WhatsApp disponible</span>
            )}
          </div>
          <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-2">
            {storeLogoUrl ? (
              <img src={storeLogoUrl} alt="Logo tienda" className="h-8 w-8 rounded-full border border-white/50 bg-white object-cover shadow" loading="lazy" decoding="async" />
            ) : null}
            {discountPct !== null && discountPct > 0 && (
              <span className="rounded-full bg-mb-secondary px-3 py-1 text-xs font-semibold text-white shadow">-{discountPct}%</span>
            )}
          </div>
          <div className="absolute bottom-2 right-2 z-10 flex items-center gap-2">
            <span className="rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-white shadow flex items-center gap-1">👀 {Math.max(0, Math.trunc(viewCount))}</span>
            <span className={`rounded-full px-2 py-1 text-xs ${fav ? 'bg-white/90 text-[#14212e]' : 'bg-[#14212e]/70 text-white/80'} border border-white/20 backdrop-blur`}>❤️ {count > 0 ? count : (liked ? 1 : 0)}</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col px-4 py-3 sm:px-5 sm:py-4 min-h-[110px] sm:min-h-[120px]">
          <h3 className={`${titleClass} text-lg sm:text-lg`}>{l.title}</h3>
          <div className="mt-1 leading-tight sm:flex sm:items-baseline sm:gap-2">
            <span className="block sm:inline font-semibold text-[#14212e] text-sm sm:text-base">{priceLabel}</span>
            {originalPriceLabel && <span className="block sm:inline text-xs text-[#14212e]/50 line-through">{originalPriceLabel}</span>}
          </div>
          {metaDisplay.length ? <p className={metaClass}>{metaDisplay.join(' • ')}</p> : null}
        </div>
      </Link>
    </div>
  )
}
