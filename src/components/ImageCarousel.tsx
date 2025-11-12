
import { useEffect, useMemo, useState } from 'react'
import { transformSupabasePublicUrl } from '../utils/supabaseImage'

type Slide = { src: string; title?: string; desc?: string }

type Props =
  | { images: string[]; slides?: never; aspect?: 'video' | 'wide' | 'square' | 'phone'; showThumbnails?: boolean }
  | { images?: string[]; slides: Slide[]; aspect?: 'video' | 'wide' | 'square' | 'phone'; showThumbnails?: boolean }

export default function ImageCarousel({ images, slides, aspect = 'video', showThumbnails = true }: Props) {
  // Filtrar URLs inválidas o no soportadas (ej.: HEIC no renderiza en navegadores)
  const rawImages = useMemo(() => (Array.isArray(images) ? images : []), [images])
  const displayImages = useMemo(() => {
    if (Array.isArray(slides) && slides.length) {
      return slides
        .map((s) => s?.src)
        .filter((src): src is string => typeof src === 'string' && !!src.trim())
        .filter((src) => !/\.heic(?:$|\?)/i.test(src))
    }
    return rawImages
      .filter((src): src is string => typeof src === 'string' && !!src.trim())
      .filter((src) => !/\.heic(?:$|\?)/i.test(src))
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
  const safeIndex = displayImages.length ? Math.min(i, displayImages.length - 1) : 0
  const currentImage = displayImages[safeIndex]
  const currentSlide = slideMeta[safeIndex]
  const currentTransformed = currentImage
    ? transformSupabasePublicUrl(currentImage, { width: 1280, quality: 68, format: 'webp' })
    : undefined
  const currentSrcSet = useMemo(() => {
    if (!currentImage) return undefined
    const widths = [640, 960, 1280]
    return widths
      .map((w) => `${transformSupabasePublicUrl(currentImage, { width: w, quality: 68, format: 'webp' })} ${w}w`)
      .join(', ')
  }, [currentImage])
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false)
      if (e.key === 'ArrowRight') setI((prev) => (prev + 1 < images.length ? prev + 1 : 0))
      if (e.key === 'ArrowLeft') setI((prev) => (prev - 1 >= 0 ? prev - 1 : images.length - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, displayImages.length])

  const aspectClass = useMemo(() => {
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

  return (
    <div className="w-full max-w-full overflow-hidden">
      <div className={`relative ${aspectClass} w-full overflow-hidden rounded-2xl bg-black/30 shadow-[0_18px_50px_rgba(5,12,22,0.45)] ring-1 ring-white/10`}>
        {currentImage ? (
          <button type="button" className="h-full w-full" onClick={() => setLightbox(true)} aria-label="Ampliar imagen">
            <img
              src={currentTransformed}
              srcSet={currentSrcSet}
              sizes="100vw"
              alt="Vista de la publicación"
              className="h-full w-full max-w-full object-cover"
              loading="lazy"
              decoding="async"
              onError={() => {
                // Si falla la imagen actual, avanzamos a la siguiente disponible
                if (displayImages.length > 1) setI((prev) => (prev + 1) % displayImages.length)
              }}
            />
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
              className={`h-16 aspect-video min-w-[96px] flex-shrink-0 overflow-hidden rounded-xl2 border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mb-primary/60 ${
                safeIndex === idx ? 'border-mb-primary' : 'border-white/10'
              }`}
              type="button"
              aria-label={`Ver imagen ${idx + 1}`}
            >
              <img
                src={transformSupabasePublicUrl(src, { width: 300, quality: 70, format: 'webp' })}
                alt="Miniatura de la publicación"
                className="h-full w-full object-cover"
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
                setI((prev) => (prev - 1 >= 0 ? prev - 1 : images.length - 1))
              }}
            >
              ‹
            </button>
          </div>
          <img
            src={currentTransformed}
            srcSet={currentSrcSet}
            sizes="100vw"
            alt="Imagen ampliada"
            className="max-h-[90vh] max-w-[95vw] object-contain"
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement
              // Fallback al original
              if (currentImage && el.src !== currentImage) {
                el.src = currentImage
                return
              }
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
                setI((prev) => (prev + 1 < images.length ? prev + 1 : 0))
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
