import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { BlogPost } from '../../types/blog'
import { createBlogPost, updateBlogPost } from '../../services/blog'
import { buildEmbeddedMetaComment } from '../../utils/blogContent'
import useUpload from '../../hooks/useUpload'
import { sanitizeHtml } from '../../utils/sanitizeHtml'
import { slugify } from '../../utils/slug'
import { useToast } from '../../context/ToastContext'

type BlogEditorProps = {
  authorId: string
  initialPost?: BlogPost | null
  onCancel: () => void
  onSaved: (post: BlogPost) => void
}

type FormState = {
  title: string
  slug: string
  excerpt: string
  coverImageUrl: string | null
  htmlContent: string
  status: 'draft' | 'published'
  tags: string[]
  // SEO
  seoTitle: string
  seoDescription: string
  canonicalUrl: string
  ogImageUrl: string
  // JSON-LD (texto JSON)
  jsonLdText: string
  // Theme tokens
  themeHeroBg: string
  themeHeroText: string
  themeAccent: string
}

const DEFAULT_FORM: FormState = {
  title: '',
  slug: '',
  excerpt: '',
  coverImageUrl: null,
  htmlContent: '',
  status: 'draft',
  tags: [],
  seoTitle: '',
  seoDescription: '',
  canonicalUrl: '',
  ogImageUrl: '',
  jsonLdText: '',
  themeHeroBg: '#14212E',
  themeHeroText: '#ffffff',
  themeAccent: '#0c72ff',
}

export default function BlogEditor({ authorId, initialPost, onCancel, onSaved }: BlogEditorProps) {
  const isEditing = Boolean(initialPost)
  const { show: showToast } = useToast()
  const draftStorageKey = useMemo(() => `ciclomarket:blogDraft:${authorId}`, [authorId])
  const [form, setForm] = useState<FormState>(() => {
    if (!initialPost) return DEFAULT_FORM
    return {
      title: initialPost.title,
      slug: initialPost.slug,
      excerpt: initialPost.excerpt ?? '',
      coverImageUrl: initialPost.coverImageUrl ?? null,
      htmlContent: initialPost.htmlContent,
      status: initialPost.status,
      tags: initialPost.tags ?? [],
      seoTitle: '',
      seoDescription: '',
      canonicalUrl: '',
      ogImageUrl: '',
      jsonLdText: '',
      themeHeroBg: '#14212E',
      themeHeroText: '#ffffff',
      themeAccent: '#0c72ff',
    }
  })
  const [tagInput, setTagInput] = useState('')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { uploadFiles, uploading } = useUpload()
  const htmlTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const inlineImageInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!initialPost) {
      setSlugManuallyEdited(false)
    }
  }, [initialPost])

  useEffect(() => {
    if (isEditing) return
    try {
      const raw = window.localStorage.getItem(draftStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as { v?: number; form?: FormState; slugManuallyEdited?: boolean } | null
      if (!parsed || parsed.v !== 1 || !parsed.form) return
      const draft = parsed.form
      if (typeof draft.title !== 'string' || typeof draft.htmlContent !== 'string') return
      setForm(draft)
      setSlugManuallyEdited(Boolean(parsed.slugManuallyEdited))
      showToast('Borrador restaurado')
    } catch {
      // ignore storage/JSON errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStorageKey, isEditing])

  useEffect(() => {
    if (isEditing) return
    const timer = window.setTimeout(() => {
      try {
        const payload = { v: 1, form, slugManuallyEdited, savedAt: Date.now() }
        window.localStorage.setItem(draftStorageKey, JSON.stringify(payload))
      } catch {
        // ignore quota errors
      }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [draftStorageKey, form, isEditing, slugManuallyEdited])

  const previewHtml = useMemo(() => sanitizeHtml(form.htmlContent), [form.htmlContent])

  const handleChange = (field: keyof FormState, value: string | string[] | null) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleTitleChange = (value: string) => {
    handleChange('title', value)
    if (!slugManuallyEdited) {
      const generated = slugify(value)
      handleChange('slug', generated)
    }
  }

  const pushTag = (raw: string) => {
    const clean = slugify(raw).replace(/-/g, ' ').trim()
    if (!clean) return
    const normalized = clean.replace(/\s+/g, '-')
    setForm((prev) => {
      if (prev.tags.includes(normalized)) return prev
      return { ...prev, tags: [...prev.tags, normalized] }
    })
  }

  const removeTag = (tag: string) => {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }))
  }

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab') {
      event.preventDefault()
      const value = tagInput.trim()
      if (value) {
        pushTag(value)
        setTagInput('')
      }
    } else if (event.key === 'Backspace' && tagInput.length === 0 && form.tags.length > 0) {
      event.preventDefault()
      const last = form.tags[form.tags.length - 1]
      removeTag(last)
    }
  }

  const handleCoverUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    try {
      const urls = await uploadFiles(Array.from(files))
      if (urls.length > 0) {
        handleChange('coverImageUrl', urls[0])
        showToast('Imagen cargada correctamente')
      }
    } catch (err) {
      console.error('[blog] cover upload error', err)
      showToast('No se pudo subir la imagen. Intentá de nuevo.', { variant: 'error' })
    }
  }

  // Inserta un snippet HTML en el cursor del textarea de contenido
  const insertHtmlAtCursor = (snippet: string) => {
    setForm((prev) => {
      const textarea = htmlTextareaRef.current
      if (!textarea) {
        return { ...prev, htmlContent: prev.htmlContent + snippet }
      }
      const start = textarea.selectionStart ?? prev.htmlContent.length
      const end = textarea.selectionEnd ?? prev.htmlContent.length
      const next = prev.htmlContent.slice(0, start) + snippet + prev.htmlContent.slice(end)
      requestAnimationFrame(() => {
        const caret = start + snippet.length
        textarea.focus()
        textarea.setSelectionRange(caret, caret)
      })
      return { ...prev, htmlContent: next }
    })
  }

  // Upload de imagen y auto-inserción como <figure> en el contenido
  const handleInlineImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    try {
      const urls = await uploadFiles(Array.from(files))
      if (urls.length > 0) {
        const file = files[0]
        const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
        const snippet = `\n<figure class=\"blog-image\"><img src=\"${urls[0]}\" alt=\"${alt}\" loading=\"lazy\" /></figure>\n`
        insertHtmlAtCursor(snippet)
        showToast('Imagen insertada en el contenido')
      }
    } catch (err) {
      console.error('[blog] inline image upload error', err)
      showToast('No se pudo subir la imagen. Intentá de nuevo.', { variant: 'error' })
    } finally {
      if (inlineImageInputRef.current) {
        inlineImageInputRef.current.value = ''
      }
    }
  }

  const validate = (): string | null => {
    if (!form.title.trim()) return 'El título es obligatorio.'
    if (!form.slug.trim()) return 'El slug es obligatorio.'
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) {
      return 'El slug solo puede contener letras minúsculas, números y guiones.'
    }
    if (!form.htmlContent.trim()) return 'El contenido HTML no puede estar vacío.'
    // Validar JSON-LD si fue provisto
    if (form.jsonLdText.trim()) {
      try {
        const parsed = JSON.parse(form.jsonLdText)
        if (!parsed || (typeof parsed !== 'object' && !Array.isArray(parsed))) {
          return 'El JSON-LD debe ser un objeto o un array.'
        }
      } catch {
        return 'El JSON-LD no es JSON válido.'
      }
    }
    return null
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      showToast(validationError, { variant: 'error' })
      return
    }
    setError(null)
    setSaving(true)
    try {
      const sanitizedHtml = sanitizeHtml(form.htmlContent)
      // Componer comentario de metadatos incrustados para compatibilidad sin migración DB
      let prefix = ''
      const metaPayload = {
        seoTitle: form.seoTitle.trim() || null,
        seoDescription: form.seoDescription.trim() || null,
        canonicalUrl: form.canonicalUrl.trim() || null,
        ogImageUrl: (form.ogImageUrl.trim() || form.coverImageUrl || '') || null,
        jsonLd: (() => {
          if (!form.jsonLdText.trim()) return null
          try {
            const parsed = JSON.parse(form.jsonLdText)
            if (Array.isArray(parsed)) return parsed
            if (parsed && typeof parsed === 'object') return [parsed]
            return null
          } catch { return null }
        })(),
        theme: {
          heroBg: form.themeHeroBg,
          heroText: form.themeHeroText,
          accent: form.themeAccent,
        },
      }
      const metaComment = buildEmbeddedMetaComment(metaPayload)
      prefix = metaComment + '\n\n'
      const payload = {
        title: form.title.trim(),
        slug: form.slug.trim(),
        excerpt: form.excerpt.trim() || null,
        coverImageUrl: form.coverImageUrl,
        htmlContent: prefix + sanitizedHtml,
        status: form.status,
        tags: form.tags.map((tag) => tag.toLowerCase()),
      }
      let saved: BlogPost
      if (isEditing && initialPost) {
        saved = await updateBlogPost(initialPost.id, payload)
      } else {
        saved = await createBlogPost({
          ...payload,
          authorId,
        })
      }
      setSaving(false)
      showToast(isEditing ? 'Entrada actualizada' : 'Entrada creada')
      if (!isEditing) {
        try {
          window.localStorage.removeItem(draftStorageKey)
        } catch {
          // ignore
        }
      }
      onSaved(saved)
    } catch (err) {
      console.error('[blog] save error', err)
      setSaving(false)
      const message = err instanceof Error ? err.message : 'Error al guardar la entrada.'
      setError(message)
      showToast(message, { variant: 'error' })
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-gray-900">
            {isEditing ? 'Editar entrada' : 'Nueva entrada'}
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-400 hover:text-gray-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              className="rounded-full bg-[#14212e] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2d3a] disabled:cursor-not-allowed disabled:bg-[#14212e]/60"
            >
              {saving ? 'Guardando…' : isEditing ? 'Actualizar' : 'Publicar'}
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-700">Título</span>
            <input
              type="text"
              value={form.title}
              onChange={(event) => handleTitleChange(event.target.value)}
              placeholder="Ej. Las mejores rutas gravel en Patagonia"
              className="rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-700">
              Slug <span className="font-normal text-gray-400">(URL)</span>
            </span>
            <input
              type="text"
              value={form.slug}
              onChange={(event) => {
                setSlugManuallyEdited(true)
                handleChange('slug', slugify(event.target.value))
              }}
              placeholder="rutas-gravel-patagonia"
              className="rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-700">Extracto</span>
            <textarea
              value={form.excerpt}
              onChange={(event) => handleChange('excerpt', event.target.value)}
              rows={3}
              placeholder="Resumen breve que se mostrará en las tarjetas del blog."
              className="rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
            />
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-700">Tags</span>
            <div className="flex flex-wrap gap-2 rounded-xl border border-gray-300 px-3 py-2">
              {form.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-2 rounded-full bg-[#e6edf5] px-3 py-1 text-xs font-medium text-[#14212e]"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="text-[#1f2d3a] transition hover:text-[#14212e]"
                    aria-label={`Quitar tag ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Agregar tag y presionar Enter"
                className="min-w-[160px] flex-1 border-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_280px]">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-700">Imagen de portada</span>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => handleCoverUpload(event.target.files)}
                className="text-sm text-gray-600"
              />
              {form.coverImageUrl && (
                <button
                  type="button"
                  onClick={() => handleChange('coverImageUrl', null)}
                  className="text-xs font-medium text-red-500 transition hover:text-red-600"
                >
                  Eliminar
                </button>
              )}
            </div>
            {form.coverImageUrl && (
              <img
                src={form.coverImageUrl}
                alt="Portada"
                className="mt-2 h-40 w-full rounded-xl object-cover"
              />
            )}
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-700">Estado</span>
            <select
              value={form.status}
              onChange={(event) =>
                handleChange('status', event.target.value as 'draft' | 'published')
              }
              className="rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
            >
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-gray-700">
              Contenido HTML <span className="font-normal text-gray-400">(pegar desde ChatGPT)</span>
            </span>
            <div className="flex items-center gap-2">
              <input
                ref={inlineImageInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => void handleInlineImageUpload(event.target.files)}
              />
              <button
                type="button"
                onClick={() => inlineImageInputRef.current?.click()}
                disabled={uploading}
                className="rounded-full border border-[#1f2d3a] px-3 py-1.5 text-xs font-semibold text-[#14212e] transition hover:border-[#14212e] hover:text-[#0f1729] disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
              >
                Insertar imagen
              </button>
              <button
                type="button"
                onClick={() => insertHtmlAtCursor('\n<hr/>\n')}
                className="rounded-full border border-[#1f2d3a] px-3 py-1.5 text-xs font-semibold text-[#14212e] transition hover:border-[#14212e] hover:text-[#0f1729]"
              >
                Insertar separador
              </button>
            </div>
          </div>
          <textarea
            ref={htmlTextareaRef}
            value={form.htmlContent}
            onChange={(event) => handleChange('htmlContent', event.target.value)}
            rows={14}
            className="rounded-xl border border-gray-300 px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
            placeholder="<p>Hola ciclistas…</p>"
          />
        </label>

        {/* Pestañas simples: Contenido, SEO, JSON-LD, Preview */}
        <EditorTabs
          html={form.htmlContent}
          onHtmlChange={(v) => handleChange('htmlContent', v)}
          seo={{
            title: form.seoTitle,
            description: form.seoDescription,
            canonicalUrl: form.canonicalUrl,
            ogImageUrl: form.ogImageUrl,
          }}
          onSeoChange={(next) => {
            handleChange('seoTitle', next.title)
            handleChange('seoDescription', next.description)
            handleChange('canonicalUrl', next.canonicalUrl)
            handleChange('ogImageUrl', next.ogImageUrl)
          }}
          jsonLdText={form.jsonLdText}
          onJsonLdChange={(v) => handleChange('jsonLdText', v)}
          previewHtml={previewHtml}
          design={{ heroBg: form.themeHeroBg, heroText: form.themeHeroText, accent: form.themeAccent }}
          onDesignChange={(d) => { handleChange('themeHeroBg', d.heroBg); handleChange('themeHeroText', d.heroText); handleChange('themeAccent', d.accent) }}
          onInsertBlock={(snippet) => insertHtmlAtCursor(snippet)}
        />

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </form>
    </div>
  )
}

function EditorTabs(props: {
  html: string
  onHtmlChange: (v: string) => void
  seo: { title: string; description: string; canonicalUrl: string; ogImageUrl: string }
  onSeoChange: (v: { title: string; description: string; canonicalUrl: string; ogImageUrl: string }) => void
  jsonLdText: string
  onJsonLdChange: (v: string) => void
  previewHtml: string
  design: { heroBg: string; heroText: string; accent: string }
  onDesignChange: (d: { heroBg: string; heroText: string; accent: string }) => void
  onInsertBlock: (snippet: string) => void
}) {
  const [tab, setTab] = useState<'content' | 'seo' | 'design' | 'jsonld' | 'preview'>('content')
  const { html, onHtmlChange, seo, onSeoChange, jsonLdText, onJsonLdChange, previewHtml, design, onDesignChange, onInsertBlock } = props
  return (
    <div>
      <div className="mb-3 flex gap-2">
        {[
          { k: 'content', label: 'Contenido' },
          { k: 'seo', label: 'SEO' },
          { k: 'design', label: 'Diseño' },
          { k: 'jsonld', label: 'JSON-LD' },
          { k: 'preview', label: 'Preview' },
        ].map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k as any)}
            className={
              'rounded-full px-4 py-1.5 text-sm font-semibold ' +
              (tab === t.k
                ? 'bg-[#14212e] text-white'
                : 'border border-[#1f2d3a] text-[#14212e] hover:border-[#14212e]')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'content' && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-gray-700">Contenido HTML</span>
          <textarea
            value={html}
            onChange={(e) => onHtmlChange(e.target.value)}
            rows={14}
            className="rounded-xl border border-gray-300 px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
            placeholder="<p>Hola ciclistas…</p>"
          />
        </label>
      )}

      {tab === 'design' && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700">Hero BG</span>
              <input type="color" value={design.heroBg} onChange={(e) => onDesignChange({ ...design, heroBg: e.target.value })} />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700">Hero Text</span>
              <input type="color" value={design.heroText} onChange={(e) => onDesignChange({ ...design, heroText: e.target.value })} />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700">Accent</span>
              <input type="color" value={design.accent} onChange={(e) => onDesignChange({ ...design, accent: e.target.value })} />
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-900">Insertar bloques</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-full border border-[#1f2d3a] px-3 py-1.5 text-xs font-semibold text-[#14212e]" onClick={() => onInsertBlock(heroSnippet())}>Hero</button>
              <button type="button" className="rounded-full border border-[#1f2d3a] px-3 py-1.5 text-xs font-semibold text-[#14212e]" onClick={() => onInsertBlock(ctaSnippet())}>CTA</button>
              <button type="button" className="rounded-full border border-[#1f2d3a] px-3 py-1.5 text-xs font-semibold text-[#14212e]" onClick={() => onInsertBlock(faqSnippet())}>FAQ</button>
              <button type="button" className="rounded-full border border-[#1f2d3a] px-3 py-1.5 text-xs font-semibold text-[#14212e]" onClick={() => onInsertBlock(gallerySnippet())}>Galería</button>
              <button type="button" className="rounded-full border border-[#1f2d3a] px-3 py-1.5 text-xs font-semibold text-[#14212e]" onClick={() => onInsertBlock(tableSnippet())}>Tabla</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'seo' && (
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-700">Título SEO</span>
            <input
              type="text"
              value={seo.title}
              onChange={(e) => onSeoChange({ ...seo, title: e.target.value })}
              placeholder="Hasta 60 caracteres"
              className="rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
            />
            <span className="text-xs text-gray-500">Recomendado ≤ 60 caracteres.</span>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-700">Descripción SEO</span>
            <textarea
              value={seo.description}
              onChange={(e) => onSeoChange({ ...seo, description: e.target.value })}
              rows={3}
              placeholder="140–160 caracteres"
              className="rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
            />
            <span className="text-xs text-gray-500">Recomendado 140–160 caracteres.</span>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-700">Canonical URL</span>
            <input
              type="url"
              value={seo.canonicalUrl}
              onChange={(e) => onSeoChange({ ...seo, canonicalUrl: e.target.value })}
              placeholder="https://www.ejemplo.com/post"
              className="rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-700">OG Image URL</span>
            <input
              type="url"
              value={seo.ogImageUrl}
              onChange={(e) => onSeoChange({ ...seo, ogImageUrl: e.target.value })}
              placeholder="https://.../imagen.jpg"
              className="rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
            />
          </label>
        </div>
      )}

      {tab === 'jsonld' && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-gray-700">JSON-LD (pegá un objeto o array)</span>
          <textarea
            value={jsonLdText}
            onChange={(e) => onJsonLdChange(e.target.value)}
            rows={10}
            className="rounded-xl border border-gray-300 px-4 py-3 font-mono text-xs text-gray-900 shadow-sm transition focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
            placeholder='{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[...]}'
          />
        </label>
      )}

      {tab === 'preview' && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-6">
          {previewHtml ? (
            <article className="blog-content" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          ) : (
            <p className="text-sm text-gray-500">El contenido aparecerá aquí.</p>
          )}
        </div>
      )}
    </div>
  )
}

// Bloques seguros (sin estilos inline)
function heroSnippet() {
  return `\n<section class="hero">
  <h1>Título llamativo del artículo</h1>
  <p>Subtítulo inspirador que resume la idea central.</p>
</section>\n`
}
function ctaSnippet() {
  return `\n<section class="cta">
  <h3>¿Listo para pedalear mejor?</h3>
  <p>Explorá nuestras guías y equipamiento recomendado por el equipo.</p>
  <div class="cta-actions">
    <a class="btn btn-primary" href="/marketplace">Ver marketplace</a>
    <a class="btn btn-secondary" href="/ayuda">Ayuda</a>
  </div>
</section>\n`
}
function faqSnippet() {
  return `\n<section class="faq">
  <details>
    <summary>¿Cómo elijo la talla de mi bici?</summary>
    <div>Considerá tu altura y el tipo de cuadro. Probá varias opciones si podés.</div>
  </details>
  <details>
    <summary>¿Qué presión de neumáticos uso?</summary>
    <div>Depende del terreno y tu peso. Empezá por recomendaciones del fabricante.</div>
  </details>
</section>\n`
}
function gallerySnippet() {
  return `\n<section class="gallery grid-3">
  <figure class="blog-image"><img src="https://placehold.co/600x400" alt="Foto 1" loading="lazy" /></figure>
  <figure class="blog-image"><img src="https://placehold.co/600x400" alt="Foto 2" loading="lazy" /></figure>
  <figure class="blog-image"><img src="https://placehold.co/600x400" alt="Foto 3" loading="lazy" /></figure>
</section>\n`
}
function tableSnippet() {
  return `\n<div class="table-wrapper">
  <table class="price-table">
    <thead>
      <tr><th>Plan</th><th>Precio</th><th>Características</th></tr>
    </thead>
    <tbody>
      <tr><td>Básico</td><td>Gratis</td><td>Publicaciones limitadas</td></tr>
      <tr><td>Pro</td><td>$</td><td>Más visibilidad</td></tr>
    </tbody>
  </table>
</div>\n`
}
  const insertHtmlAtCursor = (snippet: string) => {
    setForm((prev) => {
      const textarea = htmlTextareaRef.current
      if (!textarea) {
        return { ...prev, htmlContent: prev.htmlContent + snippet }
      }
      const start = textarea.selectionStart ?? prev.htmlContent.length
      const end = textarea.selectionEnd ?? prev.htmlContent.length
      const next =
        prev.htmlContent.slice(0, start) + snippet + prev.htmlContent.slice(end)
      requestAnimationFrame(() => {
        const caret = start + snippet.length
        textarea.focus()
        textarea.setSelectionRange(caret, caret)
      })
      return { ...prev, htmlContent: next }
    })
  }

  const handleInlineImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    try {
      const urls = await uploadFiles(Array.from(files))
      if (urls.length > 0) {
        const file = files[0]
        const alt = file.name
          .replace(/\.[^.]+$/, '')
          .replace(/[-_]+/g, ' ')
          .trim()
        const snippet = `\n<figure class="blog-image"><img src="${urls[0]}" alt="${alt}" loading="lazy" /></figure>\n`
        insertHtmlAtCursor(snippet)
        showToast('Imagen insertada en el contenido')
      }
    } catch (err) {
      console.error('[blog] inline image upload error', err)
      showToast('No se pudo subir la imagen. Intentá de nuevo.', { variant: 'error' })
    } finally {
      if (inlineImageInputRef.current) {
        inlineImageInputRef.current.value = ''
      }
    }
  }
