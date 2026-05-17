import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { BlogPost } from '../../types/blog'
import { createBlogPost, updateBlogPost } from '../../services/blog'
import { buildEmbeddedMetaComment } from '../../utils/blogContent'
import useUpload from '../../hooks/useUpload'
import { sanitizeHtml } from '../../utils/sanitizeHtml'
import { slugify } from '../../utils/slug'
import { useToast } from '../../context/ToastContext'
import TipTapEditor from './TipTapEditor'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  Image as ImageIcon,
  Pencil,
  RotateCcw,
  Save,
  X,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

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
  seoTitle: string
  seoDescription: string
  canonicalUrl: string
  ogImageUrl: string
  jsonLdText: string
  themeHeroBg: string
  themeHeroText: string
  themeAccent: string
}

type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const DEFAULT_FORM: FormState = {
  title: '',
  slug: '',
  excerpt: '',
  coverImageUrl: null,
  htmlContent: '<p></p>',
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

// ─── Accordion helper ─────────────────────────────────────────────────────────

function AccordionSection({
  title,
  open,
  onToggle,
  children,
  badge,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
  badge?: string
}) {
  return (
    <div className="border-t border-gray-100 pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between py-1 text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        <span className="flex items-center gap-2">
          {title}
          {badge && (
            <span className="rounded-full bg-[#e6edf5] px-2 py-0.5 text-xs text-[#14212e]">
              {badge}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  )
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, missing }: { score: number; missing: string[] }) {
  const barColor =
    score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#94a3b8'
  const textColor =
    score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-500' : 'text-gray-400'
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">Listo para publicar</span>
        <span className={`text-xs font-bold ${textColor}`}>{score}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: barColor }}
        />
      </div>
      {missing.length > 0 && (
        <p className="text-[11px] leading-relaxed text-gray-400">
          Falta:{' '}
          {missing.slice(0, 3).join(', ')}
          {missing.length > 3 ? ` +${missing.length - 3}` : ''}
        </p>
      )}
    </div>
  )
}

// ─── Counter badge ────────────────────────────────────────────────────────────

function Counter({
  count,
  max,
  thresholds = [0.83, 1],
}: {
  count: number
  max: number
  thresholds?: [number, number]
}) {
  const ratio = count / max
  const cls =
    ratio > thresholds[1]
      ? 'text-red-500'
      : ratio > thresholds[0]
      ? 'text-amber-500'
      : 'text-emerald-600'
  return (
    <span className={`text-xs font-medium ${cls}`}>
      {count}/{max}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BlogEditor({ authorId, initialPost, onCancel, onSaved }: BlogEditorProps) {
  const isEditing = Boolean(initialPost)
  const { show: showToast } = useToast()
  const draftStorageKey = useMemo(() => `ciclomarket:blogDraft:${authorId}`, [authorId])
  const draftRestoredKey = useMemo(() => `ciclomarket:blogDraftRestored:${authorId}`, [authorId])

  // ── Form state ──────────────────────────────────────────────────────────────

  const [form, setForm] = useState<FormState>(() => {
    if (!initialPost) return DEFAULT_FORM
    return {
      title: initialPost.title,
      slug: initialPost.slug,
      excerpt: initialPost.excerpt ?? '',
      coverImageUrl: initialPost.coverImageUrl ?? null,
      htmlContent: initialPost.htmlContent || '<p></p>',
      status: initialPost.status,
      tags: initialPost.tags ?? [],
      seoTitle: initialPost.seoTitle ?? '',
      seoDescription: initialPost.seoDescription ?? '',
      canonicalUrl: initialPost.canonicalUrl ?? '',
      ogImageUrl: initialPost.ogImageUrl ?? '',
      jsonLdText: initialPost.jsonLd ? JSON.stringify(initialPost.jsonLd, null, 2) : '',
      themeHeroBg: initialPost.theme?.heroBg ?? '#14212E',
      themeHeroText: initialPost.theme?.heroText ?? '#ffffff',
      themeAccent: initialPost.theme?.accent ?? '#0c72ff',
    }
  })

  const [tagInput, setTagInput] = useState('')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(isEditing)
  const [slugEditing, setSlugEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Accordions — closed by default
  const [excerptOpen, setExcerptOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const { uploadFiles, uploading } = useUpload()
  const coverInputRef = useRef<HTMLInputElement>(null)
  const slugInputRef = useRef<HTMLInputElement>(null)

  // ── Restore localStorage draft ──────────────────────────────────────────────

  useEffect(() => {
    if (isEditing) return
    try {
      const raw = window.localStorage.getItem(draftStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        v?: number; form?: FormState; slugManuallyEdited?: boolean; savedAt?: string
      } | null
      if (!parsed || parsed.v !== 1 || !parsed.form) return
      if (typeof parsed.form.title !== 'string') return
      if (parsed.savedAt) {
        const days = (Date.now() - new Date(parsed.savedAt).getTime()) / 86400000
        if (days > 7) { window.localStorage.removeItem(draftStorageKey); return }
      }
      setForm(parsed.form)
      setSlugManuallyEdited(Boolean(parsed.slugManuallyEdited))
      setHasUnsavedChanges(true)
      try {
        const last = window.sessionStorage.getItem(draftRestoredKey)
        if (last !== raw) {
          showToast(`Borrador restaurado (${new Date(parsed.savedAt || Date.now()).toLocaleTimeString()})`)
          window.sessionStorage.setItem(draftRestoredKey, raw)
        }
      } catch { showToast('Borrador restaurado') }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStorageKey, draftRestoredKey, isEditing])

  // ── Autosave to localStorage ────────────────────────────────────────────────

  useEffect(() => {
    if (isEditing) return
    const timer = window.setTimeout(() => {
      if (!hasUnsavedChanges) return
      try {
        window.localStorage.setItem(
          draftStorageKey,
          JSON.stringify({ v: 1, form, slugManuallyEdited, savedAt: new Date().toISOString() }),
        )
        setAutosaveStatus('saved')
        setLastSaved(new Date())
        window.setTimeout(() => setAutosaveStatus(p => p === 'saved' ? 'idle' : p), 2000)
      } catch { setAutosaveStatus('error') }
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [draftStorageKey, form, isEditing, slugManuallyEdited, hasUnsavedChanges])

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const markUnsaved = useCallback(() => {
    setHasUnsavedChanges(true)
    setAutosaveStatus(p => p === 'idle' ? 'saving' : p)
  }, [])

  const handleChange = (field: keyof FormState, value: string | string[] | null) => {
    setForm(prev => ({ ...prev, [field]: value }))
    markUnsaved()
  }

  const handleTitleChange = (value: string) => {
    handleChange('title', value)
    if (!slugManuallyEdited) handleChange('slug', slugify(value))
  }

  const pushTag = (raw: string) => {
    const normalized = slugify(raw).replace(/\s+/g, '-').trim()
    if (!normalized) return
    setForm(prev => prev.tags.includes(normalized) ? prev : { ...prev, tags: [...prev.tags, normalized] })
    markUnsaved()
  }

  const removeTag = (tag: string) => {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))
    markUnsaved()
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault()
      const v = tagInput.trim()
      if (v) { pushTag(v); setTagInput('') }
    } else if (e.key === 'Backspace' && tagInput.length === 0 && form.tags.length > 0) {
      e.preventDefault()
      removeTag(form.tags[form.tags.length - 1])
    }
  }

  const handleImageUpload = async (file: File | null | undefined) => {
    if (!file) return
    setAutosaveStatus('saving')
    try {
      const urls = await uploadFiles([file])
      if (urls.length > 0) { handleChange('coverImageUrl', urls[0]); showToast('Imagen de portada cargada') }
    } catch {
      showToast('No se pudo subir la imagen', { variant: 'error' })
      setAutosaveStatus('error')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file?.type.startsWith('image/')) handleImageUpload(file)
  }

  // ── Computed values ──────────────────────────────────────────────────────────

  const wordCount = useMemo(() => {
    const text = form.htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return text ? text.split(/\s+/).filter(Boolean).length : 0
  }, [form.htmlContent])

  const readingTime = Math.max(1, Math.ceil(wordCount / 200))

  const { score, missing } = useMemo(() => {
    const items: string[] = []
    let s = 0
    if (form.title.trim()) s += 20; else items.push('título')
    if (wordCount >= 300) s += 25; else items.push(`contenido (${wordCount}/300 palabras)`)
    if (form.coverImageUrl) s += 20; else items.push('imagen de portada')
    if (form.seoDescription.trim()) s += 15; else items.push('meta descripción')
    if (form.tags.length > 0) s += 10; else items.push('al menos 1 tag')
    if (slugManuallyEdited) s += 10; else items.push('slug personalizado')
    return { score: s, missing: items }
  }, [form.title, wordCount, form.coverImageUrl, form.seoDescription, form.tags, slugManuallyEdited])

  const seoPreviewTitle = form.seoTitle || form.title || 'Título del artículo'
  const seoPreviewDescription = form.seoDescription || form.excerpt || 'Descripción que aparecerá en los resultados de búsqueda...'
  const charCountTitle = seoPreviewTitle.length
  const charCountDescription = seoPreviewDescription.length

  // ── Save ─────────────────────────────────────────────────────────────────────

  const validate = (): string | null => {
    if (!form.title.trim()) return 'El título es obligatorio.'
    if (!form.slug.trim()) return 'El slug es obligatorio.'
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug))
      return 'El slug solo puede contener letras minúsculas, números y guiones.'
    if (form.htmlContent === '<p></p>' || !form.htmlContent.trim())
      return 'El contenido no puede estar vacío.'
    if (form.jsonLdText.trim()) {
      try {
        const parsed = JSON.parse(form.jsonLdText)
        if (!parsed || (typeof parsed !== 'object' && !Array.isArray(parsed)))
          return 'El JSON-LD debe ser un objeto o un array.'
      } catch { return 'El JSON-LD no es JSON válido.' }
    }
    return null
  }

  const handleSubmit = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      showToast(validationError, { variant: 'error' })
      return
    }
    setError(null)
    setSaving(true)
    setAutosaveStatus('saving')
    try {
      const sanitizedHtml = sanitizeHtml(form.htmlContent)
      const metaPayload = {
        seoTitle: form.seoTitle.trim() || null,
        seoDescription: form.seoDescription.trim() || null,
        canonicalUrl: form.canonicalUrl.trim() || null,
        ogImageUrl: (form.ogImageUrl.trim() || form.coverImageUrl || '') || null,
        jsonLd: (() => {
          if (!form.jsonLdText.trim()) return null
          try {
            const p = JSON.parse(form.jsonLdText)
            return Array.isArray(p) ? p : p && typeof p === 'object' ? [p] : null
          } catch { return null }
        })(),
        theme: { heroBg: form.themeHeroBg, heroText: form.themeHeroText, accent: form.themeAccent },
      }
      const metaComment = buildEmbeddedMetaComment(metaPayload)
      const payload = {
        title: form.title.trim(),
        slug: form.slug.trim(),
        excerpt: form.excerpt.trim() || null,
        coverImageUrl: form.coverImageUrl,
        htmlContent: metaComment + '\n\n' + sanitizedHtml,
        status: form.status,
        tags: form.tags.map(t => t.toLowerCase()),
      }
      let saved: BlogPost
      if (isEditing && initialPost) {
        saved = await updateBlogPost(initialPost.id, payload)
      } else {
        saved = await createBlogPost({ ...payload, authorId })
        try { window.localStorage.removeItem(draftStorageKey) } catch { /* ignore */ }
      }
      setHasUnsavedChanges(false)
      setAutosaveStatus('saved')
      setLastSaved(new Date())
      setSaving(false)
      showToast(isEditing ? 'Entrada actualizada correctamente' : 'Entrada publicada correctamente')
      onSaved(saved)
    } catch (err) {
      console.error('[blog] save error', err)
      setSaving(false)
      setAutosaveStatus('error')
      const msg = err instanceof Error ? err.message : 'Error al guardar la entrada.'
      setError(msg)
      showToast(msg, { variant: 'error' })
    }
  }

  const handlePublishClick = () => {
    if (score < 80 && missing.length > 0) {
      showToast(`Artículo al ${score}% — falta: ${missing.slice(0, 2).join(', ')}`)
    }
    handleSubmit()
  }

  const handleCancel = () => {
    if (hasUnsavedChanges) setShowExitConfirm(true)
    else onCancel()
  }

  const discardChanges = () => {
    if (!isEditing) { try { window.localStorage.removeItem(draftStorageKey) } catch { /* ignore */ } }
    setShowExitConfirm(false)
    onCancel()
  }

  // ── Autosave label ────────────────────────────────────────────────────────────

  const autosaveLabel = (() => {
    if (autosaveStatus === 'saving') return <><RotateCcw className="h-3 w-3 animate-spin" /><span>Guardando…</span></>
    if (autosaveStatus === 'saved') return <><Check className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600">Guardado</span></>
    if (autosaveStatus === 'error') return <><AlertCircle className="h-3 w-3 text-red-500" /><span className="text-red-500">Error al guardar</span></>
    if (lastSaved) return <><Clock className="h-3 w-3" /><span>Guardado {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></>
    return null
  })()

  // ─────────────────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex min-h-screen flex-col bg-gray-50">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3">

            {/* Back */}
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>

            {/* Title preview */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-sm font-medium text-gray-700">
                {form.title || (isEditing ? 'Editar entrada' : 'Nueva entrada')}
              </span>
              {form.status === 'published' ? (
                <span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 sm:inline">
                  Publicado
                </span>
              ) : (
                <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 sm:inline">
                  Borrador
                </span>
              )}
            </div>

            {/* Autosave */}
            {autosaveLabel && (
              <div className="hidden items-center gap-1 text-xs text-gray-400 sm:flex">
                {autosaveLabel}
              </div>
            )}

            {/* Preview link */}
            {form.slug && (
              <a
                href={`/blog/${form.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Preview</span>
              </a>
            )}

            {/* Publish */}
            <button
              type="button"
              onClick={handlePublishClick}
              disabled={saving || uploading}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                score >= 80
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-[#14212e] hover:bg-[#1f2d3a]'
              }`}
            >
              {saving
                ? <><RotateCcw className="h-4 w-4 animate-spin" />Guardando…</>
                : <><Save className="h-4 w-4" />{isEditing ? 'Actualizar' : form.status === 'published' ? 'Publicar' : 'Guardar'}</>
              }
            </button>
          </div>
        </header>

        {/* ── Error banner ────────────────────────────────────────────────────── */}
        {error && (
          <div className="mx-4 mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <p>{error}</p>
            <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── Two-column layout ────────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col gap-6 p-4 lg:flex-row lg:items-start lg:gap-6">

          {/* ── LEFT COLUMN (70%) — Editor ─────────────────────────────────────── */}
          <div className="min-w-0 flex-1 space-y-4">

            {/* Title */}
            <input
              type="text"
              value={form.title}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="Título del artículo…"
              className="w-full border-none bg-transparent text-3xl font-bold text-gray-900 placeholder:text-gray-300 focus:outline-none"
            />

            {/* Slug URL row */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">ciclomarket.ar/blog/</span>
              {slugEditing ? (
                <input
                  ref={slugInputRef}
                  type="text"
                  value={form.slug}
                  onChange={e => { setSlugManuallyEdited(true); handleChange('slug', slugify(e.target.value)) }}
                  onBlur={() => setSlugEditing(false)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setSlugEditing(false) }}
                  className="rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-sm text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => { setSlugEditing(true); setTimeout(() => slugInputRef.current?.select(), 10) }}
                  className="group flex items-center gap-1 rounded px-1 py-0.5 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                >
                  <span className="font-mono">{form.slug || '—'}</span>
                  <Pencil className="h-3 w-3 opacity-0 transition group-hover:opacity-60" />
                </button>
              )}
              {slugManuallyEdited && (
                <button
                  type="button"
                  onClick={() => { setSlugManuallyEdited(false); handleChange('slug', slugify(form.title)) }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                  title="Regenerar desde título"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* TipTap editor */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <TipTapEditor
                content={form.htmlContent}
                onChange={html => handleChange('htmlContent', html)}
                placeholder="Empezá a escribir el contenido de tu artículo…"
              />
              {/* Editor footer */}
              <div className="flex items-center gap-3 border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
                <span>{wordCount.toLocaleString()} palabras</span>
                <span>·</span>
                <span>~{readingTime} min de lectura</span>
                {autosaveLabel && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1">{autosaveLabel}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN (30%) — Publishing panel ──────────────────────────── */}
          <div className="w-full space-y-4 lg:sticky lg:top-[60px] lg:w-80 lg:max-h-[calc(100vh-80px)] lg:overflow-y-auto lg:pb-8">

            {/* Score */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <ScoreBar score={score} missing={missing} />
            </div>

            {/* Main publish panel */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">

              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Estado</label>
                <select
                  value={form.status}
                  onChange={e => handleChange('status', e.target.value as 'draft' | 'published')}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/20"
                >
                  <option value="draft">🟡  Borrador</option>
                  <option value="published">🟢  Publicado</option>
                </select>
              </div>

              {/* Tags */}
              <div className="space-y-1.5 border-t border-gray-100 pt-4">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  🏷 Tags
                </label>
                <div className="flex min-h-[40px] flex-wrap gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-[#14212e] focus-within:ring-2 focus-within:ring-[#14212e]/20">
                  {form.tags.map(tag => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-[#e6edf5] px-2.5 py-0.5 text-xs font-medium text-[#14212e]"
                    >
                      #{tag}
                      <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-500">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder={form.tags.length === 0 ? 'Agregar tag…' : ''}
                    className="min-w-[80px] flex-1 border-none bg-transparent text-sm placeholder:text-gray-400 focus:outline-none"
                  />
                </div>
                <p className="text-[11px] text-gray-400">Enter, coma o Tab para agregar</p>
              </div>

              {/* Cover image — drag & drop */}
              <div className="space-y-1.5 border-t border-gray-100 pt-4">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  🖼 Imagen de portada
                </label>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={e => handleImageUpload(e.target.files?.[0])}
                />
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                  onDragEnter={() => setIsDragging(true)}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => !form.coverImageUrl && coverInputRef.current?.click()}
                  className={`relative overflow-hidden rounded-xl border-2 border-dashed transition-colors ${
                    isDragging
                      ? 'border-blue-400 bg-blue-50'
                      : form.coverImageUrl
                      ? 'cursor-default border-transparent'
                      : 'cursor-pointer border-gray-200 bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  {form.coverImageUrl ? (
                    <div className="relative">
                      <img
                        src={form.coverImageUrl}
                        alt="Portada"
                        className="h-36 w-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-all hover:bg-black/30 hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => coverInputRef.current?.click()}
                          className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-gray-800 shadow"
                        >
                          Cambiar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChange('coverImageUrl', null)}
                          className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white shadow"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 py-5">
                      {uploading ? (
                        <><RotateCcw className="h-5 w-5 animate-spin text-gray-400" /><span className="text-xs text-gray-400">Subiendo…</span></>
                      ) : (
                        <>
                          <ImageIcon className="h-6 w-6 text-gray-300" />
                          <span className="text-xs font-medium text-gray-500">Arrastrá o hacé clic</span>
                          <span className="text-[11px] text-gray-400">1200×630 · JPG, PNG, WebP</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* SEO */}
              <div className="space-y-3 border-t border-gray-100 pt-4">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  🔍 SEO
                </label>

                {/* SERP preview */}
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-[13px]">
                  <div className="truncate text-[#1a0dab]">
                    {seoPreviewTitle.length > 60
                      ? seoPreviewTitle.slice(0, 57) + '…'
                      : seoPreviewTitle}
                  </div>
                  <div className="text-xs text-[#006621]">
                    ciclomarket.ar/blog/{form.slug || '…'}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-[#545454]">
                    {seoPreviewDescription.length > 155
                      ? seoPreviewDescription.slice(0, 152) + '…'
                      : seoPreviewDescription}
                  </div>
                </div>

                {/* SEO Title */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">Título SEO</span>
                    <Counter count={charCountTitle} max={60} thresholds={[0.83, 1]} />
                  </div>
                  <input
                    type="text"
                    value={form.seoTitle}
                    onChange={e => handleChange('seoTitle', e.target.value)}
                    placeholder="Título optimizado para Google…"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/20"
                  />
                  <p className="text-[11px] text-gray-400">Vacío = usa el título del artículo</p>
                </div>

                {/* SEO Description */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">Meta descripción</span>
                    <Counter count={charCountDescription} max={160} thresholds={[0.875, 1]} />
                  </div>
                  <textarea
                    value={form.seoDescription}
                    onChange={e => handleChange('seoDescription', e.target.value)}
                    rows={3}
                    placeholder="Descripción que aparecerá en Google…"
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/20"
                  />
                </div>
              </div>

              {/* Excerpt — accordion */}
              <AccordionSection
                title="Extracto"
                open={excerptOpen}
                onToggle={() => setExcerptOpen(o => !o)}
                badge={form.excerpt ? `${form.excerpt.length} chars` : 'opcional'}
              >
                <textarea
                  value={form.excerpt}
                  onChange={e => handleChange('excerpt', e.target.value)}
                  rows={3}
                  placeholder="Resumen breve para tarjetas y listas del blog…"
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/20"
                />
                <p className="text-[11px] text-gray-400">{form.excerpt.length} chars · Recomendado: 150–200</p>
              </AccordionSection>

              {/* Advanced — accordion */}
              <AccordionSection
                title="Configuración avanzada"
                open={advancedOpen}
                onToggle={() => setAdvancedOpen(o => !o)}
              >
                {/* Theme colors */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-600">Colores del hero</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Fondo', field: 'themeHeroBg' as const },
                      { label: 'Texto', field: 'themeHeroText' as const },
                      { label: 'Acento', field: 'themeAccent' as const },
                    ].map(({ label, field }) => (
                      <div key={field} className="space-y-1">
                        <span className="text-[11px] text-gray-400">{label}</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={form[field]}
                            onChange={e => handleChange(field, e.target.value)}
                            className="h-7 w-7 cursor-pointer rounded border border-gray-200"
                          />
                          <input
                            type="text"
                            value={form[field]}
                            onChange={e => handleChange(field, e.target.value)}
                            className="w-0 flex-1 rounded border border-gray-200 px-1.5 py-1 font-mono text-[11px] focus:outline-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Hero preview */}
                  <div
                    className="rounded-lg p-3 text-xs"
                    style={{ backgroundColor: form.themeHeroBg, color: form.themeHeroText }}
                  >
                    <div className="font-bold truncate">{form.title || 'Título del artículo'}</div>
                    <div className="mt-1 opacity-70 truncate">{form.excerpt || 'Extracto…'}</div>
                    <div
                      className="mt-2 inline-block rounded-full px-3 py-1 text-[11px] font-semibold text-white"
                      style={{ backgroundColor: form.themeAccent }}
                    >
                      Leer más
                    </div>
                  </div>
                </div>

                {/* OG Image */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">OG Image URL</label>
                  <input
                    type="url"
                    value={form.ogImageUrl}
                    onChange={e => handleChange('ogImageUrl', e.target.value)}
                    placeholder="https://… (vacío = usa portada)"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/20"
                  />
                </div>

                {/* Canonical URL */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Canonical URL</label>
                  <input
                    type="url"
                    value={form.canonicalUrl}
                    onChange={e => handleChange('canonicalUrl', e.target.value)}
                    placeholder="https://origen-original.com/…"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/20"
                  />
                  <p className="text-[11px] text-gray-400">Solo si el contenido viene de otro sitio</p>
                </div>

                {/* JSON-LD */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">JSON-LD Schema</label>
                  <textarea
                    value={form.jsonLdText}
                    onChange={e => handleChange('jsonLdText', e.target.value)}
                    rows={6}
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 font-mono text-[11px] focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/20"
                    placeholder={`{\n  "@context": "https://schema.org",\n  "@type": "BlogPosting"\n}`}
                  />
                </div>

                {!isEditing && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-[11px] text-amber-700">
                      Los borradores se guardan automáticamente en este dispositivo. No se sincronizan entre dispositivos hasta que publiques.
                    </p>
                  </div>
                )}
              </AccordionSection>
            </div>
          </div>
        </div>
      </div>

      {/* ── Exit confirm modal ───────────────────────────────────────────────── */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <AlertCircle className="h-6 w-6 text-amber-600" />
            </div>
            <h3 className="mb-1 text-base font-semibold text-gray-900">¿Salir sin guardar?</h3>
            <p className="mb-5 text-sm text-gray-500">
              Tenés cambios sin guardar.
              {!isEditing && ' El borrador local también se eliminará.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Seguir editando
              </button>
              <button
                type="button"
                onClick={discardChanges}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
