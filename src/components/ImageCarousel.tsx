
import { useState } from 'react'
export default function ImageCarousel({ images }: { images: string[] }) {
  const [i, setI] = useState(0)
  return (
    <div>
      <div className="aspect-video rounded-xl2 overflow-hidden bg-black/40">
        <img src={images[i]} className="w-full h-full object-cover" />
      </div>
      <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
        {images.map((src, idx) => (
          <button key={idx} onClick={()=>setI(idx)} className={`h-16 aspect-video rounded-xl2 overflow-hidden border ${i===idx?'border-mb-primary':'border-white/10'}`}>
            <img src={src} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  )
}
