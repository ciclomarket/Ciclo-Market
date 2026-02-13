import { useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  images: string[]
  onChange: (images: string[]) => void
  max?: number
  onAddFiles?: (files: File[]) => void
}

export default function ImageUploader({ images, onChange, max = 10, onAddFiles }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const canAddMore = images.length < max

  const gridCols = useMemo(() => {
    if (images.length <= 1) return 'grid-cols-1 sm:grid-cols-2'
    if (images.length <= 4) return 'grid-cols-2 sm:grid-cols-3'
    return 'grid-cols-3 sm:grid-cols-4'
  }, [images.length])

  const makeCoverAt = (idx: number) => {
    if (idx <= 0 || idx >= images.length) return
    const next = images.slice()
    const [picked] = next.splice(idx, 1)
    next.unshift(picked)
    onChange(next)
  }

  return (
    <div className="space-y-4">
      <div className={cn('grid gap-3', gridCols)}>
        {images.map((src, idx) => (
          <div key={`${src}-${idx}`} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <img src={src} alt="Foto" className="h-full w-full object-cover" />
            <button
              type="button"
              className="absolute right-2 top-2 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 opacity-100 shadow-sm transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
              onClick={() => onChange(images.filter((i) => i !== src))}
            >
              Quitar
            </button>
            {idx === 0 ? (
              <span className="absolute left-2 top-2 rounded-lg bg-slate-900/90 px-2 py-1 text-xs font-semibold text-white">
                Portada
              </span>
            ) : (
              <button
                type="button"
                className="absolute left-2 bottom-2 rounded-lg bg-white/90 px-2 py-1 text-xs font-semibold text-slate-800 opacity-100 shadow-sm transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                onClick={() => makeCoverAt(idx)}
              >
                Hacer portada
              </button>
            )}
          </div>
        ))}

        {canAddMore && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white text-center text-sm font-medium text-slate-600 hover:border-slate-300"
          >
            <span className="text-2xl leading-none">+</span>
            <span className="mt-1 text-xs">Agregar</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          if (!files.length) return
          if (onAddFiles) {
            void onAddFiles(files)
          } else {
            const next = [...images]
            for (const file of files) {
              if (next.length >= max) break
              next.push(URL.createObjectURL(file))
            }
            onChange(next)
          }
          e.target.value = ''
        }}
      />

      <p className="text-xs text-slate-500">
        {images.length}/{max} fotos
      </p>
    </div>
  )
}
