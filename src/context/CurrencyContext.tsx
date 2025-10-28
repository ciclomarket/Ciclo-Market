
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { fetchFxFromSupabase } from '../services/fx'

type Currency = 'USD' | 'ARS'
interface Ctx { currency: Currency; setCurrency: (c: Currency)=>void; fx: number; setFx: (v:number)=>void; format: (n:number)=>string }

const CurrencyContext = createContext<Ctx>({ currency:'USD', setCurrency: ()=>{}, fx: 1000, setFx: ()=>{}, format: (n)=>'$'+n })

export function CurrencyProvider({ children }: { children: React.ReactNode }){
  const [currency, setCurrency] = useState<Currency>(()=> (localStorage.getItem('mb_currency') as Currency) || 'USD')
  const [fx, setFx] = useState<number>(() => {
    const fromEnv = Number((import.meta as any).env?.VITE_USD_ARS_FX)
    if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv
    const fromLs = Number(localStorage.getItem('mb_fx'))
    return Number.isFinite(fromLs) && fromLs > 0 ? fromLs : 1000
  })

  useEffect(()=>{ localStorage.setItem('mb_currency', currency) }, [currency])
  useEffect(()=>{ localStorage.setItem('mb_fx', String(fx)) }, [fx])

  useEffect(() => {
    // Intentar cargar FX desde Supabase para todos los usuarios
    let active = true
    ;(async () => {
      try {
        const remote = await fetchFxFromSupabase()
        if (!active) return
        if (Number.isFinite(remote) && (remote as number) > 0 && remote !== fx) {
          setFx(remote as number)
        }
      } catch { /* ignore */ }
    })()
    return () => { active = false }
  }, [])

  const format = (n:number) => {
    const val = currency === 'USD' ? n : Math.round(n * fx)
    const locale = currency === 'USD' ? 'en-US' : 'es-AR'
    const cur = currency === 'USD' ? 'USD' : 'ARS'
    return new Intl.NumberFormat(locale, { style:'currency', currency: cur, maximumFractionDigits: 0 }).format(val)
  }

  const value = useMemo(()=>({ currency, setCurrency, fx, setFx, format }), [currency, fx])
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export const useCurrency = () => useContext(CurrencyContext)
