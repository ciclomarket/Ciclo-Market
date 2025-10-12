
import { useEffect, useMemo, useState } from 'react'

export default function ImageCarousel({ images }: { images: string[] }) {
  // Filtrar URLs inválidas o no soportadas (ej.: HEIC no renderiza en navegadores)
  const displayImages = useMemo(
    () => (Array.isArray(images) ? images : [])
      .filter((src): src is string => typeof src === 'string' && !!src.trim())
      .filter((src) => !/\.heic(?:$|\?)/i.test(src)),
    [images]
  )

  const [i, setI] = useState(0)
  const safeIndex = displayImages.length ? Math.min(i, displayImages.length - 1) : 0
  const currentImage = displayImages[safeIndex]
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

  return (
    <div className="w-full max-w-full overflow-hidden">
      <div className="aspect-video w-full overflow-hidden rounded-xl2 bg-black/40">
        {currentImage ? (
          <button type="button" className="h-full w-full" onClick={() => setLightbox(true)} aria-label="Ampliar imagen">
            <img
              src={currentImage}
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
      </div>
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
              src={src}
              alt="Miniatura de la publicación"
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                // Si una miniatura falla, ocultarla
                (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
              }}
            />
          </button>
        ))}
      </div>
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
            src={currentImage}
            alt="Imagen ampliada"
            className="max-h-[90vh] max-w-[95vw] object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none'
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
