
import { useState } from 'react'
import { getSupabaseClient, supabaseEnabled, supabaseStorageBucket } from '../services/supabase'

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
  if (!file.type.startsWith('image/')) return file

  const options = { ...DEFAULT_COMPRESS_OPTIONS, ...opts }
  if (file.size <= options.minSizeBytes) return file

  // If HEIC/HEIF: attempt real conversion to JPEG using heic2any (loaded on demand)
  if (/image\/(heic|heif)/i.test(file.type)) {
    try {
      const mod = await import('heic2any')
      const heic2any = (mod as any).default || mod
      const converted = (await heic2any({ blob: file, toType: 'image/jpeg', quality: options.quality })) as Blob
      const name = file.name.replace(/\.(heic|heif)$/i, '.jpg')
      return new File([converted], name, { type: 'image/jpeg' })
    } catch (err) {
      console.warn('[upload] HEIC→JPG conversion failed, using original file', err)
      // continue with generic path (likely will fail to decode in <img>)
    }
  }

  const imageUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = imageUrl
    })

    const { naturalWidth: width, naturalHeight: height } = image
    if (!width || !height) return file

    const widthRatio = options.maxWidth / width
    const heightRatio = options.maxHeight / height
    const scale = Math.min(1, widthRatio, heightRatio)

    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight)

    // For better OG compatibility, convert HEIC/HEIF/WEBP to JPEG
    const needsJpeg = /image\/(heic|heif|webp)/i.test(file.type)
    const mimeType = needsJpeg ? 'image/jpeg' : file.type

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType, options.quality)
    )

    if (!blob || blob.size === 0) return file

    // If compression results in bigger file, keep original
    if (blob.size >= file.size) return file

    const outName = /image\/(heic|heif|webp)/i.test(file.type)
      ? file.name.replace(/\.(heic|heif|webp)$/i, '.jpg')
      : file.name
    const outType = /image\/(heic|heif|webp)/i.test(file.type) ? 'image/jpeg' : blob.type
    const compressedFile = new File([blob], outName, { type: outType })
    return compressedFile
  } catch (err) {
    console.warn('Error compressing image, uploading original file instead', err)
    return file
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
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
  return { uploadFiles, uploading, progress }
}
