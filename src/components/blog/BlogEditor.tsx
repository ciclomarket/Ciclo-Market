import { useEffect, useMemo, useRef, useState, type FormEvent, useCallback } from 'react'
import type { BlogPost } from '../../types/blog'
import { createBlogPost, updateBlogPost } from '../../services/blog'
import { buildEmbeddedMetaComment } from '../../utils/blogContent'
import useUpload from '../../hooks/useUpload'
import { sanitizeHtml } from '../../utils/sanitizeHtml'
import { slugify } from '../../utils/slug'
import { useToast } from '../../context/ToastContext'
import TipTapEditor from './TipTapEditor'
import { 
  Eye, 
  EyeOff, 
  Save, 
  X, 
  Image as ImageIcon, 
  Check, 
  AlertCircle,
  Clock,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Smartphone,
  Tablet
} from 'lucide-react'

// Hook para detectar cambios sin guardar - DESACTIVADO temporalmente por problemas con modales
function useBeforeUnload(hasUnsavedChanges: boolean) {
  // Desactivado hasta solucionar conflictos con modales
  useEffect(() => {
    // No-op: el beforeunload está causando problemas con los modales del editor
    // TODO: Implementar una solución mejor que no interfiera con modales internos
  }, [hasUnsavedChanges])
}

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
type PreviewDevice = 'desktop' | 'tablet' | 'mobile'

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

export default function BlogEditor({ authorId, initialPost, onCancel, onSaved }: BlogEditorProps) {
  const isEditing = Boolean(initialPost)
  const { show: showToast } = useToast()
  const draftStorageKey = useMemo(() => `ciclomarket:blogDraft:${authorId}`, [authorId])
  const draftRestoredKey = useMemo(() => `ciclomarket:blogDraftRestored:${authorId}`, [authorId])
  
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
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [activeTab, setActiveTab] = useState<'editor' | 'seo' | 'design' | 'advanced'>('editor')
  const [showPreview, setShowPreview] = useState(false)
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  const { uploadFiles, uploading } = useUpload()
  const coverInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Detectar cambios sin guardar (deshabilitado temporalmente)
  useBeforeUnload(hasUnsavedChanges)

  // Restaurar borrador al iniciar
  useEffect(() => {
    if (isEditing) return
    
    try {
      const raw = window.localStorage.getItem(draftStorageKey)
      if (!raw) return
      
      const parsed = JSON.parse(raw) as { 
        v?: number
        form?: FormState
        slugManuallyEdited?: boolean
        savedAt?: string
      } | null
      
      if (!parsed || parsed.v !== 1 || !parsed.form) return
      
      const draft = parsed.form
      if (typeof draft.title !== 'string') return
      
      // Verificar que el borrador no sea muy viejo (7 días)
      if (parsed.savedAt) {
        const savedDate = new Date(parsed.savedAt)
        const daysDiff = (Date.now() - savedDate.getTime()) / (1000 * 60 * 60 * 24)
        if (daysDiff > 7) {
          window.localStorage.removeItem(draftStorageKey)
          return
        }
      }
      
      setForm(draft)
      setSlugManuallyEdited(Boolean(parsed.slugManuallyEdited))
      setHasUnsavedChanges(true)
      
      try {
        const signature = raw
        const last = window.sessionStorage.getItem(draftRestoredKey)
        if (last !== signature) {
          showToast(`Borrador restaurado (${new Date(parsed.savedAt || Date.now()).toLocaleTimeString()})`)
          window.sessionStorage.setItem(draftRestoredKey, signature)
        }
      } catch {
        showToast('Borrador restaurado')
      }
    } catch {
      // ignore storage/JSON errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStorageKey, draftRestoredKey, isEditing])

  // Autosave a localStorage
  useEffect(() => {
    if (isEditing) return
    
    const timer = window.setTimeout(() => {
      if (!hasUnsavedChanges) return
      
      try {
        const payload = { 
          v: 1, 
          form, 
          slugManuallyEdited, 
          savedAt: new Date().toISOString() 
        }
        window.localStorage.setItem(draftStorageKey, JSON.stringify(payload))
        setAutosaveStatus('saved')
        setLastSaved(new Date())
        
        // Resetear a idle después de 2 segundos
        window.setTimeout(() => {
          setAutosaveStatus(prev => prev === 'saved' ? 'idle' : prev)
        }, 2000)
      } catch {
        setAutosaveStatus('error')
      }
    }, 1500)
    
    return () => window.clearTimeout(timer)
  }, [draftStorageKey, form, isEditing, slugManuallyEdited, hasUnsavedChanges])

  // Marcar cambios sin guardar
  const markUnsaved = useCallback(() => {
    if (!hasUnsavedChanges) {
      setHasUnsavedChanges(true)
    }
    if (autosaveStatus === 'idle') {
      setAutosaveStatus('saving')
    }
  }, [hasUnsavedChanges, autosaveStatus])

  const handleChange = (field: keyof FormState, value: string | string[] | null) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    markUnsaved()
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
    markUnsaved()
  }

  const removeTag = (tag: string) => {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }))
    markUnsaved()
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault()
      const value = tagInput.trim()
      if (value) {
        pushTag(value)
        setTagInput('')
      }
    } else if (e.key === 'Backspace' && tagInput.length === 0 && form.tags.length > 0) {
      e.preventDefault()
      const last = form.tags[form.tags.length - 1]
      removeTag(last)
    }
  }

  const handleCoverUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    
    setAutosaveStatus('saving')
    try {
      const urls = await uploadFiles(Array.from(files))
      if (urls.length > 0) {
        handleChange('coverImageUrl', urls[0])
        showToast('Imagen de portada cargada')
      }
    } catch (err) {
      console.error('[blog] cover upload error', err)
      showToast('No se pudo subir la imagen', { variant: 'error' })
      setAutosaveStatus('error')
    }
  }

  const validate = (): string | null => {
    if (!form.title.trim()) return 'El título es obligatorio.'
    if (!form.slug.trim()) return 'El slug es obligatorio.'
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) {
      return 'El slug solo puede contener letras minúsculas, números y guiones.'
    }
    if (form.htmlContent === '<p></p>' || !form.htmlContent.trim()) {
      return 'El contenido no puede estar vacío.'
    }
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

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault()
    
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
      const payload = {
        title: form.title.trim(),
        slug: form.slug.trim(),
        excerpt: form.excerpt.trim() || null,
        coverImageUrl: form.coverImageUrl,
        htmlContent: metaComment + '\n\n' + sanitizedHtml,
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
      
      // Limpiar borrador
      if (!isEditing) {
        try {
          window.localStorage.removeItem(draftStorageKey)
        } catch {
          // ignore
        }
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
      const message = err instanceof Error ? err.message : 'Error al guardar la entrada.'
      setError(message)
      showToast(message, { variant: 'error' })
    }
  }

  const handleCancel = () => {
    if (hasUnsavedChanges) {
      setShowExitConfirm(true)
    } else {
      onCancel()
    }
  }

  const discardChanges = () => {
    if (!isEditing) {
      try {
        window.localStorage.removeItem(draftStorageKey)
      } catch {
        // ignore
      }
    }
    setShowExitConfirm(false)
    onCancel()
  }

  const getDeviceWidth = () => {
    switch (previewDevice) {
      case 'mobile': return '375px'
      case 'tablet': return '768px'
      default: return '100%'
    }
  }

  // SEO Preview
  const seoPreviewTitle = form.seoTitle || form.title || 'Título del artículo'
  const seoPreviewDescription = form.seoDescription || form.excerpt || 'Descripción del artículo que aparecerá en los resultados de búsqueda...'
  const charCountTitle = seoPreviewTitle.length
  const charCountDescription = seoPreviewDescription.length

  return (
    <>
      {/* Usamos div en lugar de form para evitar problemas con modales internos */}
      <div ref={formRef as any} className="space-y-6">
        {/* Header con acciones */}
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900">
              {isEditing ? 'Editar entrada' : 'Nueva entrada'}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                {autosaveStatus === 'saving' && (
                  <>
                    <RotateCcw className="h-3 w-3 animate-spin" />
                    Guardando borrador...
                  </>
                )}
                {autosaveStatus === 'saved' && (
                  <>
                    <Check className="h-3 w-3 text-green-600" />
                    <span className="text-green-600">Borrador guardado</span>
                  </>
                )}
                {autosaveStatus === 'error' && (
                  <>
                    <AlertCircle className="h-3 w-3 text-red-600" />
                    <span className="text-red-600">Error al guardar</span>
                  </>
                )}
                {autosaveStatus === 'idle' && lastSaved && (
                  <>
                    <Clock className="h-3 w-3" />
                    Último guardado: {lastSaved.toLocaleTimeString()}
                  </>
                )}
              </span>
              {hasUnsavedChanges && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Sin guardar
                </span>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                showPreview 
                  ? 'bg-[#14212e] text-white' 
                  : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showPreview ? 'Ocultar preview' : 'Ver preview'}
            </button>
            
            <select
              value={form.status}
              onChange={(e) => handleChange('status', e.target.value as 'draft' | 'published')}
              className="rounded-full border border-gray-300 px-4 py-2 text-sm focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
            >
              <option value="draft">📝 Borrador</option>
              <option value="published">🚀 Publicado</option>
            </select>
            
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancelar
            </button>
            
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={saving || uploading}
              className="flex items-center gap-2 rounded-full bg-[#14212e] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1f2d3a] disabled:cursor-not-allowed disabled:bg-[#14212e]/60"
            >
              {saving ? (
                <>
                  <RotateCcw className="h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {isEditing ? 'Actualizar' : 'Publicar'}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error global */}
        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-100/50 p-1">
          {[
            { id: 'editor', label: '📝 Contenido' },
            { id: 'seo', label: '🔍 SEO' },
            { id: 'design', label: '🎨 Diseño' },
            { id: 'advanced', label: '⚙️ Avanzado' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-white text-[#14212e] shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={`grid gap-6 ${showPreview ? 'lg:grid-cols-2' : ''}`}>
          {/* Panel principal */}
          <div className="space-y-6">
            {/* Tab: Editor */}
            {activeTab === 'editor' && (
              <div className="space-y-6">
                {/* Título y Slug */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Título <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      placeholder="Ej. Las mejores rutas gravel en Patagonia"
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Slug <span className="text-gray-400">(URL)</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form.slug}
                        onChange={(e) => {
                          setSlugManuallyEdited(true)
                          handleChange('slug', slugify(e.target.value))
                        }}
                        placeholder="rutas-gravel-patagonia"
                        className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setSlugManuallyEdited(false)
                          handleChange('slug', slugify(form.title))
                        }}
                        className="rounded-xl border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50"
                        title="Regenerar desde título"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Extracto */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Extracto</label>
                  <textarea
                    value={form.excerpt}
                    onChange={(e) => handleChange('excerpt', e.target.value)}
                    rows={3}
                    placeholder="Resumen breve que se mostrará en las tarjetas del blog..."
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
                  />
                  <p className="text-xs text-gray-500">
                    {form.excerpt.length} caracteres. Recomendado: 150-200.
                  </p>
                </div>

                {/* Imagen de portada */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Imagen de portada</label>
                  <div className="flex items-center gap-3">
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleCoverUpload(e.target.files)}
                      className="sr-only"
                    />
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                    >
                      <ImageIcon className="h-4 w-4" />
                      {uploading ? 'Subiendo...' : 'Subir imagen'}
                    </button>
                    {form.coverImageUrl && (
                      <button
                        type="button"
                        onClick={() => handleChange('coverImageUrl', null)}
                        className="text-sm font-medium text-red-600 hover:text-red-700"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                  {form.coverImageUrl && (
                    <div className="relative overflow-hidden rounded-xl">
                      <img
                        src={form.coverImageUrl}
                        alt="Portada"
                        className="h-48 w-full object-cover"
                      />
                    </div>
                  )}
                </div>

                {/* Tags */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Tags</label>
                  <div className="flex flex-wrap gap-2 rounded-xl border border-gray-300 px-3 py-2 focus-within:border-[#14212e] focus-within:ring-2 focus-within:ring-[#14212e]/25">
                    {form.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full bg-[#e6edf5] px-3 py-1 text-xs font-medium text-[#14212e]"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="text-[#1f2d3a] transition hover:text-[#14212e]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      placeholder={form.tags.length === 0 ? 'Agregar tag y presionar Enter' : ''}
                      className="min-w-[120px] flex-1 border-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                    />
                  </div>
                  <p className="text-xs text-gray-500">Presioná Enter, coma o Tab para agregar</p>
                </div>

                {/* Editor TipTap */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Contenido <span className="text-red-500">*</span>
                  </label>
                  <TipTapEditor
                    content={form.htmlContent}
                    onChange={(html) => handleChange('htmlContent', html)}
                    placeholder="Empezá a escribir el contenido de tu artículo..."
                  />
                </div>
              </div>
            )}

            {/* Tab: SEO */}
            {activeTab === 'seo' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  <h3 className="mb-2 font-medium text-blue-900">Preview en Google</h3>
                  <div className="rounded-lg bg-white p-4 shadow-sm">
                    <div className="text-sm text-[#1a0dab]">{seoPreviewTitle}</div>
                    <div className="text-xs text-[#006621]">
                      www.ciclomarket.ar › blog › {form.slug || '...'}
                    </div>
                    <div className="text-sm text-[#545454] line-clamp-2">
                      {seoPreviewDescription}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Título SEO
                      <span className={`ml-2 text-xs ${charCountTitle > 60 ? 'text-red-500' : 'text-gray-400'}`}>
                        {charCountTitle}/60
                      </span>
                    </label>
                    <input
                      type="text"
                      value={form.seoTitle}
                      onChange={(e) => handleChange('seoTitle', e.target.value)}
                      placeholder="Título optimizado para SEO"
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
                    />
                    <p className="text-xs text-gray-500">
                      Si está vacío, se usa el título normal
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      OG Image URL
                    </label>
                    <input
                      type="url"
                      value={form.ogImageUrl}
                      onChange={(e) => handleChange('ogImageUrl', e.target.value)}
                      placeholder="https://..."
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
                    />
                    <p className="text-xs text-gray-500">
                      Si está vacío, se usa la imagen de portada
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Descripción SEO
                    <span className={`ml-2 text-xs ${charCountDescription > 160 ? 'text-red-500' : 'text-gray-400'}`}>
                      {charCountDescription}/160
                    </span>
                  </label>
                  <textarea
                    value={form.seoDescription}
                    onChange={(e) => handleChange('seoDescription', e.target.value)}
                    rows={3}
                    placeholder="Descripción que aparecerá en los resultados de búsqueda"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Canonical URL</label>
                  <input
                    type="url"
                    value={form.canonicalUrl}
                    onChange={(e) => handleChange('canonicalUrl', e.target.value)}
                    placeholder="https://www.ejemplo.com/post-original"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
                  />
                  <p className="text-xs text-gray-500">
                    Usar si el contenido fue publicado originalmente en otro sitio
                  </p>
                </div>
              </div>
            )}

            {/* Tab: Diseño */}
            {activeTab === 'design' && (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Color de fondo Hero</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.themeHeroBg}
                        onChange={(e) => handleChange('themeHeroBg', e.target.value)}
                        className="h-10 w-10 cursor-pointer rounded border border-gray-300"
                      />
                      <input
                        type="text"
                        value={form.themeHeroBg}
                        onChange={(e) => handleChange('themeHeroBg', e.target.value)}
                        className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Color de texto Hero</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.themeHeroText}
                        onChange={(e) => handleChange('themeHeroText', e.target.value)}
                        className="h-10 w-10 cursor-pointer rounded border border-gray-300"
                      />
                      <input
                        type="text"
                        value={form.themeHeroText}
                        onChange={(e) => handleChange('themeHeroText', e.target.value)}
                        className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Color de acento</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.themeAccent}
                        onChange={(e) => handleChange('themeAccent', e.target.value)}
                        className="h-10 w-10 cursor-pointer rounded border border-gray-300"
                      />
                      <input
                        type="text"
                        value={form.themeAccent}
                        onChange={(e) => handleChange('themeAccent', e.target.value)}
                        className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Preview del hero */}
                <div 
                  className="rounded-2xl p-8 transition-colors"
                  style={{ backgroundColor: form.themeHeroBg, color: form.themeHeroText }}
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider opacity-70">Preview</p>
                  <h1 className="text-3xl font-bold">{form.title || 'Título del artículo'}</h1>
                  <p className="mt-2 opacity-80">{form.excerpt || 'Extracto del artículo...'}</p>
                  <div className="mt-4 flex gap-2">
                    <span 
                      className="rounded-full px-4 py-2 text-sm font-semibold text-white"
                      style={{ backgroundColor: form.themeAccent }}
                    >
                      Acción primaria
                    </span>
                    <span className="rounded-full bg-white/20 px-4 py-2 text-sm font-semibold">
                      Acción secundaria
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Avanzado */}
            {activeTab === 'advanced' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">JSON-LD Schema</label>
                  <textarea
                    value={form.jsonLdText}
                    onChange={(e) => handleChange('jsonLdText', e.target.value)}
                    rows={10}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 font-mono text-xs focus:border-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/25"
                    placeholder={`{\n  "@context": "https://schema.org",\n  "@type": "BlogPosting",\n  "headline": "Título",\n  ...\n}`}
                  />
                  <p className="text-xs text-gray-500">
                    Estructura de datos para SEO avanzado. <a href="https://schema.org" target="_blank" rel="noopener noreferrer" className="text-[#14212e] underline">Ver documentación</a>
                  </p>
                </div>

                {!isEditing && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <h4 className="font-medium text-amber-900">📝 Información del borrador</h4>
                    <p className="mt-1 text-sm text-amber-700">
                      Los borradores se guardan automáticamente en este dispositivo cada 1.5 segundos. 
                      No se sincronizan entre dispositivos hasta que publiques.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Preview panel */}
          {showPreview && (
            <div className="space-y-4 lg:h-[calc(100vh-300px)] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-gray-200 lg:bg-gray-50 lg:p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">Preview</h3>
                <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('desktop')}
                    className={`rounded p-1.5 ${previewDevice === 'desktop' ? 'bg-gray-100 text-[#14212e]' : 'text-gray-400'}`}
                    title="Desktop"
                  >
                    <Monitor className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('tablet')}
                    className={`rounded p-1.5 ${previewDevice === 'tablet' ? 'bg-gray-100 text-[#14212e]' : 'text-gray-400'}`}
                    title="Tablet"
                  >
                    <Tablet className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('mobile')}
                    className={`rounded p-1.5 ${previewDevice === 'mobile' ? 'bg-gray-100 text-[#14212e]' : 'text-gray-400'}`}
                    title="Mobile"
                  >
                    <Smartphone className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div 
                className="mx-auto h-full overflow-y-auto rounded-xl bg-white shadow-lg transition-all"
                style={{ maxWidth: getDeviceWidth() }}
              >
                {/* Hero preview */}
                <div 
                  className="p-6"
                  style={{ backgroundColor: form.themeHeroBg, color: form.themeHeroText }}
                >
                  <span className="mb-2 inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase">
                    Blog
                  </span>
                  <h1 className="text-2xl font-bold">{form.title || 'Sin título'}</h1>
                  {form.excerpt && (
                    <p className="mt-2 text-sm opacity-80">{form.excerpt}</p>
                  )}
                </div>

                {/* Cover image */}
                {form.coverImageUrl && (
                  <img 
                    src={form.coverImageUrl} 
                    alt="Cover" 
                    className="w-full object-cover"
                    style={{ maxHeight: '300px' }}
                  />
                )}

                {/* Content */}
                <div className="p-6">
                  <div 
                    className="prose prose-slate max-w-none"
                    dangerouslySetInnerHTML={{ __html: form.htmlContent }}
                  />

                  {/* Tags */}
                  {form.tags.length > 0 && (
                    <div className="mt-6 flex flex-wrap gap-2">
                      {form.tags.map((tag) => (
                        <span 
                          key={tag}
                          className="rounded-full bg-[#e6edf5] px-3 py-1 text-xs font-semibold text-[#14212e]"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de confirmación al salir */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <AlertCircle className="h-6 w-6 text-amber-600" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              ¿Salir sin guardar?
            </h3>
            <p className="mb-6 text-sm text-gray-500">
              Tenés cambios sin guardar. Si salís ahora, se perderán. 
              {!isEditing && ' El borrador local también se eliminará.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
              >
                Seguir editando
              </button>
              <button
                type="button"
                onClick={discardChanges}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
              >
                Descartar cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
