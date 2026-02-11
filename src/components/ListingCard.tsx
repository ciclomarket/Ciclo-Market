
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck } from 'lucide-react'
import { Listing } from '../types'
import { buildCardImageUrlSafe } from '../lib/supabaseImages'
import { useListingLike } from '../hooks/useServerLikes'
import { useCurrency } from '../context/CurrencyContext'
import { formatListingPrice } from '../utils/pricing'
import { buildListingSlug } from '../utils/slug'
import { hasPaidPlan } from '../utils/plans'
import { forceTransformSupabasePublicUrl, inferImageFormat, shouldTranscodeToWebp } from '../utils/supabaseImage'

type ListingCardVariant = 'grid' | 'list'

type ListingCardImagePreset = 'default' | 'homeCard'

export default function ListingCard({
  l,
  storeLogoUrl,
  priority = false,
  likeCount,
  variant = 'grid',
  imagePreset = 'default',
}: {
  l: Listing
  storeLogoUrl?: string | null
  priority?: boolean
  likeCount?: number
  variant?: ListingCardVariant
  imagePreset?: ListingCardImagePreset
}) {
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
  const locationDisplay = (() => {
    const raw = (l.location || '').toString().trim()
    if (!raw) return null
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
    const city = parts[0] || ''
    const province = parts.slice(1).join(', ')
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    const cityNorm = norm(city)
    const provNorm = norm(province)
    if (cityNorm === 'otra ciudad') return province || null
    const cityOut = (() => {
      if (!city) return null
      if (cityNorm.includes('ciudad autonoma de buenos aires') || cityNorm === 'caba' || cityNorm.includes('capital federal')) return 'CABA'
      return city
    })()
    if (cityOut === 'CABA') return 'CABA'
    if (!province) return cityOut
    if (provNorm && provNorm === cityNorm) return cityOut
    // UX: mostrar "Provincia, Ciudad"
    return [province, cityOut].filter(Boolean).join(', ')
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
  const yearValue = typeof l.year === 'number' && l.year > 1900 ? String(l.year) : null
  let metaDisplay = [sizeValue || null, drivetrainValue || null, locationDisplay || null].filter(Boolean) as string[]
  if (l.category === 'Accesorios') {
    const bikeType = getExtraValue('Uso') || getExtraValue('Tipo') || null
    const condFromExtras = getExtraValue('Condición') || getExtraValue('Condicion') || null
    const condFromDesc = (() => {
      const text = (l.description || '').toString()
      const m = text.match(/condici[oó]n:\s*([^\n•]+)/i)
      return m && m[1] ? m[1].trim() : null
    })()
    const condition = condFromExtras || condFromDesc || null
    metaDisplay = [bikeType, condition, locationDisplay || null].filter(Boolean) as string[]
  } else if (l.category === 'Nutrición') {
    const typeValue = getExtraValue('Tipo') || l.subcategory || null
    metaDisplay = [typeValue ? `Tipo: ${typeValue}` : null, locationDisplay || null].filter(Boolean) as string[]
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
    metaDisplay = [gender, mergedSize, condition, locationDisplay || null].filter(Boolean) as string[]
  }
  const now = Date.now()
  const isExpired = l.status === 'expired' || (typeof l.expiresAt === 'number' && l.expiresAt > 0 && l.expiresAt < now)
  const isSold = l.status === 'sold'
  const isArchived = l.status === 'archived'
  const statusLabel = isSold ? 'Vendida' : isArchived ? 'Archivada' : isExpired ? 'Vencida' : null
  const imageStatusClass = isArchived || isExpired ? 'opacity-60 grayscale' : isSold ? 'opacity-85' : ''
  const primaryImage = typeof l.images?.[0] === 'string' ? l.images[0] : null
  const publicImageSrc = primaryImage ? (buildCardImageUrlSafe(primaryImage) || '/no-image.webp') : null

  const baseImageUrl = useMemo(() => {
    if (!primaryImage) return null
    if (/^https?:\/\//i.test(primaryImage)) return primaryImage
    return publicImageSrc
  }, [primaryImage, publicImageSrc])

  const media = useMemo(() => {
    if (!baseImageUrl) return null

    const isList = variant === 'list'
    const sizes = isList ? '112px' : '(max-width: 1279px) 50vw, 33vw'
    const widths = isList ? [160, 240, 320] : (imagePreset === 'homeCard' ? [320, 400, 480, 640] : [360, 480, 640, 800])
    const baseWidth = isList ? 240 : (imagePreset === 'homeCard' ? 400 : 480)

    // UI: preferimos cards "llenas" (crop) para uniformidad visual.
    const resize = isLifestyle ? 'contain' : 'cover'
    const background = (resize === 'contain') ? 'ffffff' : undefined
    // Importante: cuando usamos `resize=cover` sin `height`, Supabase puede devolver un crop no determinístico
    // que luego vuelve a "recortarse" por CSS `object-cover`, dando sensación de "zoom".
    // Fijamos `height` para que el crop server-side coincida con el aspect ratio del contenedor.
    const heightRatio = isList ? 1 : (4 / 5) // list: aspect-square; grid mobile: aspect-[5/4] => h = w*(4/5)
    const heightFor = (w: number) => (resize === 'cover' ? Math.max(1, Math.round(w * heightRatio)) : undefined)

    // Evitar WebP forzado en PNG+contain (puede dar 400 en Supabase render).
    const ext = inferImageFormat(baseImageUrl)
    const avoidWebp = resize === 'contain' && ext === 'png'
    const format = (!avoidWebp && shouldTranscodeToWebp(baseImageUrl)) ? 'webp' : undefined

    const quality = imagePreset === 'homeCard' ? 70 : 70

    const src = forceTransformSupabasePublicUrl(baseImageUrl, {
      width: baseWidth,
      height: heightFor(baseWidth),
      resize,
      background,
      quality,
      ...(format ? { format } : {}),
    })

    const srcSet = widths
      .map((w) => `${forceTransformSupabasePublicUrl(baseImageUrl, { width: w, height: heightFor(w), resize, background, quality, ...(format ? { format } : {}) })} ${w}w`)
      .join(', ')

    return { src, srcSet, sizes }
  }, [baseImageUrl, variant, imagePreset, isLifestyle])

  const imageSrcSet = media?.srcSet
  const imageSizes = media?.sizes
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
  const isOfficialStore = Boolean(storeLogoUrl) || Boolean(l.isTienda)
  const viewCount = (typeof l.viewCount === 'number' ? l.viewCount : ((l as any).views ?? (l as any).view_count ?? (l as any).views_count ?? 0)) as number
  const usingTransformed = Boolean(media?.src) && currentImageSrc === media?.src
  void highlighted
  void imageLoaded
  void toggle
  void canLike
  const isList = variant === 'list'
  const brandLabel = (l.brand || '').toString().trim()
  const listBrand = brandLabel ? brandLabel : (l.category || '').toString().trim()
  const listMetaDisplay =
    isList && yearValue && !['Accesorios', 'Indumentaria', 'Nutrición'].includes((l.category || '').toString())
      ? [yearValue, ...metaDisplay]
      : metaDisplay
  return (
    <div className="relative h-full">
      <Link
        to={`/listing/${slug}`}
        className={
          isList
            ? 'group block border-b border-gray-100 pb-4 mb-4 bg-transparent'
            : 'group flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl'
        }
      >
        {isList ? (
          <div className="flex flex-row gap-4">
            <div className="relative w-28 shrink-0 overflow-hidden rounded-lg bg-gray-100 aspect-square">
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
                  className={`h-full w-full object-cover object-center ${imageStatusClass}`}
                />
              ) : (
                <div className="absolute inset-0 grid place-content-center text-[11px] font-medium uppercase tracking-wide text-black/40">Sin imagen</div>
              )}

              {isOfficialStore ? (
                <div
                  className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-blue-600/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow"
                  aria-label="Tienda"
                  title="Tienda"
                >
                  <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                  Tienda
                </div>
              ) : hasPriority ? (
                <div className="absolute left-2 top-2 grid h-7 w-7 place-content-center rounded-full bg-white border border-gray-200/80">
                  <span aria-label="Destacada" title="Destacada" className="text-[14px] leading-none text-orange-600">
                    🔥
                  </span>
                </div>
              ) : null}
            </div>

            <div className="min-w-0 flex-1 flex flex-col">
              {listBrand ? <div className="text-[10px] uppercase tracking-wide text-gray-500">{listBrand}</div> : null}
              <div className="mt-0.5 text-sm font-bold text-gray-900 line-clamp-2">{l.title}</div>
              {listMetaDisplay.length ? <div className="mt-1 text-xs text-gray-500">{listMetaDisplay.join(' • ')}</div> : null}

              <div className="mt-auto pt-2">
                <div className="flex items-baseline gap-2">
                  <div className="font-bold text-base text-gray-900">{priceLabel}</div>
                  {originalPriceLabel ? <div className="text-xs text-gray-500 line-through">{originalPriceLabel}</div> : null}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className={`relative overflow-hidden rounded-2xl aspect-[5/4] sm:aspect-video ${isLifestyle ? 'bg-white' : 'bg-transparent'}`}>
	                <div className="absolute top-2 left-2 right-2 z-10 flex items-start justify-between gap-2">
	                <div className="flex items-center gap-2">
	                  {statusLabel && (
	                    <span className={`rounded-full px-3 py-1 text-xs font-semibold text-white shadow ${isSold ? 'bg-[#0f766e]' : isArchived ? 'bg-[#6b7280]' : 'bg-[#9ca3af]'}`}>
	                      {statusLabel}
	                    </span>
	                  )}
	                  {isOfficialStore && (
	                    <span className="rounded-full px-3 py-1 text-xs font-semibold text-white shadow bg-blue-600/90 flex items-center gap-1">
	                      <BadgeCheck className="h-4 w-4" aria-hidden="true" /> Tienda
	                    </span>
	                  )}
	                  {!statusLabel && hasPriority && !isOfficialStore && (
	                    <span className="rounded-full px-3 py-1 text-xs font-semibold text-white shadow bg-gradient-to-r from-orange-500 to-red-500 flex items-center gap-1">
	                      <span role="img" aria-label="Destacada">🔥</span> Destacada
	                    </span>
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
          </>
        )}
      </Link>
    </div>
  )
}
