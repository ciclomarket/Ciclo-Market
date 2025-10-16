import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import SEO from '../components/SEO'
import { fetchStores, type StoreSummary } from '../services/users'

export default function Tiendas() {
  const [stores, setStores] = useState<StoreSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const data = await fetchStores()
      if (!active) return
      setStores(data)
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [])

  return (
    <>
      <SEO title="Tiendas oficiales" description="Descubrí todas las tiendas oficiales en Ciclo Market y mirá sus productos publicados, datos de contacto y redes." />
      <section className="bg-[#0b131c] text-white">
        <Container>
          <div className="mx-auto max-w-3xl py-10">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Tiendas oficiales</h1>
            <p className="mt-3 text-white/80">Locales y equipos con presencia verificada dentro de Ciclo Market. Ingresá para ver su catálogo y datos de contacto.</p>
          </div>
        </Container>
      </section>
      <section className="bg-[#14212e] text-white">
        <Container>
          <div className="py-10">
            {loading && <div className="text-white/80">Cargando…</div>}
            {!loading && stores.length === 0 && <div className="text-white/80">No hay tiendas publicadas aún.</div>}
            {!loading && stores.length > 0 && (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {stores.map((s) => (
                  <li key={s.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <Link to={`/tienda/${encodeURIComponent(s.store_slug)}`} className="flex items-center gap-3 hover:opacity-90">
                      {s.store_avatar_url ? (
                        <img src={s.store_avatar_url} alt={s.store_name || s.store_slug} className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-white/20" />
                      )}
                      <div>
                        <div className="font-semibold">{s.store_name || s.store_slug}</div>
                        <div className="text-xs text-white/70">{[s.city, s.province].filter(Boolean).join(', ')}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Container>
      </section>
    </>
  )
}

