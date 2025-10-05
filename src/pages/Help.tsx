import { useState } from 'react'
import Container from '../components/Container'
import Button from '../components/Button'
import { supabaseEnabled } from '../services/supabase'
import { submitSupportRequest } from '../services/support'

export default function Help() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const canSubmit = name.trim() && email.trim() && message.trim()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    if (!supabaseEnabled) {
      const fallback = `mailto:admin@ciclomarket.ar?subject=Consulta%20desde%20Ciclo%20Market&body=${encodeURIComponent(
        `Nombre: ${name}\nEmail: ${email}\n\nMensaje:\n${message}`
      )}`
      window.location.href = fallback
      return
    }
    try {
      setStatus('sending')
      setErrorMsg(null)
      const ok = await submitSupportRequest({
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
      })
      if (!ok) throw new Error('Support request failed')
      setStatus('success')
      setName('')
      setEmail('')
      setMessage('')
    } catch (err: any) {
      setStatus('error')
      setErrorMsg('No pudimos enviar tu mensaje automáticamente. Te redirigimos a tu cliente de correo.')
      const fallback = `mailto:admin@ciclomarket.ar?subject=Consulta%20desde%20Ciclo%20Market&body=${encodeURIComponent(
        `Nombre: ${name}\nEmail: ${email}\n\nMensaje:\n${message}`
      )}`
      window.location.href = fallback
    }
  }

  return (
    <div className="bg-[#0f1729] text-white">
      <Container>
        <div className="py-16 grid lg:grid-cols-[3fr,2fr] gap-12">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs uppercase tracking-[0.3em]">
              Hablemos
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">
              ¿Tenés dudas, querés cotizar tu bici o necesitás soporte?
            </h1>
            <p className="text-white/80 text-lg">
              Estamos para ayudarte a vender mejor y comprar con confianza. Dejanos tu consulta y te respondemos dentro de las próximas 24 horas hábiles.
            </p>

            <form onSubmit={submit} className="bg-white text-mb-ink rounded-3xl p-6 space-y-4">
              <div>
                <label className="label text-black/60">Nombre</label>
                <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className="label text-black/60">Email</label>
                <input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="label text-black/60">Contanos qué necesitás</label>
                <textarea className="textarea mt-1" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} required />
              </div>
              {errorMsg && <div className="text-sm text-red-600">{errorMsg}</div>}
              {status === 'success' && <div className="text-sm text-green-600">¡Gracias! Nos pondremos en contacto con vos muy pronto.</div>}
              <Button type="submit" className="w-full" disabled={status === 'sending' || !canSubmit}>
                {status === 'sending' ? 'Enviando...' : 'Enviar mensaje'}
              </Button>
              <p className="text-xs text-black/60 text-center">
                Recibimos tu mensaje en admin@ciclomarket.ar y lo sumamos a nuestra lista para compartirte novedades relevantes.
              </p>
            </form>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-white/20 bg-white/5 backdrop-blur p-6 space-y-4">
              <h2 className="text-xl font-semibold">Contactos directos</h2>
              <div className="space-y-3 text-sm text-white/80">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📱</span>
                  <div>
                    <div className="font-semibold">Ventas</div>
                    <a className="underline" href="https://wa.me/5491100000000" target="_blank" rel="noopener noreferrer">
                      +54 9 11 0000 0000 (WhatsApp)
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">☎️</span>
                  <div>
                    <div className="font-semibold">Atención al cliente</div>
                    <a className="underline" href="https://wa.me/5491100000000" target="_blank" rel="noopener noreferrer">
                      +54 9 11 0000 0000 (WhatsApp)
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/5 backdrop-blur p-6 space-y-4">
              <h2 className="text-xl font-semibold">Seguinos</h2>
              <div className="flex items-center gap-3 text-white/80">
                <a href="https://www.instagram.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white">
                  <span className="text-2xl">📸</span> Instagram
                </a>
                <a href="https://www.facebook.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white">
                  <span className="text-2xl">📘</span> Facebook
                </a>
              </div>
            </div>
          </aside>
        </div>
      </Container>
    </div>
  )
}
