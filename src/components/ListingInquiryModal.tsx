import { useState } from 'react'
import Button from './Button'
import { submitListingInquiry } from '../services/reviews'

type Props = {
  open: boolean
  onClose: () => void
  listingId: string
  listingTitle: string
  defaultMessage: string
  defaultEmail?: string
  onSent?: () => void
}

export default function ListingInquiryModal({
  open,
  onClose,
  listingId,
  listingTitle,
  defaultMessage,
  defaultEmail,
  onSent,
}: Props) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState(defaultEmail || '')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState(defaultMessage)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const handleSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault()
    setError(null)
    if (fullName.trim().length < 2) {
      setError('Ingresá tu nombre.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Ingresá un email válido.')
      return
    }
    if (message.trim().length < 5) {
      setError('Escribí tu consulta.')
      return
    }
    setLoading(true)
    try {
      const result = await submitListingInquiry({
        listingId,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        message: message.trim(),
      })
      setSent(true)
      onSent?.()
      void result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos enviar tu consulta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 px-4">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 sm:p-8 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-4 text-sm text-gray-400 hover:text-gray-700"
        >
          Cerrar
        </button>

        {sent ? (
          <div className="space-y-4 py-4 text-center">
            <h3 className="text-xl font-semibold text-gray-900">Consulta enviada</h3>
            <p className="text-sm text-gray-600">
              Le avisamos al vendedor por email. Te va a responder directo a tu casilla.
            </p>
            <Button type="button" onClick={onClose} variant="secondary" className="mt-2">
              Cerrar
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Contactar por email</p>
              <h3 className="mt-1 text-lg font-semibold text-gray-900">{listingTitle}</h3>
            </div>

            <label className="block text-sm">
              <span className="text-gray-700">Nombre</span>
              <input
                className="input mt-1"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-gray-700">Email</span>
                <input
                  className="input mt-1"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">Teléfono (opcional)</span>
                <input
                  className="input mt-1"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="text-gray-700">Mensaje</span>
              <textarea
                className="input mt-1 min-h-[100px] resize-none"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Enviando…' : 'Enviar consulta'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
