import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  fetchBlogPostBySlug,
  fetchRelatedBlogPosts,
  incrementBlogPostViews,
} from '../../services/blog'
import type { BlogPost } from '../../types/blog'
import { sanitizeHtml } from '../../utils/sanitizeHtml'
import { parseBlogHtmlMeta } from '../../utils/blogContent'
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

function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function BlogPostDetail() {
  const { slug } = useParams<{ slug: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [post, setPost] = useState<BlogPost | null>(null)
  const [related, setRelated] = useState<BlogPost[]>([])
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let isMounted = true
    async function load() {
      if (!slug) return
      if (!supabaseEnabled) {
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        setError(null)
        const fetched = await fetchBlogPostBySlug(slug)
        if (!isMounted) return
        if (!fetched || fetched.status !== 'published') {
          setNotFound(true)
          return
        }
        setPost(fetched)
        void incrementBlogPostViews(slug).catch((err) =>
          console.warn('[blog] increment views error', err),
        )
        if (fetched.tags.length > 0) {
          const relatedPosts = await fetchRelatedBlogPosts(fetched.tags, fetched.slug, 3)
          if (isMounted) setRelated(relatedPosts)
        } else {
          setRelated([])
        }
      } catch (err) {
        if (!isMounted) return
        console.error('[blog] detail error', err)
        const message = err instanceof Error ? err.message : 'No pudimos cargar el artículo.'
        setError(message)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    void load()
    return () => {
      isMounted = false
    }
  }, [slug])

  const { contentHtml, meta: embeddedMeta, jsonLdFromScripts } = useMemo(() => {
    const parsed = parseBlogHtmlMeta(post?.htmlContent ?? '')
    return parsed
  }, [post?.htmlContent])

  const sanitizedContent = useMemo(() => sanitizeHtml(contentHtml), [contentHtml])

  const siteOrigin = resolveSiteOrigin()
  const plainContent = useMemo(
    () => (post ? (post.excerpt?.trim() || htmlToPlainText(post.htmlContent)) : ''),
    [post],
  )
  const fallbackDescription =
    'Leé historias, guías y entrevistas de la comunidad ciclista argentina en el blog de Ciclo Market.'
  const metaDescription = useMemo(() => {
    const source = plainContent || fallbackDescription
    if (source.length <= 300) return source
    return `${source.slice(0, 297).trimEnd()}…`
  }, [plainContent])
  const keywords = useMemo(() => {
    if (!post) return undefined
    const candidates = [post.title, ...(post.tags ?? [])]
    const unique = Array.from(new Set(candidates.map((value) => value?.trim()).filter(Boolean)))
    return unique.length ? unique : undefined
  }, [post])
  const seoImage = post?.coverImageUrl ?? undefined
  const canonicalPath = post ? `/blog/${post.slug}` : '/blog'
  const articleJsonLd = useMemo(() => {
    if (!post) return null
    const publishDate = post.publishedAt ?? post.createdAt
    const modifyDate = post.updatedAt ?? publishDate
    return {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: metaDescription,
      image: seoImage ? [seoImage] : undefined,
      datePublished: publishDate,
      dateModified: modifyDate,
      keywords: keywords?.join(', '),
      articleSection: post.tags ?? [],
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': `${siteOrigin}/blog/${post.slug}`,
      },
      url: `${siteOrigin}/blog/${post.slug}`,
      author: post.author?.fullName
        ? {
            '@type': 'Person',
            name: post.author.fullName,
          }
        : undefined,
      publisher: {
        '@type': 'Organization',
        name: 'Ciclo Market',
        url: siteOrigin,
        logo: {
          '@type': 'ImageObject',
          url: `${siteOrigin}/logo-azul.png`,
        },
      },
    }
  }, [post, metaDescription, seoImage, keywords, siteOrigin])

  // Combinar JSON‑LD embebido/extraído con el generado por defecto
  const jsonLdPayloads = useMemo(() => {
    const list: Array<Record<string, unknown>> = []
    if (Array.isArray(embeddedMeta.jsonLd)) list.push(...embeddedMeta.jsonLd)
    if (jsonLdFromScripts.length) list.push(...jsonLdFromScripts)
    if (articleJsonLd) list.push(articleJsonLd as any)
    return list
  }, [embeddedMeta.jsonLd, jsonLdFromScripts, articleJsonLd])

  if (!slug) {
    return <Navigate to="/blog" replace />
  }

  if (notFound) {
    return (
      <>
        <SeoHead
          title="Artículo no encontrado"
          description="El contenido que buscás ya no está disponible en el blog de Ciclo Market."
          canonicalPath="/blog"
          noIndex
        />
        <div className="flex min-h-[70vh] items-center justify-center bg-gradient-to-b from-white via-white to-[#f6f8fb]">
          <div className="rounded-3xl border border-gray-200 bg-white/95 px-10 py-16 text-center shadow-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#253a4d]">
              404 · Artículo no encontrado
            </p>
            <h1 className="mt-4 text-3xl font-bold text-gray-900">Ups, esta nota ya no existe.</h1>
            <p className="mt-2 text-sm text-gray-500">
              Revisa la URL o volvé al listado para explorar más contenido.
            </p>
            <Link
              to="/blog"
              className="mt-6 inline-flex items-center rounded-full bg-[#14212e] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#1f2d3a]"
            >
              Volver al blog
            </Link>
          </div>
        </div>
      </>
    )
  }

  const themeVars = {
    ['--hero-bg' as any]: embeddedMeta.theme?.heroBg || '#14212E',
    ['--hero-text' as any]: embeddedMeta.theme?.heroText || '#ffffff',
    ['--accent' as any]: embeddedMeta.theme?.accent || '#0c72ff',
    ['--surface-bg' as any]: embeddedMeta.theme?.surfaceBg || '#ffffff',
  } as React.CSSProperties

  return (
    <>
      <SeoHead
        title={embeddedMeta.seoTitle || (post ? post.title : 'Artículo · Blog de Ciclo Market')}
        description={embeddedMeta.seoDescription || metaDescription}
        canonicalPath={embeddedMeta.canonicalUrl || canonicalPath}
        type={post ? 'article' : 'website'}
        image={embeddedMeta.ogImageUrl || seoImage}
        keywords={keywords}
        jsonLd={jsonLdPayloads}
      />
      <div className="min-h-screen bg-gradient-to-b from-white via-white to-[#f6f8fb] pb-16" style={themeVars}>
      <header className="blog-hero py-20 text-white">
        <div className="container space-y-3">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 transition hover:text-white"
          >
            ← Volver al listado
          </Link>
          {loading ? (
            <div className="space-y-4">
              <div className="h-10 w-3/4 rounded bg-white/20" />
              <div className="h-4 w-1/2 rounded bg-white/20" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-white/30 bg-white/15 p-6 text-white/90">
              {error}
            </div>
          ) : post ? (
            <div className="space-y-4">
              <h1 className="blog-hero-title text-4xl font-bold tracking-tight sm:text-5xl">{post.title}</h1>
              <p className="text-sm text-white/80">
                {post.author?.fullName ? `${post.author.fullName} · ` : ''}
                {formatDate(post.publishedAt)}
              </p>
            </div>
          ) : null}
        </div>
      </header>

      <main className="container mt-10 space-y-12">
        {post?.coverImageUrl && (
          <div className="overflow-hidden rounded-3xl border border-gray-200/80 shadow-xl">
            <img
              src={post.coverImageUrl}
              alt={post.title}
              className="h-full w-full max-h-[520px] object-cover"
            />
          </div>
        )}

        {loading && (
          <div className="rounded-3xl border border-gray-200 bg-white/90 p-10 shadow-lg">
            <div className="flex flex-col gap-4">
              {Array.from({ length: 8 }).map((_value, index) => (
                <div key={`line-${index}`} className="h-4 rounded bg-gray-200/80" />
              ))}
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-3xl border border-red-200 bg-red-50/90 p-6 text-red-700 shadow">
            {error}
          </div>
        )}

        {!loading && post && (
          <article className="rounded-3xl border border-gray-200 bg-white/95 p-6 shadow-xl sm:p-10">
            <div
              className="blog-content"
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />
            {post.tags.length > 0 && (
              <div className="mt-10 flex flex-wrap gap-3">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[#e6edf5] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#14212e]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </article>
        )}

        {!loading && related.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-gray-900">Artículos relacionados</h2>
              <Link
                to="/blog"
                className="text-sm font-semibold text-[#14212e] transition hover:text-[#0f1729]"
              >
                Ver más →
              </Link>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {related.map((item) => (
                <Link
                  key={item.id}
                  to={`/blog/${item.slug}`}
                  className="group rounded-3xl border border-gray-200 bg-white/90 p-6 shadow transition hover:-translate-y-1 hover:border-[#14212e] hover:shadow-lg"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#253a4d]">
                    #{item.tags[0] ?? 'Ciclismo'}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-gray-900 transition group-hover:text-[#14212e]">
                    {item.title}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-sm text-gray-600">{item.excerpt}</p>
                  <p className="mt-4 text-xs font-medium text-gray-400">
                    {formatDate(item.publishedAt)}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      </div>
    </>
  )
}
