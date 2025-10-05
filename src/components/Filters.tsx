import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

const CATS = ['Todos','Ruta','MTB','Gravel','Urbana','Accesorios','E-Bike','Niños','Pista','Triatlón'] as const
type Cat = typeof CATS[number]

export interface FiltersState { q: string; cat: Cat; maxPrice?: number; location?: string }

type FiltersProps = {
  onChange: (f: FiltersState) => void
  onSearch?: (f: FiltersState) => void
  value?: FiltersState
}

export default function Filters({ onChange, onSearch, value }: FiltersProps) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<Cat>('Todos')
  const [maxPrice, setMaxPrice] = useState<number|undefined>()
  const [location, setLocation] = useState<string>('')

  // 👉 Notificar cambios *después* del render (no dentro):
  useEffect(() => {
    const id = setTimeout(() => onChange({ q, cat, maxPrice, location }), 150) // debounce
    return () => clearTimeout(id)
  }, [q, cat, maxPrice, location, onChange])

  useEffect(() => {
    if (!value) return
    setQ(value.q)
    setCat(value.cat)
    setMaxPrice(value.maxPrice)
    setLocation(value.location ?? '')
  }, [value])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSearch?.({ q, cat, maxPrice, location })
  }

  return (
    <form onSubmit={submit} className="card p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-end">
      <div className="flex-1">
        <div className="label">Buscar</div>
        <input className="input" placeholder="Marca, modelo..." value={q} onChange={e=>setQ(e.target.value)} />
      </div>
      <div>
        <div className="label">Categoría</div>
        <select className="select" value={cat} onChange={e=>setCat(e.target.value as Cat)}>
          {CATS.map(c=> <option key={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <div className="label">Precio máx.</div>
        <input className="input w-40" type="number" placeholder="USD" value={maxPrice ?? ''} onChange={e=>setMaxPrice(Number(e.target.value) || undefined)} />
      </div>
      <div>
        <div className="label">Ubicación</div>
        <input className="input w-48" placeholder="Ciudad/Prov." value={location} onChange={e=>setLocation(e.target.value)} />
      </div>
      {onSearch && (
        <div className="md:ml-auto">
          <button type="submit" className="btn w-full md:w-auto">Buscar en marketplace</button>
        </div>
      )}
    </form>
  )
}
