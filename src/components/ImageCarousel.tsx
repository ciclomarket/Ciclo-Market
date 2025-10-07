
import { useState } from 'react'

export default function ImageCarousel({ images }: { images: string[] }) {
  const [i, setI] = useState(0)
  const currentImage = images[i] ?? images[0]

  return (
    <div className="w-full max-w-full overflow-hidden">
      <div className="aspect-video w-full overflow-hidden rounded-xl2 bg-black/40">
        {currentImage && (
          <img src={currentImage} alt="Vista de la publicación" className="h-full w-full max-w-full object-cover" />
        )}
      </div>
      <div className="mt-3 flex w-full max-w-full gap-2 overflow-x-auto pb-1">
        {images.map((src, idx) => (
          <button
            key={idx}
            onClick={() => setI(idx)}
            className={`h-16 aspect-video min-w-[96px] flex-shrink-0 overflow-hidden rounded-xl2 border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mb-primary/60 ${
              i === idx ? 'border-mb-primary' : 'border-white/10'
            }`}
            type="button"
            aria-label={`Ver imagen ${idx + 1}`}
          >
            <img src={src} alt="Miniatura de la publicación" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  )
}
