import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Youtube from '@tiptap/extension-youtube'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Youtube as YoutubeIcon,
  Undo,
  Redo,
  Minus,
  Trash2,
  Bike,
  FileCode,
} from 'lucide-react'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useToast } from '../../context/ToastContext'
import useUpload from '../../hooks/useUpload'

const lowlight = createLowlight(common)

interface TipTapEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
}

interface ToolbarButtonProps {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        flex h-8 w-8 items-center justify-center rounded-lg transition
        ${active 
          ? 'bg-[#14212e] text-white' 
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }
        ${disabled ? 'cursor-not-allowed opacity-40' : ''}
      `}
    >
      {children}
    </button>
  )
}

export default function TipTapEditor({ content, onChange, placeholder }: TipTapEditorProps) {
  const { show: showToast } = useToast()
  const { uploadFiles, uploading } = useUpload()
  const [isHtmlMode, setIsHtmlMode] = useState(false)
  const [htmlContent, setHtmlContent] = useState(content)
  const [listingSlug, setListingSlug] = useState('')
  const [showListingInput, setShowListingInput] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-[#047857] underline underline-offset-2',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-2xl max-w-full h-auto',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Youtube.configure({
        width: 640,
        height: 360,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Escribí el contenido de tu artículo...',
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange(html)
      setHtmlContent(html)
    },
  })

  // Sincronizar contenido externo
  useEffect(() => {
    if (content !== htmlContent && content !== editor?.getHTML()) {
      setHtmlContent(content)
      editor?.commands.setContent(content)
    }
  }, [content])

  const handleHtmlChange = (newHtml: string) => {
    setHtmlContent(newHtml)
    editor?.commands.setContent(newHtml)
    onChange(newHtml)
  }

  const handleImageUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    
    try {
      const urls = await uploadFiles(Array.from(files))
      if (urls.length > 0 && editor) {
        const file = files[0]
        const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
        editor.chain().focus().setImage({ src: urls[0], alt }).run()
        showToast('Imagen insertada correctamente')
      }
    } catch (err) {
      console.error('[editor] image upload error', err)
      showToast('No se pudo subir la imagen', { variant: 'error' })
    }
  }, [editor, uploadFiles, showToast])

  const addLink = useCallback(() => {
    const url = window.prompt('URL del enlace:', 'https://')
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }, [editor])

  const addYoutube = useCallback(() => {
    const url = window.prompt('URL de YouTube:', 'https://youtube.com/watch?v=')
    if (url && editor) {
      editor.chain().focus().setYoutubeVideo({ src: url }).run()
    }
  }, [editor])

  const insertTable = useCallback(() => {
    if (editor) {
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    }
  }, [editor])

  const insertListingShortcode = () => {
    if (!listingSlug.trim() || !editor) return
    
    // Insertar el shortcode como texto plano
    const shortcode = `[listing:${listingSlug.trim()}]`
    editor.chain().focus().insertContent(shortcode).run()
    
    setListingSlug('')
    setShowListingInput(false)
    showToast('Shortcode insertado. Se mostrará como card al publicar.')
  }

  if (!editor) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-[#14212e]" />
        <p className="text-sm text-gray-500">Cargando editor...</p>
      </div>
    )
  }

  // HTML Mode
  if (isHtmlMode) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Modo Código HTML</span>
          </div>
          <button
            type="button"
            onClick={() => setIsHtmlMode(false)}
            className="rounded-lg bg-[#14212e] px-3 py-1.5 text-sm font-medium text-white"
          >
            Ver modo Visual
          </button>
        </div>
        <textarea
          value={htmlContent}
          onChange={(e) => handleHtmlChange(e.target.value)}
          className="min-h-[500px] w-full p-4 font-mono text-sm text-gray-800 focus:outline-none"
          placeholder="<!-- Pegá tu HTML acá -->"
          spellCheck={false}
        />
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500">
          Modo avanzado: Editás el código fuente HTML directamente.
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 p-3">
        {/* Historial */}
        <div className="flex items-center gap-1 pr-2">
          <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Deshacer">
            <Undo className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Rehacer">
            <Redo className="h-4 w-4" />
          </ToolbarButton>
        </div>

        <div className="mx-1 h-6 w-px bg-gray-200" />

        {/* Formato básico */}
        <div className="flex items-center gap-1 pr-2">
          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Negrita">
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Cursiva">
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Subrayado">
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Tachado">
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>
        </div>

        <div className="mx-1 h-6 w-px bg-gray-200" />

        {/* Headings */}
        <div className="flex items-center gap-1 pr-2">
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="H1">
            <Heading1 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="H2">
            <Heading2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="H3">
            <Heading3 className="h-4 w-4" />
          </ToolbarButton>
        </div>

        <div className="mx-1 h-6 w-px bg-gray-200" />

        {/* Listas */}
        <div className="flex items-center gap-1 pr-2">
          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Lista">
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numerada">
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Cita">
            <Quote className="h-4 w-4" />
          </ToolbarButton>
        </div>

        <div className="mx-1 h-6 w-px bg-gray-200" />

        {/* Alineación */}
        <div className="flex items-center gap-1 pr-2">
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Izquierda">
            <AlignLeft className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Centro">
            <AlignCenter className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Derecha">
            <AlignRight className="h-4 w-4" />
          </ToolbarButton>
        </div>

        <div className="mx-1 h-6 w-px bg-gray-200" />

        {/* Insertar */}
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => handleImageUpload(e.target.files)}
          />
          <ToolbarButton onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Imagen">
            <ImageIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={addLink} title="Enlace">
            <LinkIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={insertTable} title="Tabla">
            <TableIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={addYoutube} title="YouTube">
            <YoutubeIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => setShowListingInput(!showListingInput)} active={showListingInput} title="Card de publicación">
            <Bike className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Separador">
            <Minus className="h-4 w-4" />
          </ToolbarButton>
        </div>

        {editor.isActive('table') && (
          <>
            <div className="mx-1 h-6 w-px bg-gray-200" />
            <div className="flex items-center gap-1">
              <ToolbarButton onClick={() => editor.chain().focus().addColumnBefore().run()} title="+Col">
                <span className="text-xs">+Col</span>
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().addColumnAfter().run()} title="Col+">
                <span className="text-xs">Col+</span>
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().deleteColumn().run()} title="Del Col">
                <Trash2 className="h-3 w-3" />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().addRowBefore().run()} title="+Fila">
                <span className="text-xs">+Fila</span>
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().addRowAfter().run()} title="Fila+">
                <span className="text-xs">Fila+</span>
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().deleteRow().run()} title="Del Fila">
                <Trash2 className="h-3 w-3" />
              </ToolbarButton>
            </div>
          </>
        )}

        <div className="mx-1 h-6 w-px bg-gray-200" />
        
        <button
          type="button"
          onClick={() => setIsHtmlMode(true)}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          <FileCode className="h-4 w-4" />
          HTML
        </button>
      </div>

      {/* Input para shortcode de listing */}
      {showListingInput && (
        <div className="border-b border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Insertar card:</span>
            <input
              type="text"
              value={listingSlug}
              onChange={(e) => setListingSlug(e.target.value)}
              placeholder="specialized-diverge-diverge-2023"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={insertListingShortcode}
              disabled={!listingSlug.trim()}
              className="rounded-lg bg-[#14212e] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Insertar
            </button>
            <button
              type="button"
              onClick={() => setShowListingInput(false)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600"
            >
              Cancelar
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Escribí el slug de la publicación. Ejemplo: <code>specialized-diverge-diverge-2023</code>
          </p>
        </div>
      )}

      {/* Editor content */}
      <div className="prose prose-slate max-w-none p-4">
        <EditorContent 
          editor={editor} 
          className="min-h-[400px] focus:outline-none"
        />
      </div>
    </div>
  )
}
