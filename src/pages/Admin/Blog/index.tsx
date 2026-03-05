import { useEffect, useMemo, useState, useCallback } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import BlogEditor from '../../../components/blog/BlogEditor'
import type { BlogPost } from '../../../types/blog'
import { deleteBlogPost, listAllBlogPosts } from '../../../services/blog'
import { useAuth } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'
import { supabaseEnabled } from '../../../services/supabase'
import { 
  Plus, 
  Search, 
  Filter, 
  Eye, 
  Edit2, 
  Trash2, 
  Clock, 
  CheckCircle, 
  XCircle,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Calendar,
  BarChart3,
  RefreshCw,
  ExternalLink,
  FileText,
  LayoutGrid,
  List as ListIcon
} from 'lucide-react'

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit',
  minute: '2-digit',
})

function formatDate(value: string | null): string {
  if (!value) return '—'
  try {
    return dateFormatter.format(new Date(value))
  } catch {
    return value
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  try {
    const date = new Date(value)
    return `${dateFormatter.format(date)} · ${timeFormatter.format(date)}`
  } catch {
    return value
  }
}

type EditorState = 
  | { mode: 'create'; post: null } 
  | { mode: 'edit'; post: BlogPost } 
  | null

type FilterStatus = 'all' | 'published' | 'draft'
type SortField = 'updatedAt' | 'createdAt' | 'publishedAt' | 'views' | 'title'
type SortOrder = 'desc' | 'asc'
type ViewMode = 'table' | 'grid'

const POSTS_PER_PAGE = 10

export default function BlogAdminPage() {
  const { user, loading, isModerator } = useAuth()
  const { show: showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [editorState, setEditorState] = useState<EditorState>(null)
  
  // Filtros y búsqueda
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [sortField, setSortField] = useState<SortField>('updatedAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [showFilters, setShowFilters] = useState(false)
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1)
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    published: 0,
    drafts: 0,
    totalViews: 0,
  })

  const authorId = user?.id ?? ''

  const refreshPosts = async () => {
    if (!supabaseEnabled) {
      setPosts([])
      setFetching(false)
      return
    }
    try {
      setFetching(true)
      setError(null)
      const data = await listAllBlogPosts()
      setPosts(data)
      
      // Calcular stats
      const published = data.filter(p => p.status === 'published')
      setStats({
        total: data.length,
        published: published.length,
        drafts: data.length - published.length,
        totalViews: data.reduce((sum, p) => sum + (p.views || 0), 0),
      })
    } catch (err) {
      console.error('[blog admin] list error', err)
      const message =
        err instanceof Error ? err.message : 'No pudimos cargar las entradas del blog.'
      setError(message)
    } finally {
      setFetching(false)
    }
  }

  useEffect(() => {
    if (!loading && isModerator) {
      void refreshPosts()
    }
  }, [loading, isModerator])

  useEffect(() => {
    const wantsNew = searchParams.get('new') === '1'
    const editId = searchParams.get('edit')

    if (wantsNew) {
      setEditorState((prev) => {
        if (prev?.mode === 'create') return prev
        return { mode: 'create', post: null }
      })
      return
    }

    if (editId) {
      const match = posts.find((post) => post.id === editId) || null
      if (match) {
        setEditorState((prev) => {
          if (prev?.mode === 'edit' && prev.post.id === match.id) return prev
          return { mode: 'edit', post: match }
        })
      }
      return
    }

    setEditorState(null)
  }, [posts, searchParams])

  // Filtrar y ordenar posts
  const filteredPosts = useMemo(() => {
    let result = [...posts]
    
    // Filtro por búsqueda
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(post => 
        post.title.toLowerCase().includes(query) ||
        post.slug.toLowerCase().includes(query) ||
        post.excerpt?.toLowerCase().includes(query) ||
        post.tags.some(tag => tag.toLowerCase().includes(query))
      )
    }
    
    // Filtro por estado
    if (filterStatus !== 'all') {
      result = result.filter(post => post.status === filterStatus)
    }
    
    // Ordenamiento
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
        case 'updatedAt':
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
  }, [posts, searchQuery, filterStatus, sortField, sortOrder])

  // Paginación
  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE)
  const paginatedPosts = useMemo(() => {
    const start = (currentPage - 1) * POSTS_PER_PAGE
    return filteredPosts.slice(start, start + POSTS_PER_PAGE)
  }, [filteredPosts, currentPage])

  // Resetear página al cambiar filtros
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filterStatus, sortField, sortOrder])

  const handleDelete = async (post: BlogPost) => {
    const confirmed = window.confirm(
      `¿Seguro que querés eliminar "${post.title}"? Esta acción no se puede deshacer.`
    )
    if (!confirmed) return
    
    try {
      await deleteBlogPost(post.id)
      showToast('Entrada eliminada correctamente')
      void refreshPosts()
    } catch (err) {
      console.error('[blog admin] delete error', err)
      const message = err instanceof Error ? err.message : 'No pudimos eliminar la entrada.'
      showToast(message, { variant: 'error' })
    }
  }

  const handleEditorSaved = (_saved: BlogPost) => {
    setSearchParams({}, { replace: true })
    void refreshPosts()
  }

  const clearFilters = () => {
    setSearchQuery('')
    setFilterStatus('all')
    setSortField('updatedAt')
    setSortOrder('desc')
    setCurrentPage(1)
  }

  const hasActiveFilters = searchQuery || filterStatus !== 'all'

  if (!loading && !isModerator) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-white to-[#f6f8fb] pb-16">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="container flex flex-col gap-6 py-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#253a4d]">
              Panel de moderación
            </p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Blog</h1>
            <p className="text-sm text-gray-500">
              Gestioná las notas visibles para toda la comunidad de Ciclo Market.
            </p>
          </div>
          
          {!editorState && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSearchParams({ new: '1' })}
                className="flex items-center gap-2 rounded-full bg-[#14212e] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1f2d3a] disabled:cursor-not-allowed disabled:bg-[#14212e]/60"
                disabled={!supabaseEnabled || !authorId}
              >
                <Plus className="h-4 w-4" />
                Nueva entrada
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="container mt-8 space-y-6">
        {!supabaseEnabled && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-6 text-amber-700">
            Configurá Supabase para crear y editar entradas del blog.
          </div>
        )}

        {/* Stats cards */}
        {!editorState && !fetching && posts.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                  <p className="text-xs text-gray-500">Total entradas</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats.published}</p>
                  <p className="text-xs text-gray-500">Publicadas</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats.drafts}</p>
                  <p className="text-xs text-gray-500">Borradores</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
                  <BarChart3 className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.totalViews.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">Total vistas</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {editorState && authorId ? (
          <BlogEditor
            authorId={authorId}
            initialPost={editorState.mode === 'edit' ? editorState.post : undefined}
            onCancel={() => setSearchParams({}, { replace: true })}
            onSaved={handleEditorSaved}
          />
        ) : (
          <>
            {/* Filtros y búsqueda */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Búsqueda */}
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por título, slug, tags..."
                    className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Botón filtros */}
                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                    showFilters || hasActiveFilters
                      ? 'border-[#14212e] bg-[#14212e] text-white'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Filter className="h-4 w-4" />
                  Filtros
                  {hasActiveFilters && (
                    <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-xs">
                      ON
                    </span>
                  )}
                </button>

                {/* Refrescar */}
                <button
                  type="button"
                  onClick={() => refreshPosts()}
                  disabled={fetching}
                  className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
                </button>

                {/* Vista */}
                <div className="flex items-center rounded-xl border border-gray-300 p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`rounded-lg p-1.5 ${viewMode === 'table' ? 'bg-gray-100 text-[#14212e]' : 'text-gray-400'}`}
                    title="Vista lista"
                  >
                    <ListIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`rounded-lg p-1.5 ${viewMode === 'grid' ? 'bg-gray-100 text-[#14212e]' : 'text-gray-400'}`}
                    title="Vista grid"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Panel de filtros expandible */}
              {showFilters && (
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="grid gap-4 md:grid-cols-3">
                    {/* Filtro estado */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Estado</label>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
                      >
                        <option value="all">Todos</option>
                        <option value="published">Publicados</option>
                        <option value="draft">Borradores</option>
                      </select>
                    </div>

                    {/* Ordenar por */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Ordenar por</label>
                      <select
                        value={sortField}
                        onChange={(e) => setSortField(e.target.value as SortField)}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
                      >
                        <option value="updatedAt">Última actualización</option>
                        <option value="createdAt">Fecha de creación</option>
                        <option value="publishedAt">Fecha de publicación</option>
                        <option value="views">Cantidad de vistas</option>
                        <option value="title">Título</option>
                      </select>
                    </div>

                    {/* Dirección */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Dirección</label>
                      <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
                      >
                        <option value="desc">Descendente</option>
                        <option value="asc">Ascendente</option>
                      </select>
                    </div>
                  </div>

                  {hasActiveFilters && (
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="text-sm font-medium text-gray-500 hover:text-gray-700"
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Resultados count */}
              <div className="flex items-center justify-between text-sm text-gray-500">
                <p>
                  {filteredPosts.length} {filteredPosts.length === 1 ? 'entrada' : 'entradas'}
                  {hasActiveFilters && ' (filtradas)'}
                </p>
                {totalPages > 1 && (
                  <p>Página {currentPage} de {totalPages}</p>
                )}
              </div>
            </div>

            {/* Loading */}
            {fetching && (
              <div className="rounded-3xl border border-gray-200 bg-white/95 p-6 shadow-lg">
                <div className="flex flex-col gap-4">
                  {Array.from({ length: 5 }).map((_value, index) => (
                    <div key={`skeleton-${index}`} className="h-16 rounded-xl bg-gray-100/90 animate-pulse" />
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-3xl border border-red-200 bg-red-50/90 p-6 text-red-700">
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5" />
                  {error}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!fetching && !error && filteredPosts.length === 0 && (
              <div className="rounded-3xl border border-gray-200 bg-white/95 p-12 text-center shadow-lg">
                {hasActiveFilters ? (
                  <>
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                      <Search className="h-8 w-8 text-gray-400" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900">No se encontraron resultados</h2>
                    <p className="mt-2 text-sm text-gray-500">
                      Probá con otros filtros o términos de búsqueda
                    </p>
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="mt-4 rounded-full bg-[#14212e] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#1f2d3a]"
                    >
                      Limpiar filtros
                    </button>
                  </>
                ) : (
                  <>
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#e6edf5]">
                      <FileText className="h-8 w-8 text-[#14212e]" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900">Aún no hay contenido</h2>
                    <p className="mt-2 text-sm text-gray-500">
                      Creá la primera nota del blog para empezar a inspirar a la comunidad.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSearchParams({ new: '1' })}
                      className="mt-4 rounded-full bg-[#14212e] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#1f2d3a]"
                    >
                      Crear primera entrada
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Table view */}
            {!fetching && !error && filteredPosts.length > 0 && viewMode === 'table' && (
              <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white/95 shadow-xl">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-6 py-4">Entrada</th>
                      <th className="px-6 py-4">Estado</th>
                      <th className="px-6 py-4">Autor</th>
                      <th className="px-6 py-4">Fechas</th>
                      <th className="px-6 py-4 text-right">Vistas</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100/80 bg-white/60">
                    {paginatedPosts.map((post) => (
                      <tr key={post.id} className="transition hover:bg-[#14212e]/[0.02]">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {post.coverImageUrl ? (
                              <img 
                                src={post.coverImageUrl} 
                                alt="" 
                                className="h-12 w-12 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
                                <FileText className="h-5 w-5 text-gray-400" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-gray-900 max-w-[200px] sm:max-w-xs">
                                {post.title}
                              </div>
                              <p className="text-xs text-gray-500">/{post.slug}</p>
                              {post.tags.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {post.tags.slice(0, 3).map(tag => (
                                    <span key={tag} className="text-[10px] text-gray-400">
                                      #{tag}
                                    </span>
                                  ))}
                                  {post.tags.length > 3 && (
                                    <span className="text-[10px] text-gray-400">
                                      +{post.tags.length - 3}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                              post.status === 'published'
                                ? 'bg-green-50 text-green-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {post.status === 'published' ? (
                              <>
                                <CheckCircle className="h-3 w-3" />
                                Publicado
                              </>
                            ) : (
                              <>
                                <Clock className="h-3 w-3" />
                                Borrador
                              </>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            {post.author?.fullName || '—'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            {post.status === 'published' && post.publishedAt ? (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-gray-400" />
                                {formatDate(post.publishedAt)}
                              </span>
                            ) : (
                              <span className="text-gray-400">No publicado</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">
                            Editado: {formatDate(post.updatedAt)}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-medium text-gray-900">
                            {(post.views || 0).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-2">
                            <a
                              href={`/blog/${post.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                              title="Ver en el sitio"
                            >
                              <Eye className="h-4 w-4" />
                            </a>
                            <button
                              type="button"
                              onClick={() => setSearchParams({ edit: post.id })}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-[#14212e]"
                              title="Editar"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(post)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
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
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {paginatedPosts.map((post) => (
                  <div 
                    key={post.id} 
                    className="group rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md"
                  >
                    {/* Cover */}
                    <div className="relative mb-4 aspect-video overflow-hidden rounded-xl bg-gray-100">
                      {post.coverImageUrl ? (
                        <img 
                          src={post.coverImageUrl} 
                          alt="" 
                          className="h-full w-full object-cover transition group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <FileText className="h-12 w-12 text-gray-300" />
                        </div>
                      )}
                      <div className="absolute left-2 top-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            post.status === 'published'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {post.status === 'published' ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                          {post.status === 'published' ? 'Publicado' : 'Borrador'}
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <h3 className="mb-1 line-clamp-2 font-semibold text-gray-900">
                      {post.title}
                    </h3>
                    <p className="mb-3 text-xs text-gray-500">/{post.slug}</p>

                    {post.excerpt && (
                      <p className="mb-3 line-clamp-2 text-sm text-gray-600">
                        {post.excerpt}
                      </p>
                    )}

                    {post.tags.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-1">
                        {post.tags.slice(0, 4).map(tag => (
                          <span 
                            key={tag} 
                            className="rounded-full bg-[#e6edf5] px-2 py-0.5 text-[10px] font-medium text-[#14212e]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Meta */}
                    <div className="mb-3 flex items-center justify-between text-xs text-gray-400">
                      <span>{formatDate(post.updatedAt)}</span>
                      <span>{(post.views || 0).toLocaleString()} vistas</span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <a
                        href={`/blog/${post.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                      >
                        <Eye className="h-3 w-3" />
                        Ver
                      </a>
                      <button
                        type="button"
                        onClick={() => setSearchParams({ edit: post.id })}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                      >
                        <Edit2 className="h-3 w-3" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(post)}
                        className="flex items-center justify-center rounded-lg border border-red-200 px-3 py-2 text-red-600 transition hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Paginación */}
            {!fetching && !error && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </button>
                
                <div className="flex items-center gap-1">
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
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`h-9 w-9 rounded-lg text-sm font-medium transition ${
                          currentPage === pageNum
                            ? 'bg-[#14212e] text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>
                
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
