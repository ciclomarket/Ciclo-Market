import Container from '../../components/Container'
import Button from '../../components/Button'
import { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getSupabaseClient, supabaseEnabled } from '../../services/supabase'

export default function Login(){
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const nav = useNavigate()
  const loc = useLocation() as any
  const { enabled } = useAuth()

  const loginEmail = async () => {
    if (!enabled || !supabaseEnabled) return alert('Login deshabilitado: configurá Supabase en .env')
    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      })
      if (error) throw error
      nav(loc.state?.from?.pathname || '/dashboard')
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'No pudimos iniciar sesión. Intentá nuevamente.'
      alert(message)
    }
  }

  const loginGoogle = async () => {
    if (!enabled || !supabaseEnabled) return alert('Login con Google deshabilitado: configurá Supabase en .env')
    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`
        }
      })
      if (error) throw error
      if (data?.url) {
        window.location.href = data.url
        return
      }
      nav('/dashboard')
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'No pudimos iniciar sesión con Google.'
      alert(message)
    }
  }

  return (
    <Container>
      <div className="max-w-md mx-auto card p-6">
        <h1 className="text-2xl font-bold mb-4">Ingresar</h1>
        <label className="label">Email</label>
        <input className="input" value={email} onChange={e=>setEmail(e.target.value)} />
        <label className="label mt-3">Contraseña</label>
        <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        <Button onClick={loginEmail} className="w-full mt-4">Ingresar</Button>
        <Button onClick={loginGoogle} variant="ghost" className="w-full mt-2">Ingresar con Google</Button>
        <p className="text-sm text-white/60 mt-3">¿No tenés cuenta? <Link className="underline" to="/register">Registrate</Link></p>
      </div>
    </Container>
  )
}
