import { useState } from 'react'
import Container from '../../components/Container'
import Button from '../../components/Button'
import { useAuth } from '../../context/AuthContext'
import { getSupabaseClient, supabaseEnabled } from '../../services/supabase'

export default function VerifyEmail() {
  const { user } = useAuth()
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message?: string }>({ type: 'idle' })

  const resend = async () => {
    if (!user || !supabaseEnabled) return
    if (!user.email) {
      setStatus({ type: 'error', message: 'Tu cuenta no tiene un email asociado.' })
      return
    }
    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.auth.resend({
        type: user.email_confirmed_at ? 'email_change' : 'signup',
        email: user.email
      })
      if (error) throw error
      setStatus({ type: 'success', message: 'Enviamos un nuevo correo de verificación.' })
    } catch (err: any) {
      setStatus({ type: 'error', message: err?.message ?? 'No pudimos reenviar el correo.' })
    }
  }

  return (
    <Container>
      <div className="max-w-lg mx-auto card p-6 md:p-8 space-y-4">
        <h1 className="text-2xl font-bold">Confirmá tu email</h1>
        <p className="text-sm text-black/70">
          Te enviamos un mensaje a <b>{user?.email ?? 'tu correo'}</b>. Necesitamos que confirmes tu dirección antes de publicar o vender bicicletas.
        </p>
        <p className="text-sm text-black/60">
          Revisá la bandeja de entrada y también la carpeta de spam. Una vez que confirmes, refrescá la página o volvé a intentar publicar.
        </p>

        {status.type === 'success' && (
          <div className="rounded-lg border border-green-300 bg-green-50 text-green-700 px-3 py-2 text-sm">
            {status.message}
          </div>
        )}
        {status.type === 'error' && (
          <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm">
            {status.message}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={resend} disabled={!user}>
            Reenviar correo
          </Button>
          <Button to="/" variant="ghost">
            Volver al inicio
          </Button>
        </div>
      </div>
    </Container>
  )
}
