import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useCompare } from '../context/CompareContext'
import { mockListings } from '../mock/mockData'
import { fetchListingsByIds } from '../services/listings'
import { supabaseEnabled } from '../services/supabase'
import type { Listing } from '../types'

export default function CompareTray() {
  const { ids, remove, clear } = useCompare()
  const location = useLocation()
  const [items, setItems] = useState<Listing[]>([])

  if (!ids.length || location.pathname === '/comparar') return null

  useEffect(() => {
    let active = true
    const load = async () => {
      if (supabaseEnabled) {
        const data = await fetchListingsByIds(ids)
        if (!active) return
        if (data.length) {
          const order = new Map(ids.map((id, idx) => [id, idx]))
          const ordered = data.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
          setItems(ordered)
          return
        }
      }
      if (!active) return
      setItems(ids.map((id) => mockListings.find((l) => l.id === id)).filter((l): l is Listing => Boolean(l)))
    }
    load()
    return () => {
      active = false
    }
  }, [ids])

  if (!items.length) return null

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-center">
      <div className="pointer-events-auto w-full max-w-3xl overflow-hidden rounded-3xl border border-white/20 bg-[#14212e]/95 text-white shadow-[0_20px_60px_rgba(10,15,22,0.45)]">
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <div className="min-w-[120px]">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Comparar</p>
            <h3 className="text-lg font-semibold">{items.length} producto{items.length > 1 ? 's' : ''} seleccionado{items.length > 1 ? 's' : ''}</h3>
          </div>
          <div className="flex-1 overflow-x-auto">
            <ul className="flex items-center gap-3 text-sm text-white/80">
              {items.map((item) => (
                <li key={item.id} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1">
                  <span>{item.brand} {item.model}</span>
                  <button
                    type="button"
                    className="text-white/60 hover:text-white"
                    onClick={() => remove(item.id)}
                    aria-label="Quitar de comparativa"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-wide text-white/70 hover:bg-white/10"
              onClick={clear}
            >
              Limpiar
            </button>
            <Link
              to="/comparar"
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#14212e] hover:bg-white/90"
            >
              Ver comparativas
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
