import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import Button from '../components/Button'
import { useCompare } from '../context/CompareContext'
import { mockListings } from '../mock/mockData'
import { formatListingPrice } from '../utils/pricing'
import { useCurrency } from '../context/CurrencyContext'
import { fetchListingsByIds } from '../services/listings'
import { supabaseEnabled } from '../services/supabase'
import type { Listing } from '../types'

export default function Compare() {
  const { ids, remove, clear } = useCompare()
  const { format, fx } = useCurrency()
  const [items, setItems] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      if (ids.length === 0) {
        setItems([])
        setLoading(false)
        return
      }
      setLoading(true)
      const order = new Map(ids.map((id, index) => [id, index]))
      if (supabaseEnabled) {
        const data = await fetchListingsByIds(ids)
        if (!active) return
        if (data.length) {
          const ordered = [...data].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
          setItems(ordered)
          setLoading(false)
          return
        }
      }
      if (!active) return
      const fallback = ids
        .map((id) => mockListings.find((l) => l.id === id))
        .filter((l): l is Listing => Boolean(l))
      setItems(fallback)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [ids])

  const rows = useMemo(() => {
    return [
      {
        label: 'Precio',
        values: items.map((item) =>
          formatListingPrice(item.price, item.priceCurrency, format, fx)
        ),
      },
      { label: 'Categoría', values: items.map((item) => item.category) },
      { label: 'Marca', values: items.map((item) => item.brand) },
      { label: 'Modelo', values: items.map((item) => item.model) },
      { label: 'Año', values: items.map((item) => item.year ?? '—') },
      { label: 'Material', values: items.map((item) => item.material ?? '—') },
      { label: 'Grupo', values: items.map((item) => item.drivetrain || item.drivetrainDetail || '—') },
      { label: 'Rodado', values: items.map((item) => item.wheelSize ?? '—') },
      { label: 'Ruedas', values: items.map((item) => item.wheelset ?? '—') },
      { label: 'Extras', values: items.map((item) => item.extras ?? '—') },
    ]
  }, [items, format, fx])

  if (loading) {
    return (
      <Container>
        <div className="py-16 text-center text-[#14212e]">
          Cargando bicicletas para comparar…
        </div>
      </Container>
    )
  }

  if (!items.length) {
    return (
      <Container>
        <div className="py-16 text-center">
          <h1 className="text-3xl font-bold text-[#14212e]">Comparador vacío</h1>
          <p className="mt-3 text-sm text-[#14212e]/70">
            Agregá bicicletas desde el marketplace o el detalle de producto con el botón “Comparar bicicleta”.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button to="/marketplace" className="bg-[#14212e] text-white hover:bg-[#1b2f3f]">
              Ir al marketplace
            </Button>
          </div>
        </div>
      </Container>
    )
  }

  return (
    <div className="bg-[#0f1729] py-12 text-white">
      <Container>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs uppercase tracking-[0.4em] text-white/50">Comparador</span>
            <h1 className="mt-2 text-3xl font-semibold">Tus bicicletas en paralelo</h1>
            <p className="text-sm text-white/70">
              Analizá specs y diferenciales para elegir la opción ideal.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button to="/marketplace" variant="ghost" className="text-white">
              Seguir explorando
            </Button>
            <Button type="button" onClick={clear} className="bg-white text-[#14212e] hover:bg-white/90">
              Limpiar comparativa
            </Button>
          </div>
        </div>

        <div className="mt-8 overflow-x-auto">
          <div className="min-w-[720px]">
            <table className="w-full table-fixed border-collapse">
              <thead>
                <tr>
                  <th className="w-40 py-3 pr-6 text-left text-xs uppercase tracking-wide text-white/60">Ficha</th>
                  {items.map((item) => (
                    <th key={item.id} className="px-4 py-3 text-left">
                      <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white line-clamp-2">{item.title}</p>
                            <p className="text-xs text-white/60">{item.location}</p>
                          </div>
                          <button
                            type="button"
                            className="text-white/50 hover:text-white"
                            onClick={() => remove(item.id)}
                            aria-label="Quitar de la comparación"
                          >
                            ×
                          </button>
                        </div>
                        {item.images?.[0] && (
                          <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
                            <img
                              src={item.images[0]}
                              alt={item.title}
                              className="h-28 w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        )}
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-lg font-bold text-white">
                            {formatListingPrice(item.price, item.priceCurrency, format, fx)}
                          </span>
                          {item.originalPrice && (
                            <span className="text-xs text-white/60 line-through">
                              {formatListingPrice(item.originalPrice, item.priceCurrency, format, fx)}
                            </span>
                          )}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-t border-white/10">
                    <th className="w-40 px-4 py-3 text-left text-xs uppercase tracking-wide text-white/60">
                      {row.label}
                    </th>
                    {row.values.map((value, idx) => (
                      <td key={`${row.label}-${idx}`} className="px-4 py-3 text-sm text-white/80">
                        {value || <span className="text-white/40">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Container>
    </div>
  )
}
