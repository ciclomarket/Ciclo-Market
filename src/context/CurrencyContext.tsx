
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type Currency = 'USD' | 'ARS'
interface Ctx { currency: Currency; setCurrency: (c: Currency)=>void; fx: number; format: (n:number)=>string }

const CurrencyContext = createContext<Ctx>({ currency:'USD', setCurrency: ()=>{}, fx: 1000, format: (n)=>'$'+n })

export function CurrencyProvider({ children }: { children: React.ReactNode }){
  const [currency, setCurrency] = useState<Currency>(()=> (localStorage.getItem('mb_currency') as Currency) || 'USD')
  const [fx, setFx] = useState<number>(()=> Number(localStorage.getItem('mb_fx')) || 1000)

  useEffect(()=>{ localStorage.setItem('mb_currency', currency) }, [currency])
  useEffect(()=>{ localStorage.setItem('mb_fx', String(fx)) }, [fx])

  const format = (n:number) => {
    const val = currency === 'USD' ? n : Math.round(n * fx)
    const locale = currency === 'USD' ? 'en-US' : 'es-AR'
    const cur = currency === 'USD' ? 'USD' : 'ARS'
    return new Intl.NumberFormat(locale, { style:'currency', currency: cur, maximumFractionDigits: 0 }).format(val)
  }

  const value = useMemo(()=>({ currency, setCurrency, fx, format }), [currency, fx])
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export const useCurrency = () => useContext(CurrencyContext)
