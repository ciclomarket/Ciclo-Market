import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { BlogPost } from '../../types/blog'
import { createBlogPost, updateBlogPost } from '../../services/blog'
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
}

const DEFAULT_FORM: FormState = {
  title: '',
  slug: '',
  excerpt: '',
  coverImageUrl: null,
  htmlContent: '',
  status: 'draft',
  tags: [],
}

export default function BlogEditor({ authorId, initialPost, onCancel, onSaved }: BlogEditorProps) {
  const isEditing = Boolean(initialPost)
  const { show: showToast } = useToast()
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

  const validate = (): string | null => {
    if (!form.title.trim()) return 'El título es obligatorio.'
    if (!form.slug.trim()) return 'El slug es obligatorio.'
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) {
      return 'El slug solo puede contener letras minúsculas, números y guiones.'
    }
    if (!form.htmlContent.trim()) return 'El contenido HTML no puede estar vacío.'
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
      const payload = {
        title: form.title.trim(),
        slug: form.slug.trim(),
        excerpt: form.excerpt.trim() || null,
        coverImageUrl: form.coverImageUrl,
        htmlContent: sanitizedHtml,
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

        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Preview
          </h3>
          <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-6">
            {previewHtml ? (
              <article
                className="blog-content"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <p className="text-sm text-gray-500">El contenido aparecerá aquí.</p>
            )}
          </div>
        </div>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </form>
    </div>
  )
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
