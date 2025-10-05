
import Container from '../../components/Container'
import Button from '../../components/Button'
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { PROVINCES, OTHER_CITY_OPTION } from '../../constants/locations'
import { BIKE_CATEGORIES } from '../../constants/catalog'
import { getSupabaseClient, supabaseEnabled } from '../../services/supabase'
import { createUserProfile } from '../../services/users'

export default function Register(){
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [cityOther, setCityOther] = useState('')
  const [bikePrefs, setBikePrefs] = useState<string[]>([])
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const nav = useNavigate()
  const { enabled } = useAuth()

  const register = async () => {
    setError(null)
    if (!enabled || !supabaseEnabled) { setError('Registro deshabilitado: configurá Supabase en .env'); return }
    if (!email.trim()) { setError('Ingresá un email válido'); return }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    if (!username.trim()) { setError('Ingresá un nombre de usuario'); return }
    if (!fullName.trim()) { setError('Ingresá tu nombre completo'); return }
    if (!province) { setError('Seleccioná una provincia'); return }
    if (!city) { setError('Seleccioná una ciudad'); return }
    if (city === OTHER_CITY_OPTION && !cityOther.trim()) { setError('Indicá la ciudad'); return }
    if (!acceptedTerms) { setError('Debés aceptar los términos y condiciones'); return }

    try {
      setLoading(true)
      const location = city === OTHER_CITY_OPTION ? cityOther.trim() : city
      const supabase = getSupabaseClient()
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username: username.trim(),
            full_name: fullName.trim(),
            province,
            city: location,
            bike_preferences: bikePrefs,
          }
        }
      })
      if (signUpError) throw signUpError

      if (data.user?.id) {
        await createUserProfile({
          id: data.user.id,
          email: email.trim(),
          username: username.trim(),
          fullName: fullName.trim(),
          province,
          city: location,
          bikePreferences: bikePrefs,
        })
      }

      setSuccess(true)
      setTimeout(() => nav('/dashboard'), 500)
    } catch (err: any) {
      console.error('Error en registro Supabase:', err)
      if (err instanceof Error) {
        setError(err.message)
      } else if (typeof err === 'object' && err !== null && 'message' in err) {
        setError(String((err as { message: unknown }).message))
      } else {
        setError('Ocurrió un error desconocido. Intentá nuevamente.')
      }
    } finally {
      setLoading(false)
    }

  }

  const onProvinceChange = (value: string) => {
    setProvince(value)
    setCity('')
    setCityOther('')
  }

  const toggleBikePref = (cat: string) => {
    setBikePrefs((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat])
  }

  const cityOptions = province ? PROVINCES.find((p) => p.name === province)?.cities ?? [] : []
  const finalCity = city === OTHER_CITY_OPTION ? cityOther.trim() : city

  return (
    <Container>
      <div className="max-w-2xl mx-auto card p-6 md:p-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Crear cuenta</h1>
          <p className="text-sm text-black/60">Armá tu perfil para publicar y recibir novedades personalizadas.</p>
        </div>

        {error && <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
        {success && (
          <div className="rounded-lg border border-green-300 bg-green-50 text-green-700 px-3 py-2 text-sm">
            ¡Cuenta creada! Te enviamos un mail para verificar tu dirección.
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <label className="label">Nombre completo
            <input className="input mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <label className="label">Nombre de usuario
            <input className="input mt-1" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ej: ciclista123" />
          </label>
        </div>

        <label className="label">Email
          <input className="input mt-1" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} />
        </label>

        <label className="label">Contraseña
          <input className="input mt-1" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
        </label>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="label">Provincia
            <select className="select mt-1" value={province} onChange={(e) => onProvinceChange(e.target.value)}>
              <option value="">Seleccionar provincia</option>
              {PROVINCES.map((prov) => (
                <option key={prov.name} value={prov.name}>{prov.name}</option>
              ))}
            </select>
          </label>
          <label className="label">Ciudad
            <select
              className="select mt-1"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={!province}
            >
              <option value="">{province ? 'Seleccioná ciudad' : 'Elegí provincia primero'}</option>
              {cityOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        {city === OTHER_CITY_OPTION && (
          <label className="label">Ciudad (especificar)
            <input className="input mt-1" value={cityOther} onChange={(e) => setCityOther(e.target.value)} placeholder="Ingresá la ciudad" />
          </label>
        )}

        <div>
          <div className="label">¿Qué bici te interesa?</div>
          <div className="grid sm:grid-cols-2 gap-2 mt-1">
            {BIKE_CATEGORIES.map((cat) => {
              const checked = bikePrefs.includes(cat)
              return (
                <label key={cat} className={`rounded-lg border px-3 py-2 text-sm flex items-center gap-2 ${checked ? 'border-mb-primary bg-mb-primary/10' : 'border-black/10'}`}>
                  <input
                    type="checkbox"
                    className="accent-mb-primary"
                    checked={checked}
                    onChange={() => toggleBikePref(cat)}
                  />
                  <span>{cat}</span>
                </label>
              )
            })}
          </div>
          <p className="text-xs text-black/50 mt-1">Usamos esta info para enviarte novedades que realmente te interesen.</p>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 accent-mb-primary"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
          />
          <span>Acepto los <Link to="/terminos" className="underline" target="_blank" rel="noopener noreferrer">términos y condiciones</Link>.</span>
        </label>

        <Button onClick={register} className="w-full" disabled={loading}>
          {loading ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
        <p className="text-sm text-black/60">¿Ya tenés cuenta? <Link className="underline" to="/login">Ingresá</Link></p>
      </div>
    </Container>
  )
}
