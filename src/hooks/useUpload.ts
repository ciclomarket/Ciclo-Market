
import { useState } from 'react'
import { getSupabaseClient, supabaseEnabled, supabaseStorageBucket } from '../services/supabase'
import { compressToWebp } from '../utils/image'

type CompressOptions = {
  quality?: number
  maxWidth?: number
  maxHeight?: number
  minSizeBytes?: number
}

const DEFAULT_COMPRESS_OPTIONS: Required<CompressOptions> = {
  quality: 0.82,
  maxWidth: 1920,
  maxHeight: 1920,
  minSizeBytes: 200 * 1024, // ~200 KB, bypass compression for already small files
}

async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  // Delegate to WebP-oriented compressor (falls back to JPEG if WebP fails)
  const result = await compressToWebp(file, {
    quality: opts.quality ?? DEFAULT_COMPRESS_OPTIONS.quality,
    maxWidth: opts.maxWidth ?? DEFAULT_COMPRESS_OPTIONS.maxWidth,
    maxHeight: opts.maxHeight ?? DEFAULT_COMPRESS_OPTIONS.maxHeight,
    minSizeBytes: opts.minSizeBytes ?? DEFAULT_COMPRESS_OPTIONS.minSizeBytes,
  })
  return result
}

export default function useUpload() {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const uploadFiles = async (files: File[]) => {
    if (!supabaseEnabled || files.length === 0) return []
    const supabase = getSupabaseClient()
    const storage = supabase.storage.from(supabaseStorageBucket)
    setUploading(true)
    const urls: string[] = []
    try {
      for (const f of files) {
        const fileToUpload = await compressImage(f)
        const safeName = fileToUpload.name.replace(/[^a-zA-Z0-9_.-]/g, '_')
        const key = `${new Date().getFullYear()}/${Date.now()}_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}_${safeName}`
        const { error: uploadError } = await storage.upload(key, fileToUpload, {
          cacheControl: '3600',
          contentType: fileToUpload.type || f.type,
          upsert: false
        })
        if (uploadError) throw uploadError
        const { data } = storage.getPublicUrl(key)
        if (data?.publicUrl) {
          urls.push(data.publicUrl)
        }
        setProgress((p) => Math.min(100, p + Math.round(100 / files.length)))
      }
      return urls
    } finally { setUploading(false); setProgress(0) }
  }
  /**
   * Sube dos tamaños por imagen: detalle (p.ej. 1600px) y miniatura (p.ej. 800px).
   * No impacta a los consumidores existentes de uploadFiles.
   */
  const uploadFilesAndThumbs = async (
    files: File[],
    options?: { detailMax?: number; thumbMax?: number; quality?: number }
  ): Promise<{ full: string[]; thumb: string[] }> => {
    if (!supabaseEnabled || files.length === 0) return { full: [], thumb: [] }
    const supabase = getSupabaseClient()
    const storage = supabase.storage.from(supabaseStorageBucket)
    setUploading(true)
    const full: string[] = []
    const thumb: string[] = []
    const detailMax = options?.detailMax ?? 1600
    const thumbMax = options?.thumbMax ?? 800
    const quality = options?.quality ?? DEFAULT_COMPRESS_OPTIONS.quality
    try {
      let idx = 0
      for (const f of files) {
        // Detalle
        const fileDetail = await compressImage(f, { quality, maxWidth: detailMax, maxHeight: detailMax })
        const safeNameDetail = fileDetail.name.replace(/[^a-zA-Z0-9_.-]/g, '_')
        const keyDetail = `${new Date().getFullYear()}/${Date.now()}_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}_${safeNameDetail}`
        const { error: upDetail } = await storage.upload(keyDetail, fileDetail, {
          cacheControl: '31536000',
          contentType: fileDetail.type || f.type,
          upsert: false
        })
        if (upDetail) throw upDetail
        const { data: pubDetail } = storage.getPublicUrl(keyDetail)
        if (pubDetail?.publicUrl) full.push(pubDetail.publicUrl)

        // Miniatura
        const fileThumb = await compressImage(f, { quality, maxWidth: thumbMax, maxHeight: thumbMax })
        const safeNameThumb = fileThumb.name.replace(/[^a-zA-Z0-9_.-]/g, '_')
        const keyThumb = `${new Date().getFullYear()}/${Date.now()}_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}_${safeNameThumb}`
        const { error: upThumb } = await storage.upload(keyThumb, fileThumb, {
          cacheControl: '31536000',
          contentType: fileThumb.type || f.type,
          upsert: false
        })
        if (upThumb) throw upThumb
        const { data: pubThumb } = storage.getPublicUrl(keyThumb)
        if (pubThumb?.publicUrl) thumb.push(pubThumb.publicUrl)

        idx += 1
        setProgress(Math.round((idx / files.length) * 100))
      }
      return { full, thumb }
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  return { uploadFiles, uploadFilesAndThumbs, uploading, progress }
}
