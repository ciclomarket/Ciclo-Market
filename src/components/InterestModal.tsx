import { useState } from 'react'
import Button from './Button'
import { BIKE_CATEGORIES, FRAME_SIZES } from '../constants/catalog'
import { subscribeToMarketingInterests } from '../services/marketing'

type Props = {
  open: boolean
  onClose: () => void
  onSubmitted?: () => void
  backgroundImage?: string
}

const SIZE_CHOICES = FRAME_SIZES.filter((s) => s)
const DEFAULT_BG = 'https://images.unsplash.com/photo-1625437372758-ccd08a4268ea?auto=format&fit=crop&w=1600&q=80'

export default function InterestModal({ open, onClose, onSubmitted, backgroundImage }: Props) {
  const [category, setCategory] = useState<string>('Ruta')
  const [size, setSize] = useState<string>('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const handleSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault()
    setError(null)
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setError('Ingresá un email válido.')
      return
    }
    setLoading(true)
    const ok = await subscribeToMarketingInterests({ email: email.trim(), category, size: size || undefined })
    setLoading(false)
    if (!ok) {
      setError('No pudimos guardar tus preferencias. Probá nuevamente más tarde.')
      return
    }
    setSubmitted(true)
    onSubmitted?.()
    setTimeout(() => {
      onClose()
    }, 2400)
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 px-4">
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${backgroundImage || DEFAULT_BG})` }}
        />
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(20,33,46,0.6)' }} />

        <div className="relative px-6 py-8 sm:px-10 sm:py-12 text-white">
          {submitted ? (
            <div className="space-y-4 text-center">
              <h3 className="text-2xl font-semibold tracking-tight">¡Listo, estás adentro! 🚴‍♀️</h3>
              <p className="text-sm text-white/80 max-w-sm mx-auto">
                Te vamos a enviar un resumen semanal con las bicis que matcheen tus gustos. Estate atentx 😎
              </p>
              <Button onClick={onClose} className="mt-2" variant="secondary">
                Volver a la página
              </Button>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/60">Newsletter Ciclo Market</p>
                  <h3 className="mt-2 text-2xl sm:text-3xl font-semibold leading-tight">
                    Pedaleá primero las
                    <br />nuevas llegadas.
                  </h3>
                </div>
                <button type="button" onClick={onClose} className="text-sm text-white/70 hover:text-white">
                  Cerrar
                </button>
              </div>

              <p className="text-sm text-white/80 max-w-sm">
                Contanos qué te interesa y cada semana te mandamos las bicis que valen la pena. Sin spam, puro hype ciclista.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block text-sm">
                  <span className="text-white/70">Categoría</span>
                  <select className="select mt-1 text-black" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {BIKE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm">
                  <span className="text-white/70">Talle (opcional)</span>
                  <select className="select mt-1 text-black" value={size} onChange={(e) => setSize(e.target.value)}>
                    <option value="">Cualquiera</option>
                    {SIZE_CHOICES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-sm">
                <span className="text-white/70">Email</span>
                <input
                  className="input mt-1 text-black"
                  type="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>

              {error && <p className="text-sm text-red-300">{error}</p>}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Guardando...' : 'Quiero las novedades'}
              </Button>

              <p className="text-xs text-white/60 text-center">
                Enviamos un resumen los domingos. Podés darte de baja con un clic.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
