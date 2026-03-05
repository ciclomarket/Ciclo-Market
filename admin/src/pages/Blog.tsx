import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { BlogPost } from '@admin/types/blog'
import { listAllBlogPosts, deleteBlogPost } from '@admin/services/blog'
import { useAdminAuth } from '@admin/context/AdminAuthContext'

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function formatDate(value: string | null): string {
  if (!value) return '—'
  try {
    return dateFormatter.format(new Date(value))
  } catch {
    return value
  }
}

const numberFormatter = new Intl.NumberFormat('es-AR')

type FilterStatus = 'all' | 'published' | 'draft'
type SortField = 'updatedAt' | 'createdAt' | 'publishedAt' | 'views' | 'title'
type SortOrder = 'desc' | 'asc'
type ViewMode = 'table' | 'grid'

const POSTS_PER_PAGE = 10

// Iconos como componentes simples
const Icons = {
  FileText: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10,9 9,9 8,9" />
    </svg>
  ),
  CheckCircle: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22,4 12,14.01 9,11.01" />
    </svg>
  ),
  Clock: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  ),
  BarChart: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  Search: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Filter: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
      <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3" />
    </svg>
  ),
  Refresh: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
      <polyline points="23,4 23,10 17,10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  ),
  List: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  Grid: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  Eye: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  Edit: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  Trash: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
      <polyline points="3,6 5,6 21,6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Plus: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
      <polyline points="15,18 9,12 15,6" />
    </svg>
  ),
  ChevronRight: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
      <polyline points="9,18 15,12 9,6" />
    </svg>
  ),
  X: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Calendar: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
}

interface StatCardProps {
  title: string
  value: string
  description: string
  icon: React.ReactNode
  iconColor: 'blue' | 'green' | 'amber' | 'purple'
}

function StatCard({ title, value, description, icon, iconColor }: StatCardProps) {
  const colorMap = {
    blue: '#3b82f6',
    green: '#10b981',
    amber: '#f59e0b',
    purple: '#8b5cf6',
  }

  return (
    <article className="admin-card">
      <div className="admin-card-header">
        <div>
          <h3 className="admin-card-title">{title}</h3>
          <p className="admin-card-value">{value}</p>
        </div>
        <div 
          className="admin-card-icon" 
          style={{ 
            background: `linear-gradient(135deg, ${colorMap[iconColor]}, ${colorMap[iconColor]}dd)`,
            color: 'white'
          }}
        >
          {icon}
        </div>
      </div>
      <p className="admin-card-description">{description}</p>
    </article>
  )
}

export default function BlogPage() {
  const { user } = useAdminAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [posts, setPosts] = useState<BlogPost[]>([])
  
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [sortField, setSortField] = useState<SortField>('updatedAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [showFilters, setShowFilters] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  const loadPosts = async () => {
    try {
      setFetching(true)
      setError(null)
      const data = await listAllBlogPosts()
      setPosts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar posts')
    } finally {
      setFetching(false)
    }
  }

  useEffect(() => {
    loadPosts()
  }, [])

  const filteredPosts = useMemo(() => {
    let result = [...posts]
    
    if (filterStatus !== 'all') {
      result = result.filter(post => post.status === filterStatus)
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(post => 
        post.title.toLowerCase().includes(query) ||
        post.slug.toLowerCase().includes(query) ||
        post.tags.some(tag => tag.toLowerCase().includes(query))
      )
    }
    
    result.sort((a, b) => {
      let valueA: string | number
      let valueB: string | number
      
      switch (sortField) {
        case 'title':
          valueA = a.title.toLowerCase()
          valueB = b.title.toLowerCase()
          break
        case 'views':
          valueA = a.views || 0
          valueB = b.views || 0
          break
        case 'createdAt':
          valueA = a.createdAt
          valueB = b.createdAt
          break
        case 'publishedAt':
          valueA = a.publishedAt || ''
          valueB = b.publishedAt || ''
          break
        default:
          valueA = a.updatedAt
          valueB = b.updatedAt
      }
      
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return sortOrder === 'desc' 
          ? valueB.localeCompare(valueA) 
          : valueA.localeCompare(valueB)
      }
      
      return sortOrder === 'desc' 
        ? (valueB as number) - (valueA as number)
        : (valueA as number) - (valueB as number)
    })
    
    return result
  }, [posts, filterStatus, searchQuery, sortField, sortOrder])

  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE)
  const paginatedPosts = useMemo(() => {
    const start = (currentPage - 1) * POSTS_PER_PAGE
    return filteredPosts.slice(start, start + POSTS_PER_PAGE)
  }, [filteredPosts, currentPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filterStatus, sortField, sortOrder])

  const stats = useMemo(() => ({
    total: posts.length,
    published: posts.filter(p => p.status === 'published').length,
    drafts: posts.filter(p => p.status === 'draft').length,
    totalViews: posts.reduce((sum, p) => sum + (p.views || 0), 0),
  }), [posts])

  const handleDelete = async (post: BlogPost) => {
    if (!window.confirm(`¿Eliminar "${post.title}"?`)) return
    try {
      await deleteBlogPost(post.id)
      await loadPosts()
    } catch (err) {
      alert('Error al eliminar: ' + (err instanceof Error ? err.message : 'Error'))
    }
  }

  const clearFilters = () => {
    setSearchQuery('')
    setFilterStatus('all')
    setSortField('updatedAt')
    setSortOrder('desc')
    setCurrentPage(1)
  }

  const openEditor = (postId?: string) => {
    const baseUrl = window.location.origin.replace(':5273', ':5173')
    const url = postId 
      ? `${baseUrl}/admin/blog?edit=${postId}`
      : `${baseUrl}/admin/blog?new=1`
    window.open(url, '_blank')
  }

  const hasActiveFilters = searchQuery || filterStatus !== 'all'

  return (
    <div>
      {/* Header */}
      <div className="admin-header">
        <div className="admin-header-content">
          <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--admin-text-muted)', margin: '0 0 0.5rem' }}>
            Panel de moderación
          </p>
          <h1>Blog</h1>
          <p>Gestioná las notas visibles para toda la comunidad de Ciclo Market.</p>
        </div>
        <div className="admin-header-actions">
          <button 
            className="btn btn-primary" 
            onClick={() => openEditor()}
            disabled={!user}
          >
            <Icons.Plus />
            <span>Nueva entrada</span>
          </button>
        </div>
      </div>

      <div className="admin-content">
        {/* Stats */}
        {!fetching && posts.length > 0 && (
          <div className="admin-grid admin-grid-4" style={{ marginBottom: '1.5rem' }}>
            <StatCard
              title="Total entradas"
              value={String(stats.total)}
              description="Posts en el blog"
              icon={<Icons.FileText />}
              iconColor="blue"
            />
            <StatCard
              title="Publicadas"
              value={String(stats.published)}
              description="Visibles al público"
              icon={<Icons.CheckCircle />}
              iconColor="green"
            />
            <StatCard
              title="Borradores"
              value={String(stats.drafts)}
              description="En edición"
              icon={<Icons.Clock />}
              iconColor="amber"
            />
            <StatCard
              title="Total vistas"
              value={numberFormatter.format(stats.totalViews)}
              description="Visitas acumuladas"
              icon={<Icons.BarChart />}
              iconColor="purple"
            />
          </div>
        )}

        {/* Filters */}
        <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            {/* Search */}
            <div style={{ position: 'relative', flex: '1 1 300px', minWidth: '200px' }}>
              <div style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--admin-text-light)' }}>
                <Icons.Search />
              </div>
              <input
                type="text"
                placeholder="Buscar por título, slug, tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                  border: '1px solid var(--admin-border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.875rem',
                  background: 'var(--admin-surface)',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: '0.25rem', cursor: 'pointer', color: 'var(--admin-text-muted)' }}
                >
                  <Icons.X />
                </button>
              )}
            </div>

            {/* Filter button */}
            <button
              className={`btn ${hasActiveFilters ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Icons.Filter />
              <span>Filtros</span>
              {hasActiveFilters && <span style={{ marginLeft: '0.25rem', background: 'rgba(255,255,255,0.2)', padding: '0 0.375rem', borderRadius: '999px', fontSize: '0.75rem' }}>ON</span>}
            </button>

            {/* Refresh */}
            <button className="btn btn-secondary" onClick={loadPosts} disabled={fetching}>
              <span style={{ animation: fetching ? 'spin 1s linear infinite' : undefined }}><Icons.Refresh /></span>
            </button>

            {/* View mode */}
            <div style={{ display: 'flex', border: '1px solid var(--admin-border)', borderRadius: 'var(--radius-md)', padding: '0.25rem' }}>
              <button
                onClick={() => setViewMode('table')}
                style={{
                  padding: '0.375rem',
                  borderRadius: 'var(--radius)',
                  border: 'none',
                  background: viewMode === 'table' ? 'var(--admin-gray-100)' : 'transparent',
                  color: viewMode === 'table' ? 'var(--admin-text)' : 'var(--admin-text-muted)',
                  cursor: 'pointer',
                }}
              >
                <Icons.List />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                style={{
                  padding: '0.375rem',
                  borderRadius: 'var(--radius)',
                  border: 'none',
                  background: viewMode === 'grid' ? 'var(--admin-gray-100)' : 'transparent',
                  color: viewMode === 'grid' ? 'var(--admin-text)' : 'var(--admin-text-muted)',
                  cursor: 'pointer',
                }}
              >
                <Icons.Grid />
              </button>
            </div>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--admin-border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem' }}>Estado</label>
                <select 
                  value={filterStatus} 
                  onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--admin-border)' }}
                >
                  <option value="all">Todos</option>
                  <option value="published">Publicados</option>
                  <option value="draft">Borradores</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem' }}>Ordenar por</label>
                <select 
                  value={sortField} 
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--admin-border)' }}
                >
                  <option value="updatedAt">Última actualización</option>
                  <option value="createdAt">Fecha de creación</option>
                  <option value="publishedAt">Fecha de publicación</option>
                  <option value="views">Cantidad de vistas</option>
                  <option value="title">Título</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem' }}>Dirección</label>
                <select 
                  value={sortOrder} 
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--admin-border)' }}
                >
                  <option value="desc">Descendente</option>
                  <option value="asc">Ascendente</option>
                </select>
              </div>
            </div>
          )}

          {/* Results count */}
          <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>
            <span>{filteredPosts.length} {filteredPosts.length === 1 ? 'entrada' : 'entradas'}{hasActiveFilters && ' (filtradas)'}</span>
            {totalPages > 1 && <span>Página {currentPage} de {totalPages}</span>}
          </div>
        </div>

        {/* Loading */}
        {fetching && (
          <div className="admin-card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} style={{ height: '3rem', background: 'var(--admin-gray-100)', borderRadius: 'var(--radius-md)', animation: 'pulse 2s infinite' }} />
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="admin-card" style={{ borderLeft: '4px solid var(--cm-danger)' }}>
            <p style={{ color: 'var(--cm-danger)', margin: 0 }}>{error}</p>
            <button className="btn btn-secondary" onClick={loadPosts} style={{ marginTop: '0.75rem' }}>Reintentar</button>
          </div>
        )}

        {/* Empty state */}
        {!fetching && !error && filteredPosts.length === 0 && (
          <div className="admin-card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
            {hasActiveFilters ? (
              <>
                <h3 style={{ margin: '0 0 0.5rem' }}>No se encontraron resultados</h3>
                <p style={{ color: 'var(--admin-text-muted)', marginBottom: '1rem' }}>Prueba con otros filtros</p>
                <button className="btn btn-primary" onClick={clearFilters}>Limpiar filtros</button>
              </>
            ) : (
              <>
                <h3 style={{ margin: '0 0 0.5rem' }}>Aún no hay contenido</h3>
                <p style={{ color: 'var(--admin-text-muted)', marginBottom: '1rem' }}>Crea la primera nota del blog</p>
                <button className="btn btn-primary" onClick={() => openEditor()}>Crear primera entrada</button>
              </>
            )}
          </div>
        )}

        {/* Table view */}
        {!fetching && !error && filteredPosts.length > 0 && viewMode === 'table' && (
          <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: 'var(--admin-gray-50)', borderBottom: '1px solid var(--admin-border)' }}>
                  <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--admin-text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entrada</th>
                  <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--admin-text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estado</th>
                  <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--admin-text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Autor</th>
                  <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--admin-text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vistas</th>
                  <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--admin-text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha</th>
                  <th style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 600, color: 'var(--admin-text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPosts.map((post) => (
                  <tr key={post.id} style={{ borderBottom: '1px solid var(--admin-border-light)', transition: 'background 0.15s' }}>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {post.coverImageUrl ? (
                          <img src={post.coverImageUrl} alt="" style={{ width: '2.5rem', height: '2.5rem', borderRadius: 'var(--radius-md)', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: 'var(--radius-md)', background: 'var(--admin-gray-100)', display: 'grid', placeItems: 'center' }}>
                            <Icons.FileText />
                          </div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: 'var(--admin-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>{post.title}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>/{post.slug}</div>
                          {post.tags.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem' }}>
                              {post.tags.slice(0, 3).map(tag => (
                                <span key={tag} style={{ fontSize: '0.625rem', color: 'var(--admin-text-light)' }}>#{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.25rem 0.625rem',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        background: post.status === 'published' ? '#dcfce7' : '#fef3c7',
                        color: post.status === 'published' ? '#166534' : '#92400e',
                      }}>
                        {post.status === 'published' ? <Icons.CheckCircle /> : <Icons.Clock />}
                        {post.status === 'published' ? 'Publicado' : 'Borrador'}
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', color: 'var(--admin-text-secondary)' }}>{post.author?.fullName || '—'}</td>
                    <td style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>{numberFormatter.format(post.views || 0)}</td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: 'var(--admin-text-muted)' }}>
                      {post.status === 'published' && post.publishedAt ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Icons.Calendar />
                          {formatDate(post.publishedAt)}
                        </span>
                      ) : (
                        'No publicado'
                      )}
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <a 
                          href={`/blog/${post.slug}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-sm"
                          title="Ver"
                        >
                          <Icons.Eye />
                        </a>
                        <button 
                          className="btn btn-ghost btn-sm" 
                          onClick={() => openEditor(post.id)}
                          title="Editar"
                        >
                          <Icons.Edit />
                        </button>
                        <button 
                          className="btn btn-ghost btn-sm" 
                          onClick={() => handleDelete(post)}
                          style={{ color: 'var(--cm-danger)' }}
                          title="Eliminar"
                        >
                          <Icons.Trash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Grid view */}
        {!fetching && !error && filteredPosts.length > 0 && viewMode === 'grid' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {paginatedPosts.map((post) => (
              <div key={post.id} className="admin-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'relative', aspectRatio: '16/9', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--admin-gray-100)', marginBottom: '0.75rem' }}>
                  {post.coverImageUrl ? (
                    <img src={post.coverImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
                      <span style={{ fontSize: '2rem' }}>📝</span>
                    </div>
                  )}
                  <div style={{ position: 'absolute', top: '0.5rem', left: '0.5rem' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '999px',
                      fontSize: '0.625rem',
                      fontWeight: 600,
                      background: post.status === 'published' ? '#dcfce7' : '#fef3c7',
                      color: post.status === 'published' ? '#166534' : '#92400e',
                    }}>
                      {post.status === 'published' ? <Icons.CheckCircle /> : <Icons.Clock />}
                      {post.status === 'published' ? 'Publicado' : 'Borrador'}
                    </span>
                  </div>
                </div>
                
                <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 600, color: 'var(--admin-text)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{post.title}</h3>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>/{post.slug}</p>
                
                {post.excerpt && (
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', color: 'var(--admin-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{post.excerpt}</p>
                )}
                
                {post.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.75rem' }}>
                    {post.tags.slice(0, 4).map(tag => (
                      <span key={tag} style={{ padding: '0.125rem 0.375rem', background: 'var(--admin-gray-100)', borderRadius: 'var(--radius)', fontSize: '0.625rem', color: 'var(--admin-text-secondary)' }}>#{tag}</span>
                    ))}
                  </div>
                )}
                
                <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                  <span>{formatDate(post.updatedAt)}</span>
                  <span>{numberFormatter.format(post.views || 0)} vistas</span>
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <a 
                    href={`/blog/${post.slug}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                  >
                    <Icons.Eye />
                    <span>Ver</span>
                  </a>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    style={{ flex: 1 }}
                    onClick={() => openEditor(post.id)}
                  >
                    <Icons.Edit />
                    <span>Editar</span>
                  </button>
                  <button 
                    className="btn btn-danger btn-sm" 
                    onClick={() => handleDelete(post)}
                  >
                    <Icons.Trash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!fetching && !error && totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <Icons.ChevronLeft />
              <span>Anterior</span>
            </button>
            
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 5) {
                pageNum = i + 1
              } else if (currentPage <= 3) {
                pageNum = i + 1
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i
              } else {
                pageNum = currentPage - 2 + i
              }
              
              return (
                <button
                  key={pageNum}
                  className={`btn ${currentPage === pageNum ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ minWidth: '2.5rem', padding: '0.5rem' }}
                  onClick={() => setCurrentPage(pageNum)}
                >
                  {pageNum}
                </button>
              )
            })}
            
            <button
              className="btn btn-secondary"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <span>Siguiente</span>
              <Icons.ChevronRight />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
