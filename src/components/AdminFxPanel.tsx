import { useEffect, useState } from 'react'
import { useCurrency } from '../context/CurrencyContext'
import { useAuth } from '../context/AuthContext'
import { fetchFxFromSupabase, upsertFxInSupabase } from '../services/fx'

export default function AdminFxPanel() {
  const { isModerator } = useAuth()
  const { fx, setFx } = useCurrency()
  const [current, setCurrent] = useState<number>(fx)
  const [remoteFx, setRemoteFx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string>('')

  useEffect(() => {
    setCurrent(fx)
  }, [fx])

  useEffect(() => {
    // Leer FX desde Supabase (si existe tabla/políticas)
    fetchFxFromSupabase().then((val) => { if (val) setRemoteFx(val) }).catch(()=>{})
  }, [])

  if (!isModerator) return null
  return (
    <div className="rounded-xl border border-[#14212e]/15 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#14212e]">Tipo de cambio (USD → ARS)</h3>
        <span className="text-xs text-[#14212e]/60">Supabase: {remoteFx ? remoteFx : '—'}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col text-sm">
          <span className="text-[#14212e]/60">Actual (app)</span>
          <input type="number" className="input mt-1 rounded-md border px-3 py-2" value={current}
            onChange={(e) => setCurrent(Number(e.target.value))} />
        </label>
        <div className="sm:col-span-2 text-xs text-[#14212e]/60">Guardá para todos los usuarios (requiere rol con permisos en Supabase RLS).</div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className="rounded-md bg-[#14212e] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#0f1220] disabled:opacity-60"
          disabled={saving || !(current && current > 0)}
          onClick={async () => {
            setSaving(true); setMsg('')
            try {
              const ok = await upsertFxInSupabase(current)
              if (ok) { setMsg('Guardado en Supabase'); setRemoteFx(current) }
              else setMsg('Guardado local (sin permisos en Supabase)')
              setFx(current)
            } catch (e: any) {
              setMsg(e?.message || 'Error')
            } finally { setSaving(false) }
          }}
        >
          Guardar
        </button>
        {msg ? (<span className="text-xs text-[#14212e]/70">{msg}</span>) : null}
      </div>
    </div>
  )
}
