import { useState } from 'react'
import Container from './Container'
import { subscribeNewsletter } from '../services/newsletter'

export default function Newsletter() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [status, setStatus] = useState<'idle'|'loading'|'ok'|'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    if (!consent) {
      setError('Para suscribirte, aceptá la Política de privacidad y los Términos.')
      setStatus('error')
      return
    }
    setStatus('loading')
    setError(null)
    const res = await subscribeNewsletter({ email: email.trim(), name: name.trim() || undefined })
    if (res.ok) {
      setStatus('ok')
      setEmail('')
      setName('')
    } else {
      setStatus('error')
      setError(res.error || 'No pudimos suscribirte. Intentá de nuevo.')
    }
  }

  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] py-14 text-white">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
        <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
        <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
      </div>
      <Container>
        <div className="mx-auto max-w-3xl rounded-[28px] border border-white/10 bg-white/5 p-8 shadow-[0_18px_40px_rgba(6,12,24,0.35)] backdrop-blur">
          <div className="text-center space-y-3">
            <p className="text-[11px] uppercase tracking-[0.35em] text-white/60">Newsletter</p>
            <h2 className="text-2xl md:text-3xl font-semibold">
              Recibí las últimas novedades de Ciclo Market
            </h2>
            <p className="text-sm text-white/70">
              Ofertas, lanzamientos y tips ciclistas directo a tu mail. Minimal, sin spam.
            </p>
          </div>
          <form onSubmit={onSubmit} className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="email"
                className="input w-full bg-white/95 text-[#0f1729] placeholder:text-[#0f1729]/50"
                placeholder="Tu email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="text"
                className="input w-full bg-white/90 text-[#0f1729] placeholder:text-[#0f1729]/50"
                placeholder="Tu nombre (opcional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2 flex items-start gap-2 text-xs text-white/70">
              <input
                id="newsletter-consent"
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-white/30 bg-transparent text-[#0ea5e9] focus:ring-[#0ea5e9]"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <label htmlFor="newsletter-consent">
                Acepto la
                {' '}<a className="underline hover:text-white" href="/privacidad">Política de privacidad</a>
                {' '}y los{' '}
                <a className="underline hover:text-white" href="/terminos">Términos</a> de Ciclo Market.
              </label>
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-[14px] bg-gradient-to-r from-[#0ea5e9] via-[#2563eb] to-[#1d4ed8] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(37,99,235,0.45)] hover:brightness-110 disabled:opacity-60"
              disabled={status === 'loading' || !consent}
            >
              {status === 'loading' ? 'Enviando…' : status === 'ok' ? '¡Listo! ✅' : 'Quiero suscribirme'}
            </button>
          </form>
          <div className="mt-2 min-h-[1.25rem] text-center text-xs">
            {status === 'error' && error && (
              <span className="text-red-200" role="alert">{error}</span>
            )}
            {status !== 'error' && (
              <span className="text-white/60">Te podés desuscribir cuando quieras.</span>
            )}
          </div>
        </div>
      </Container>
    </section>
  )
}
