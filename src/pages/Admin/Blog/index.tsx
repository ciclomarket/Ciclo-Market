import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import BlogEditor from '../../../components/blog/BlogEditor'
import type { BlogPost } from '../../../types/blog'
import { deleteBlogPost, listAllBlogPosts } from '../../../services/blog'
import { useAuth } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'
import { supabaseEnabled } from '../../../services/supabase'

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

type EditorState = { mode: 'create'; post: null } | { mode: 'edit'; post: BlogPost } | null

export default function BlogAdminPage() {
  const { user, loading, isModerator } = useAuth()
  const { show: showToast } = useToast()
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [editorState, setEditorState] = useState<EditorState>(null)

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

  const handleDelete = async (post: BlogPost) => {
    const confirmed = window.confirm(
      `¿Seguro que querés eliminar “${post.title}”? Esta acción no se puede deshacer.`,
    )
    if (!confirmed) return
    try {
      await deleteBlogPost(post.id)
      showToast('Entrada eliminada')
      void refreshPosts()
    } catch (err) {
      console.error('[blog admin] delete error', err)
      const message = err instanceof Error ? err.message : 'No pudimos eliminar la entrada.'
      showToast(message, { variant: 'error' })
    }
  }

  const handleEditorSaved = (_saved: BlogPost) => {
    setEditorState(null)
    void refreshPosts()
  }

  const sortedPosts = useMemo(() => {
    return [...posts].sort((a, b) => {
      const dateA = a.publishedAt ?? a.updatedAt
      const dateB = b.publishedAt ?? b.updatedAt
      return dateB.localeCompare(dateA)
    })
  }, [posts])

  if (!loading && !isModerator) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-white to-[#f6f8fb] pb-16">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="container flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#253a4d]">
              Panel de moderación
            </p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Blog</h1>
            <p className="text-sm text-gray-500">
              Gestioná las notas visibles para toda la comunidad de Ciclo Market.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditorState({ mode: 'create', post: null })}
              className="rounded-full bg-[#14212e] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1f2d3a] disabled:cursor-not-allowed disabled:bg-[#14212e]/60"
              disabled={!supabaseEnabled || !authorId}
            >
              + Nueva entrada
            </button>
          </div>
        </div>
      </header>

      <main className="container mt-10 space-y-8">
        {!supabaseEnabled && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-6 text-amber-700">
            Configurá Supabase para crear y editar entradas del blog.
          </div>
        )}

        {editorState && authorId ? (
          <BlogEditor
            authorId={authorId}
            initialPost={editorState.mode === 'edit' ? editorState.post : undefined}
            onCancel={() => setEditorState(null)}
            onSaved={handleEditorSaved}
          />
        ) : null}

        {!editorState && !fetching && sortedPosts.length === 0 && (
          <div className="rounded-3xl border border-gray-200 bg-white/95 p-10 text-center shadow-lg">
            <h2 className="text-2xl font-semibold text-gray-900">Aún no hay contenido publicado</h2>
            <p className="mt-2 text-sm text-gray-500">
              Creá la primera nota del blog para empezar a inspirar a la comunidad.
            </p>
          </div>
        )}

        {!editorState && fetching && (
          <div className="rounded-3xl border border-gray-200 bg-white/95 p-6 shadow-lg">
            <div className="flex flex-col gap-4">
              {Array.from({ length: 5 }).map((_value, index) => (
                <div key={`skeleton-${index}`} className="h-12 rounded-xl bg-gray-100/90" />
              ))}
            </div>
          </div>
        )}

        {!editorState && !fetching && sortedPosts.length > 0 && (
          <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white/95 shadow-xl">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-6 py-3">Título</th>
                  <th className="px-6 py-3">Estado</th>
                  <th className="px-6 py-3">Publicación</th>
                  <th className="px-6 py-3">Vistas</th>
                  <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/80 bg-white/60">
                {sortedPosts.map((post) => (
                  <tr key={post.id} className="transition hover:bg-[#14212e]/5">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">{post.title}</div>
                      <p className="text-xs text-gray-500">/{post.slug}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={
                          'inline-flex rounded-full px-3 py-1 text-xs font-semibold ' +
                          (post.status === 'published'
                            ? 'bg-[#e6edf5] text-[#14212e]'
                            : 'bg-gray-200 text-gray-600')
                        }
                      >
                        {post.status === 'published' ? 'Publicado' : 'Borrador'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      <div className="font-medium text-gray-800">
                        {formatDate(post.publishedAt ?? post.updatedAt)}
                      </div>
                      <p className="text-xs text-gray-400">
                        Creado: {formatDate(post.createdAt)} · Actualizado:{' '}
                        {formatDate(post.updatedAt)}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{post.views ?? 0}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditorState({ mode: 'edit', post })}
                          className="rounded-full border border-[#1f2d3a] px-4 py-1.5 text-xs font-semibold text-[#14212e] transition hover:border-[#14212e] hover:text-[#0f1729]"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(post)}
                          className="rounded-full border border-red-200 px-4 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:text-red-700"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && (
          <div className="rounded-3xl border border-red-200 bg-red-50/90 p-6 text-red-700">{error}</div>
        )}
      </main>
    </div>
  )
}
