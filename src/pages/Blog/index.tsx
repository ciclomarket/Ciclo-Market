import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BLOG_PAGE_SIZE, fetchPublishedBlogPosts } from '../../services/blog'
import type { BlogPost } from '../../types/blog'
import { supabaseEnabled } from '../../services/supabase'
import SeoHead from '../../components/SeoHead'
import { resolveSiteOrigin } from '../../utils/seo'

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function formatDate(value: string | null): string {
  if (!value) return ''
  try {
    return dateFormatter.format(new Date(value))
  } catch {
    return value
  }
}

function PostCard({ post }: { post: BlogPost }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-gray-200/70 bg-white/95 shadow-lg transition hover:-translate-y-1 hover:shadow-xl">
      {post.coverImageUrl ? (
        <div className="relative aspect-[16/9] overflow-hidden">
          <img
            src={post.coverImageUrl}
            alt={post.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
          {post.tags.length > 0 && (
            <div className="absolute left-4 top-4 flex flex-wrap gap-2">
              {post.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#14212e] shadow"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex aspect-[16/9] items-center justify-center bg-[#e6edf5] text-[#14212e]">
          <span className="text-sm font-semibold uppercase tracking-[0.2em]">Ciclo Blog</span>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-gray-900 transition group-hover:text-[#14212e]">
            {post.title}
          </h3>
          <p className="text-sm text-gray-500">
            {post.author?.fullName ? `${post.author.fullName} · ` : ''}
            {formatDate(post.publishedAt)}
          </p>
        </div>
        <p className="line-clamp-3 text-sm text-gray-600">{post.excerpt}</p>
        <div className="mt-auto flex items-center justify-between pt-4">
          <div className="flex flex-wrap gap-2">
            {post.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[#e6edf5] px-3 py-1 text-xs font-semibold text-[#14212e]"
              >
                #{tag}
              </span>
            ))}
          </div>
          <Link
            to={`/blog/${post.slug}`}
            className="rounded-full bg-[#14212e] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-[#1f2d3a]"
          >
            Leer más
          </Link>
        </div>
      </div>
    </article>
  )
}

export default function BlogListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialPage = Number.parseInt(searchParams.get('page') ?? '1', 10)
  const [page, setPage] = useState(Number.isFinite(initialPage) && initialPage > 0 ? initialPage : 1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [total, setTotal] = useState(0)
  const siteOrigin = resolveSiteOrigin()

  useEffect(() => {
    let isMounted = true
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchPublishedBlogPosts(page, BLOG_PAGE_SIZE)
        if (!isMounted) return
        setPosts(response.posts)
        setTotal(response.total)
      } catch (err) {
        if (!isMounted) return
        console.error('[blog] list page error', err)
        const message = err instanceof Error ? err.message : 'No pudimos cargar los artículos.'
        setError(message)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    if (supabaseEnabled) {
      void load()
    } else {
      setLoading(false)
      setPosts([])
      setTotal(0)
    }
    return () => {
      isMounted = false
    }
  }, [page])

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (page === 1) {
        next.delete('page')
      } else {
        next.set('page', String(page))
      }
      return next
    })
  }, [page, setSearchParams])

  const totalPages = useMemo(() => {
    return total > 0 ? Math.ceil(total / BLOG_PAGE_SIZE) : 1
  }, [total])

  const handlePageChange = (direction: 'prev' | 'next') => {
    setPage((prev) => {
      if (direction === 'prev') {
        return Math.max(1, prev - 1)
      }
      return totalPages ? Math.min(totalPages, prev + 1) : prev + 1
    })
  }

  return (
    <>
      <SeoHead
        title="Blog de Ciclo Market"
        description="Notas, guías y entrevistas para ciclistas en Argentina: tecnología, rutas gravel, mantenimiento y tendencias seleccionadas por el equipo de Ciclo Market."
        canonicalPath="/blog"
        type="website"
        keywords={[
          'blog ciclomarket',
          'notas ciclismo argentina',
          'consejos para ciclistas',
          'gravel argentina',
          'equipamiento de ciclismo',
        ]}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Blog',
          name: 'Blog de Ciclo Market',
          url: `${siteOrigin}/blog`,
          description:
            'Contenido editorial de Ciclo Market sobre bicicletas, entrenamientos, rutas y novedades de la comunidad ciclista en Argentina.',
        }}
      />
      <div className="min-h-screen bg-gradient-to-b from-white via-white to-[#f6f8fb] pb-16">
      <header className="relative border-b border-[#1d2a36] bg-gradient-to-br from-[#0f1729] via-[#14212e] to-[#050c18] py-24 text-white">
        <div className="container">
          <div className="max-w-3xl space-y-6">
            <p className="inline-flex items-center rounded-full bg-white/20 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/80">
              Blog
            </p>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Historias, guías y tendencias para ciclistas en Argentina
            </h1>
            <p className="text-lg text-white/70">
              Explorá novedades de la comunidad, rutas recomendadas, tecnología y tips para sacar el
              máximo de tu bici.
            </p>
          </div>
        </div>
      </header>

      <main className="container mt-12 space-y-12">
        {!supabaseEnabled && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-6 text-amber-700">
            El blog requiere configurar Supabase (variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).
          </div>
        )}

        {loading && (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: BLOG_PAGE_SIZE }).map((_value, index) => (
              <div
                key={`skeleton-${index}`}
                className="animate-pulse rounded-3xl border border-gray-200/70 bg-white/80 p-6"
              >
                <div className="mb-4 h-40 rounded-2xl bg-gray-200/80" />
                <div className="mb-2 h-6 rounded bg-gray-200/80" />
                <div className="mb-2 h-4 rounded bg-gray-200/70" />
                <div className="h-4 rounded bg-gray-200/70" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-3xl border border-red-200 bg-red-50/90 p-6 text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="rounded-3xl border border-gray-200 bg-white/90 p-12 text-center">
            <h2 className="text-2xl font-semibold text-gray-900">Pronto vas a encontrar artículos</h2>
            <p className="mt-2 text-sm text-gray-500">
              Aún no publicamos notas, pero el equipo de Ciclo Market ya está trabajando en contenido
              nuevo para vos.
            </p>
          </div>
        )}

        {!loading && posts.length > 0 && (
          <>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => handlePageChange('prev')}
                  disabled={page === 1}
                  className="rounded-full border border-[#1f2d3a] px-4 py-2 text-sm font-semibold text-[#14212e] transition hover:border-[#14212e] hover:text-[#0f1729] disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
                >
                  ← Anteriores
                </button>
                <span className="text-sm font-medium text-gray-500">
                  Página {page} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => handlePageChange('next')}
                  disabled={page >= totalPages}
                  className="rounded-full border border-[#1f2d3a] px-4 py-2 text-sm font-semibold text-[#14212e] transition hover:border-[#14212e] hover:text-[#0f1729] disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
                >
                  Siguientes →
                </button>
              </div>
            )}
          </>
        )}
      </main>
      </div>
    </>
  )
}
