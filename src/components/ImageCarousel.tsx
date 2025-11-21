
import { useEffect, useMemo, useState } from 'react'
import { SUPABASE_RECOMMENDED_QUALITY, buildSupabaseSrc, shouldTranscodeToWebp } from '../utils/supabaseImage'

type Slide = { src: string; title?: string; desc?: string }

type Props =
  | { images: string[]; slides?: never; aspect?: 'video' | 'wide' | 'square' | 'phone' | 'auto'; fit?: 'cover' | 'contain'; bg?: 'dark' | 'light'; showThumbnails?: boolean; maxHeightClass?: string; thumbWhiteBg?: boolean }
  | { images?: string[]; slides: Slide[]; aspect?: 'video' | 'wide' | 'square' | 'phone' | 'auto'; fit?: 'cover' | 'contain'; bg?: 'dark' | 'light'; showThumbnails?: boolean; maxHeightClass?: string; thumbWhiteBg?: boolean }

export default function ImageCarousel({ images, slides, aspect = 'video', fit = 'cover', bg = 'dark', showThumbnails = true, maxHeightClass, thumbWhiteBg = false }: Props) {
  // Filtrar URLs inválidas o no soportadas (ej.: HEIC no renderiza en navegadores)
  const rawImages = useMemo(() => (Array.isArray(images) ? images : []), [images])
  const displayImages = useMemo(() => {
    if (Array.isArray(slides) && slides.length) {
      return slides
        .map((s) => s?.src)
        .filter((src): src is string => typeof src === 'string' && !!src.trim())
    }
    return rawImages
      .filter((src): src is string => typeof src === 'string' && !!src.trim())
  }, [rawImages, slides])

  const slideMeta: Slide[] = useMemo(() => {
    if (Array.isArray(slides) && slides.length) {
      // Filtrar según displayImages para mantener índice consistente
      const allowed = new Set(displayImages)
      return slides.filter((s) => allowed.has(s.src))
    }
    return displayImages.map((src) => ({ src }))
  }, [slides, displayImages])

  const [i, setI] = useState(0)
  const totalImages = displayImages.length
  const safeIndex = totalImages ? Math.min(i, totalImages - 1) : 0
  const currentImage = displayImages[safeIndex]
  const currentSlide = slideMeta[safeIndex]
  const widthSteps = useMemo(() => [640, 960, 1280, 1600], [])
  const ratioFor = useMemo(() => {
    // Devuelve una función que dado un ancho calcula la altura según el aspecto.
    // Para 'auto' no forzamos alto (natural ratio)
    if (aspect === 'auto') return (w: number) => 0
    switch (aspect) {
      case 'wide':
        return (w: number) => Math.round((w * 9) / 21)
      case 'square':
        return (w: number) => w
      case 'phone':
        return (w: number) => Math.round((w * 16) / 9)
      default:
        return (w: number) => Math.round((w * 9) / 16)
    }
  }, [aspect])

  const currentSources = useMemo(() => {
    if (!currentImage) return null
    const allowWebp = shouldTranscodeToWebp(currentImage)
    const useContain = fit === 'contain' || aspect === 'auto'
    const makeOpts = (w: number, webp = false) => {
      if (useContain) {
        return { resize: 'contain' as const, ...(webp ? { format: 'webp' as const, quality: SUPABASE_RECOMMENDED_QUALITY } : {}), background: bg === 'light' ? 'ffffff' : undefined }
      }
      const h = ratioFor(w)
      const base: any = { resize: 'cover' as const }
      if (h > 0) base.height = h
      if (webp) { base.format = 'webp'; base.quality = SUPABASE_RECOMMENDED_QUALITY }
      return base
    }
    const src = buildSupabaseSrc(currentImage, 1280, makeOpts(1280))
    const srcSetBase = widthSteps.map((w) => `${buildSupabaseSrc(currentImage, w, makeOpts(w))} ${w}w`).join(', ')
    const webpSet = allowWebp ? widthSteps.map((w) => `${buildSupabaseSrc(currentImage, w, makeOpts(w, true))} ${w}w`).join(', ') : undefined
    return {
      fallback: src,
      fallbackSrcSet: srcSetBase,
      webpSrcSet: webpSet,
    }
  }, [currentImage, widthSteps, ratioFor, fit, aspect, bg])
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false)
      if (e.key === 'ArrowRight' && totalImages) setI((prev) => (prev + 1) % totalImages)
      if (e.key === 'ArrowLeft' && totalImages) setI((prev) => (prev - 1 + totalImages) % totalImages)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, totalImages])

  const aspectClass = useMemo(() => {
    if (aspect === 'auto') return ''
    switch (aspect) {
      case 'wide':
        return 'aspect-[21/9]'
      case 'square':
        return 'aspect-square'
      case 'phone':
        return 'aspect-[9/16]'
      default:
        return 'aspect-video'
    }
  }, [aspect])

  const containerBgClass = bg === 'light' ? 'bg-white' : 'bg-black/30'
  const imgFitClass = (fit === 'contain' || aspect === 'auto') ? 'object-contain' : 'object-cover'
  const imgSizeClass = (fit === 'contain' || aspect === 'auto') ? 'h-full w-auto mx-auto' : 'h-full w-full'

  return (
    <div className="w-full max-w-full overflow-hidden">
      <div className={`relative ${aspectClass} w-full overflow-hidden rounded-2xl ${containerBgClass} shadow-[0_18px_50px_rgba(5,12,22,0.45)] ring-1 ring-white/10 ${aspect === 'auto' ? 'min-h-[220px]' : ''} ${maxHeightClass ?? ''}`}>
        {currentImage ? (
          <button type="button" className="h-full w-full" onClick={() => setLightbox(true)} aria-label="Ampliar imagen">
            <picture>
              {currentSources?.webpSrcSet ? (
                <source type="image/webp" srcSet={currentSources.webpSrcSet} sizes="100vw" />
              ) : null}
              <img
                src={currentSources?.fallback}
                srcSet={currentSources?.fallbackSrcSet}
                sizes="100vw"
                alt="Vista de la publicación"
                className={`${imgSizeClass} max-w-full ${imgFitClass}`}
                loading="lazy"
                decoding="async"
                onError={() => {
                  // Si falla la imagen actual, avanzamos a la siguiente disponible
                  if (displayImages.length > 1) setI((prev) => (prev + 1) % displayImages.length)
                }}
              />
            </picture>
          </button>
        ) : (
          <div className="grid h-full w-full place-content-center text-sm text-white/70">
            Sin fotos disponibles
          </div>
        )}
        {(currentSlide?.title || currentSlide?.desc) && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 max-w-[92%]">
            <div className="inline-flex max-w-full flex-col gap-1 rounded-2xl border border-white/15 bg-[#0c1723]/80 px-4 py-3 text-left text-white shadow-[0_12px_26px_rgba(8,14,22,0.45)] backdrop-blur">
              {currentSlide.title ? (
                <div className="text-sm font-semibold leading-tight">{currentSlide.title}</div>
              ) : null}
              {currentSlide.desc ? (
                <div className="text-xs text-white/80 leading-snug">{currentSlide.desc}</div>
              ) : null}
            </div>
          </div>
        )}
      </div>
      {showThumbnails && (
        <div className="mt-3 flex w-full max-w-full gap-2 overflow-x-auto pb-1">
          {displayImages.map((src, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              className={`${aspect === 'auto' || fit === 'contain' ? 'h-20 w-20 sm:h-24 sm:w-24' : 'w-24 sm:w-28 ' + aspectClass} flex-shrink-0 overflow-hidden rounded-xl2 border ${thumbWhiteBg ? 'bg-white' : ''} transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mb-primary/60 ${
                safeIndex === idx ? 'border-mb-primary ring-2 ring-mb-primary/40' : 'border-white/10'
              }`}
              type="button"
              aria-label={`Ver imagen ${idx + 1}`}
            >
              <picture>
              {(() => {
                const thumbW = 320
                const useContain = (fit === 'contain' || aspect === 'auto')
                const commonCover = useContain ? {} : { height: ratioFor(thumbW) }
                return shouldTranscodeToWebp(src) ? (
                  <source
                    type="image/webp"
                    srcSet={buildSupabaseSrc(src, thumbW, { resize: useContain ? 'contain' : 'cover', format: 'webp', quality: SUPABASE_RECOMMENDED_QUALITY, background: bg === 'light' ? 'ffffff' : undefined, ...(commonCover as any) })}
                  />
                ) : null
              })()}
                <img
                  src={buildSupabaseSrc(src, 320, { resize: (fit === 'contain' || aspect === 'auto') ? 'contain' : 'cover', background: bg === 'light' ? 'ffffff' : undefined, ...(fit === 'contain' || aspect === 'auto' ? {} : { height: ratioFor(320) }) })}
                  alt="Miniatura de la publicación"
                  className={`h-full w-full ${imgFitClass} object-center`}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    // Si una miniatura falla, ocultarla
                    const el = e.currentTarget as HTMLImageElement
                    // Fallback al original si la transformación no funciona
                    if (src && el.src !== src) {
                      el.src = src
                      return
                    }
                    el.style.visibility = 'hidden'
                  }}
                />
              </picture>
            </button>
          ))}
        </div>
      )}
      {lightbox && currentImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setLightbox(false)}>
          <div className="absolute top-4 right-4">
            <button
              type="button"
              className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Cerrar"
              onClick={() => setLightbox(false)}
            >
              ✕
            </button>
          </div>
          <div className="absolute left-4">
            <button
              type="button"
              className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Anterior"
              onClick={(e) => {
                e.stopPropagation()
                setI((prev) => (totalImages ? (prev - 1 + totalImages) % totalImages : 0))
              }}
            >
              ‹
            </button>
          </div>
          {/* En fullscreen, mostramos SIEMPRE la imagen completa (sin recortes). */}
          <img
            src={currentImage}
            alt="Imagen ampliada"
            className="max-h-[90vh] max-w-[95vw] object-contain"
            onClick={(e) => e.stopPropagation()}
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement
              el.style.display = 'none'
            }}
          />
          <div className="absolute right-4">
            <button
              type="button"
              className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Siguiente"
              onClick={(e) => {
                e.stopPropagation()
                setI((prev) => (totalImages ? (prev + 1) % totalImages : 0))
              }}
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
