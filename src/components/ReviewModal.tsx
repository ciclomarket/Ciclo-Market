import { useMemo } from 'react'

type Props = {
  onClose: () => void
  rating: number
  setRating: (v: number) => void
  isVerifiedSale: boolean
  setIsVerifiedSale: (v: boolean) => void
  tags: string[]
  setTags: (v: string[]) => void
  comment: string
  setComment: (v: string) => void
  loading: boolean
  onSubmit: () => Promise<void> | void
}

const OPTIONS_INTENT = [
  { id: 'atencion', label: 'Buena atención' },
  { id: 'respetuoso', label: 'Respetuoso' },
  { id: 'buena_comunicacion', label: 'Buena comunicación' },
  { id: 'puntual', label: 'Puntual' },
  { id: 'recomendado', label: 'Recomendado' },
]

const OPTIONS_TRANSACTION = [
  { id: 'descripcion_real', label: 'Tal cual la descripción' },
  { id: 'precio_justo', label: 'Precio justo' },
  { id: 'puntual', label: 'Puntual' },
  { id: 'buena_comunicacion', label: 'Buena comunicación' },
  { id: 'recomendado', label: 'Recomendado' },
]

export default function ReviewModal({
  onClose,
  rating,
  setRating,
  isVerifiedSale,
  setIsVerifiedSale,
  tags,
  setTags,
  comment,
  setComment,
  loading,
  onSubmit,
}: Props) {
  const options = useMemo(() => (isVerifiedSale ? OPTIONS_TRANSACTION : OPTIONS_INTENT), [isVerifiedSale])

  const toggleTag = (id: string) => {
    setTags(tags.includes(id) ? tags.filter((t) => t !== id) : [...tags, id])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 shadow-[0_25px_80px_rgba(12,20,28,0.25)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Escribir reseña</h2>
            <p className="text-sm text-gray-600">
              {isVerifiedSale ? 'Calificá la experiencia de compra.' : 'Calificá la atención y amabilidad del vendedor.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <input
            type="checkbox"
            checked={isVerifiedSale}
            onChange={(e) => setIsVerifiedSale(e.target.checked)}
            className="mt-1 h-4 w-4 accent-blue-600"
          />
          <div>
            <p className="text-sm font-semibold text-gray-900">¿Concretaste la compra con este vendedor?</p>
            <p className="text-xs text-gray-600">
              {isVerifiedSale ? 'Sí: reseña de venta concretada.' : 'No: reseña de atención (consultas).'}
            </p>
          </div>
        </label>

        <div className="mt-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Calificación</p>
            <div className="mt-2 flex items-center gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRating(i + 1)}
                  aria-label={`Calificar ${i + 1}`}
                  className="transition-transform hover:scale-110"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-8 w-8 ${i < rating ? 'text-amber-400' : 'text-gray-200'}`}
                    fill="currentColor"
                  >
                    <path d="M12 17.3 6.5 20.2l1-5.8L3 10.2l5.8-.9L12 4l3.2 5.3 5.8.9-4.5 4.2 1 5.8Z" />
                  </svg>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-900">Etiquetas</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleTag(opt.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    tags.includes(opt.id)
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-900">Comentario (opcional)</p>
            <textarea
              className="textarea mt-2"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Dejá detalles útiles para otros compradores"
              rows={4}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSubmit}
              className="rounded-full bg-[#14212e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b2f3f] disabled:opacity-60"
              disabled={loading || rating <= 0}
            >
              {loading ? 'Enviando…' : 'Publicar reseña'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

