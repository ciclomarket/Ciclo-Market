import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Container from '../components/Container'
import SEO from '../components/SEO'
import { fetchUserProfile, fetchStoreProfileBySlug, type UserProfileRecord } from '../services/users'
import { fetchListingsBySeller } from '../services/listings'
import ListingCard from '../components/ListingCard'
import type { Listing } from '../types'

type FilterOption = { id: string; label: string; match: (l: Listing) => boolean }
type FilterSection = { id: string; label: string; options: FilterOption[] }

function textIncludes(l: Listing, ...terms: string[]) {
  const hay = `${l.title} ${l.brand} ${l.model} ${l.description || ''} ${l.extras || ''}`.toLowerCase()
  return terms.some((t) => hay.includes(t.toLowerCase()))
}

function subcatIs(l: Listing, ...values: string[]) {
  const sc = (l.subcategory || '').toLowerCase()
  if (!sc) return false
  return values.some((v) => sc === v.toLowerCase() || sc.includes(v.toLowerCase()))
}

const FILTERS: FilterSection[] = [
  {
    id: 'road',
    label: 'Ruta & Gravel',
    options: [
      { id: 'road', label: 'Bicicletas de Ruta', match: (l) => (l.category || '').toLowerCase().includes('ruta') || subcatIs(l, 'ruta') },
      { id: 'gravel', label: 'Gravel', match: (l) => (l.category || '').toLowerCase().includes('gravel') || subcatIs(l, 'gravel') },
      { id: 'tt', label: 'Triatlón / TT', match: (l) => subcatIs(l, 'triatlón','tt') || textIncludes(l, 'tt', 'triatl') },
      { id: 'vintage', label: 'Vintage / Acero', match: (l) => subcatIs(l, 'vintage','acero') || textIncludes(l, 'vintage', 'acero') },
    ]
  },
  {
    id: 'mtb',
    label: 'MTB',
    options: [
      { id: 'xc', label: 'Cross Country', match: (l) => subcatIs(l, 'xc','cross country') || textIncludes(l, 'xc', 'cross country') },
      { id: 'trail', label: 'Trail', match: (l) => subcatIs(l, 'trail') || textIncludes(l, 'trail') },
      { id: 'enduro', label: 'Enduro', match: (l) => subcatIs(l, 'enduro') || textIncludes(l, 'enduro') },
      { id: 'dh', label: 'Downhill', match: (l) => subcatIs(l, 'downhill','dh') || textIncludes(l, 'downhill', 'dh') },
    ]
  },
  {
    id: 'urban',
    label: 'Urbana & Fixie',
    options: [
      { id: 'urbana', label: 'Urbana', match: (l) => (l.category || '').toLowerCase().includes('urbana') || subcatIs(l, 'urbana') },
      { id: 'fixie', label: 'Fixie', match: (l) => (l.category || '').toLowerCase().includes('fixie') || subcatIs(l, 'fixie') },
      { id: 'singlespeed', label: 'Single Speed', match: (l) => subcatIs(l, 'singlespeed','single speed') || textIncludes(l, 'single speed') },
    ]
  },
  {
    id: 'accessories',
    label: 'Accesorios',
    options: [
      { id: 'electro', label: 'Electrónica', match: (l) => (l.category || '').toLowerCase().includes('accesor') && (subcatIs(l, 'electrónica','electronica') || textIncludes(l, 'gps', 'sensor', 'ciclocomput')) },
      { id: 'rodillos', label: 'Rodillos', match: (l) => (l.category || '').toLowerCase().includes('accesor') && (subcatIs(l, 'rodillo','trainer') || textIncludes(l, 'rodillo', 'trainer')) },
      { id: 'luces', label: 'Luces', match: (l) => (l.category || '').toLowerCase().includes('accesor') && (subcatIs(l, 'luces','luz') || textIncludes(l, 'luz', 'luces')) },
      { id: 'componentes', label: 'Componentes', match: (l) => (l.category || '').toLowerCase().includes('accesor') && (subcatIs(l, 'componentes','ruedas','grupo','cockpit') || textIncludes(l, 'rueda', 'grupo', 'sillin', 'manubrio', 'stem', 'frenos')) },
    ]
  },
  {
    id: 'apparel',
    label: 'Indumentaria',
    options: [
      { id: 'jersey', label: 'Jerseys', match: (l) => (l.category || '').toLowerCase().includes('indument') && (subcatIs(l, 'jersey') || textIncludes(l, 'jersey')) },
      { id: 'casco', label: 'Cascos', match: (l) => (l.category || '').toLowerCase().includes('indument') && (subcatIs(l, 'casco') || textIncludes(l, 'casco')) },
      { id: 'zapatillas', label: 'Zapatillas', match: (l) => (l.category || '').toLowerCase().includes('indument') && (subcatIs(l, 'zapatilla') || textIncludes(l, 'zapat')) },
      { id: 'otros', label: 'Otros', match: (l) => (l.category || '').toLowerCase().includes('indument') },
    ]
  },
  {
    id: 'ebike',
    label: 'E‑Bike',
    options: [
      { id: 'ebike', label: 'Todas las E‑Bike', match: (l) => subcatIs(l, 'e-bike','ebike') || textIncludes(l, 'e-bike', 'ebike', 'steps') },
    ]
  },
]

export default function Store() {
  const params = useParams()
  const [search, setSearch] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [profile, setProfile] = useState<UserProfileRecord | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const activeSection = (search.get('sec') || '').trim()
  const activeOption = (search.get('opt') || '').trim()

  const sellerId = useMemo(() => profile?.id ?? null, [profile])

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      // Buscamos por slug en users.store_slug o por id directo
      const slugOrId = (params.slug as string) || ''
      let found: UserProfileRecord | null = null
      // Si parece un UUID, buscar por id; si no, por store_slug
      if (/^[0-9a-fA-F-]{16,}$/.test(slugOrId)) {
        found = await fetchUserProfile(slugOrId)
      } else {
        found = await fetchStoreProfileBySlug(slugOrId)
      }
      if (!active) return
      setProfile(found)
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [params.slug])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!sellerId) { setListings([]); return }
      const rows = await fetchListingsBySeller(sellerId)
      if (!mounted) return
      setListings(rows)
    }
    void load()
    return () => { mounted = false }
  }, [sellerId])

  const filtered = useMemo(() => {
    if (!activeSection && !activeOption) return listings
    const section = FILTERS.find((s) => s.id === activeSection) || null
    if (section && activeOption) {
      const opt = section.options.find((o) => o.id === activeOption)
      if (opt) return listings.filter(opt.match)
    }
    if (section) {
      return listings.filter((l) => section.options.some((o) => o.match(l)))
    }
    return listings
  }, [listings, activeSection, activeOption])

  const [minPrice, setMinPrice] = useState<string>('')
  const [maxPrice, setMaxPrice] = useState<string>('')
  const [sort, setSort] = useState<'newest'|'price_asc'|'price_desc'>('newest')

  const priceFiltered = useMemo(() => {
    const min = Number(minPrice) || 0
    const max = Number(maxPrice) || 0
    return filtered.filter((l) => {
      const p = Number(l.price) || 0
      if (min && p < min) return false
      if (max && p > max) return false
      return true
    })
  }, [filtered, minPrice, maxPrice])

  const finalList = useMemo(() => {
    const arr = [...priceFiltered]
    if (sort === 'newest') {
      arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    } else if (sort === 'price_asc') {
      arr.sort((a, b) => (a.price || 0) - (b.price || 0))
    } else if (sort === 'price_desc') {
      arr.sort((a, b) => (b.price || 0) - (a.price || 0))
    }
    return arr
  }, [priceFiltered, sort])

  if (loading) return <Container className="py-12">Cargando tienda…</Container>
  if (!profile || !profile.store_enabled) return <Container className="py-12">Tienda no encontrada.</Container>

  const banner = profile.store_banner_url || '/og-preview.png'
  const bannerPosY = typeof profile.store_banner_position_y === 'number' ? profile.store_banner_position_y : 50
  const avatar = profile.store_avatar_url || profile.avatar_url || '/avatar-placeholder.png'
  const storeName = profile.store_name || profile.full_name || 'Tienda'
  const address = profile.store_address || [profile.city, profile.province].filter(Boolean).join(', ')
  const phone = profile.store_phone || profile.whatsapp_number || ''

  const setSection = (sec: string, opt?: string) => {
    const next = new URLSearchParams(search)
    if (!sec) { next.delete('sec'); next.delete('opt') }
    else {
      next.set('sec', sec)
      if (!opt) next.delete('opt'); else next.set('opt', opt)
    }
    setSearch(next, { replace: true })
  }

  return (
    <div className="min-h-[70vh] bg-[#14212e]">
      <SEO
        title={storeName}
        description={`Productos de ${storeName} en Ciclo Market. ${address || ''}`}
        image={banner}
        type="profile"
      />
      <div className="relative h-48 md:h-64 w-full overflow-hidden bg-[#14212e]">
        <img src={banner} alt="Banner" className="h-full w-full object-cover" style={{ objectPosition: `center ${bannerPosY}%` }} />
        {/* Fade inferior sutil en todos los tamaños para legibilidad del título */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 md:h-28 bg-gradient-to-t from-[#14212e]/80 via-transparent to-transparent"
          aria-hidden
        />
      </div>
      <Container>
        <div className="relative z-20 -mt-8 md:-mt-10 flex flex-wrap items-end gap-4">
          <img src={avatar} alt={storeName} className="h-20 w-20 rounded-2xl border-4 border-white object-cover shadow" />
          <div className="flex-1 min-w-0 pt-2">
            <h1 className="text-2xl font-bold text-white truncate">{storeName}</h1>
            <p className="text-sm text-white/80 truncate">{address}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {phone && (
                <a href={`tel:${phone}`} className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-white shadow hover:bg-white/20">
                  <PhoneIcon /> Llamar
                </a>
              )}
              {profile.store_instagram && (
                <a href={normalizeHandle(profile.store_instagram, 'ig')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-white shadow hover:bg-white/20">
                  <InstagramIcon /> Instagram
                </a>
              )}
              {profile.store_facebook && (
                <a href={normalizeHandle(profile.store_facebook, 'fb')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-white shadow hover:bg-white/20">
                  <FacebookIcon /> Facebook
                </a>
              )}
              {profile.store_website && (
                <a href={profile.store_website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-white shadow hover:bg-white/20">
                  <LinkIcon /> Sitio web
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="lg:sticky lg:top-28">
            <div className="mb-3 lg:hidden">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-[#14212e]/20 px-3 py-2 text-sm text-[#14212e] bg-white"
                onClick={() => setFiltersOpen((v) => !v)}
              >
                <MenuIcon /> Filtros
              </button>
            </div>
            <div className={`${filtersOpen ? '' : 'hidden'} lg:block rounded-2xl border border-[#14212e]/10 bg-white p-4`}>
              <h3 className="text-sm font-semibold text-[#14212e] mb-2">Categorías</h3>
              <ul className="space-y-3">
                {FILTERS.map((sec) => (
                  <li key={sec.id} className="border-b border-[#14212e]/10 pb-3 last:border-0">
                    <p className="text-sm font-semibold text-[#14212e] mb-2">{sec.label}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${activeSection === sec.id && !activeOption ? 'bg-[#14212e] text-white' : 'bg-[#14212e]/5 text-[#14212e] hover:bg-[#14212e]/10'}`}
                        onClick={() => setSection(sec.id)}
                      >
                        Todo
                      </button>
                      {sec.options.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${activeSection === sec.id && activeOption === opt.id ? 'bg-[#14212e] text-white' : 'bg-[#14212e]/5 text-[#14212e] hover:bg-[#14212e]/10'}`}
                          onClick={() => setSection(sec.id, opt.id)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <h3 className="mt-4 text-sm font-semibold text-[#14212e] mb-2">Precio</h3>
              <div className="flex items-center gap-2">
                <input className="input flex-1" inputMode="numeric" placeholder="Mín" value={minPrice} onChange={(e) => setMinPrice(e.target.value.replace(/[^0-9]/g,''))} />
                <span className="text-xs text-[#14212e]/50">—</span>
                <input className="input flex-1" inputMode="numeric" placeholder="Máx" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/[^0-9]/g,''))} />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-[#14212e] mb-2">Ordenar</h3>
              <select className="select w-full" value={sort} onChange={(e) => setSort(e.target.value as any)}>
                <option value="newest">Más nuevas</option>
                <option value="price_asc">Precio: menor a mayor</option>
                <option value="price_desc">Precio: mayor a menor</option>
              </select>
              <button
                type="button"
                className="mt-4 w-full rounded-full border border-[#14212e]/20 px-3 py-2 text-sm text-[#14212e] hover:bg-[#14212e]/5"
                onClick={() => {
                  setMinPrice('')
                  setMaxPrice('')
                  setSort('newest')
                  setSection('')
                }}
              >
                Limpiar filtros
              </button>
            </div>
          </aside>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start content-start">
            {finalList.map((l) => (
              <ListingCard key={l.id} l={l} />
            ))}
            {finalList.length === 0 && (
              <div className="py-12 text-center text-[#14212e]/60 col-span-full">No hay productos en esta categoría.</div>
            )}
          </div>
        </div>
      </Container>
    </div>
  )
}

function normalizeHandle(value: string, type: 'ig' | 'fb') {
  const v = (value || '').trim()
  if (!v) return '#'
  if (type === 'ig') {
    if (/^https?:\/\//i.test(v)) return v
    return `https://instagram.com/${v.replace(/^@+/, '')}`
  }
  if (/^https?:\/\//i.test(v)) return v
  return `https://facebook.com/${v.replace(/^@+/, '')}`
}

function PhoneIcon() {
  return <img src="/call.png" alt="" className="h-5 w-5" loading="lazy" decoding="async" aria-hidden />
}
function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5m5 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10m6.5-.25a1.25 1.25 0 1 0 0 2.5a1.25 1.25 0 0 0 0-2.5Z" />
    </svg>
  )
}
function FacebookIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#fff" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.49 0-1.954.928-1.954 1.88v2.26h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
    </svg>
  )
}
function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 13.5 13.5 10.5m-8 8 3-3m5-5 3-3M7.5 16.5A4.5 4.5 0 1 1 1.5 10.5 4.5 4.5 0 0 1 7.5 16.5Zm9-9A4.5 4.5 0 1 1 12.5 1.5 4.5 4.5 0 0 1 16.5 7.5Z" />
    </svg>
  )
}
function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}
