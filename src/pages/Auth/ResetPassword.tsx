import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Container from '../../components/Container'
import Button from '../../components/Button'
import { getSupabaseClient, supabaseEnabled } from '../../services/supabase'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [sessionChecked, setSessionChecked] = useState(false)
  const [sessionValid, setSessionValid] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { show: showToast } = useToast()
  const { enabled } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!enabled || !supabaseEnabled) {
      setError('Recuperar contraseña está deshabilitado: configurá Supabase en .env')
      setSessionChecked(true)
      return
    }

    const validateSession = async () => {
      try {
        const supabase = getSupabaseClient()
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (data.session) {
          setSessionValid(true)
        } else {
          setError('El enlace de recuperación expiró o ya fue utilizado. Solicitá uno nuevo desde la pantalla de login.')
        }
      } catch (err) {
        console.error('Error validando sesión de recuperación:', err)
        setError('No pudimos validar el enlace de recuperación. Pedí uno nuevo desde la pantalla de login.')
      } finally {
        setSessionChecked(true)
      }
    }

    void validateSession()
  }, [enabled])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!enabled || !supabaseEnabled) {
      setError('Recuperar contraseña está deshabilitado: configurá Supabase en .env')
      return
    }
    if (!sessionValid) {
      setError('El enlace de recuperación no es válido o expiró. Solicitá uno nuevo desde la pantalla de login.')
      return
    }
    if (password.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    try {
      setSubmitting(true)
      const supabase = getSupabaseClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      showToast('Actualizamos tu contraseña. Iniciá sesión con tu nueva clave.')
      await supabase.auth.signOut()
      navigate('/login', { replace: true })
    } catch (err) {
      console.error('Error actualizando contraseña:', err)
      const message = err instanceof Error
        ? err.message
        : 'No pudimos actualizar tu contraseña. Intentá nuevamente.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const disabled = !sessionValid || submitting

  return (
    <div className="relative isolate min-h-[calc(100vh-140px)] overflow-hidden bg-[#0b1824] py-14 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(1100px_520px_at_-10%_0%,rgba(255,255,255,0.12),transparent_70%)] opacity-70" />
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(900px_540px_at_120%_20%,rgba(11,24,36,0.35),transparent_75%)]" />
      <Container>
        <div className="mx-auto grid max-w-4xl items-center gap-12 lg:grid-cols-[0.9fr_minmax(0,1fr)]">
          <div className="space-y-6 text-sm text-white/80">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.35em] text-white/60">
              Recuperar acceso
            </span>
            <h1 className="text-3xl font-bold text-white sm:text-4xl">
              Creá una nueva contraseña para seguir usando MundoBike.
            </h1>
            <p className="max-w-xl text-base">
              Este enlace es válido por tiempo limitado. Una vez que guardes tu nueva contraseña, tendrás que iniciar sesión nuevamente.
            </p>
            <p className="text-xs text-white/50">
              ¿No solicitaste este cambio? Ignorá el correo o <a href="mailto:hola@mundobike.com" className="font-semibold text-white hover:text-white/80">contactanos</a>.
            </p>
            <p className="text-xs text-white/40">
              Si el enlace caducó, <Link to="/login" className="font-semibold text-white hover:text-white/80">pedí uno nuevo</Link> desde la pantalla de ingreso.
            </p>
          </div>
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/10 p-8 backdrop-blur">
            <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)]" />
            <form className="space-y-5" onSubmit={onSubmit}>
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-white">Definí tu nueva contraseña</h2>
                <p className="mt-1 text-sm text-white/70">
                  Usá una contraseña segura que no hayas usado antes.
                </p>
              </div>
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-900">
                  {error}
                </div>
              )}
              {!sessionChecked && (
                <p className="text-center text-sm text-white/60">Validando enlace…</p>
              )}
              {sessionChecked && sessionValid && (
                <>
                  <label className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60">
                    Nueva contraseña
                    <input
                      className="input mt-2 w-full border border-white/20 bg-white text-[#14212e] placeholder:text-black/60 focus:border-white/60"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={8}
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60">
                    Confirmar contraseña
                    <input
                      className="input mt-2 w-full border border-white/20 bg-white text-[#14212e] placeholder:text-black/60 focus:border-white/60"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={8}
                    />
                  </label>
                  <ul className="text-xs text-white/60">
                    <li>• Mínimo 8 caracteres.</li>
                    <li>• Combiná letras y números para mayor seguridad.</li>
                  </ul>
                  <Button
                    type="submit"
                    disabled={disabled}
                    className="w-full rounded-2xl bg-white text-[#14212e] hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {submitting ? 'Guardando…' : 'Guardar nueva contraseña'}
                  </Button>
                </>
              )}
            </form>
          </div>
        </div>
      </Container>
    </div>
  )
}

