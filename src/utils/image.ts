export type CompressOptions = {
  quality?: number
  maxWidth?: number
  maxHeight?: number
  minSizeBytes?: number
}

const DEFAULTS: Required<CompressOptions> = {
  quality: 0.82,
  maxWidth: 1920,
  maxHeight: 1920,
  minSizeBytes: 200 * 1024,
}

/**
 * Compress an image in the browser and return a File in WebP when supported.
 * Falls back to JPEG if WebP encoding isn’t available.
 */
export async function compressToWebp(input: File, opts: CompressOptions = {}): Promise<File> {
  if (!input || !(input instanceof File) || !input.type.startsWith('image/')) return input

  const options = { ...DEFAULTS, ...opts }
  if (input.size <= options.minSizeBytes) return renameExtension(input, 'webp')

  const imageUrl = URL.createObjectURL(input)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = imageUrl
    })

    const { naturalWidth: width, naturalHeight: height } = img
    if (!width || !height) return renameExtension(input, 'webp')

    const widthRatio = options.maxWidth / width
    const heightRatio = options.maxHeight / height
    const scale = Math.min(1, widthRatio, heightRatio)

    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return renameExtension(input, 'webp')
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

    // Try WebP first, then fallback to JPEG
    let blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/webp', options.quality)
    )
    if (!blob) {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', options.quality))
    }
    if (!blob) return renameExtension(input, 'webp')

    // Keep compressed only if it’s smaller
    if (blob.size >= input.size) return renameExtension(input, 'webp')

    const ext = blob.type.includes('webp') ? 'webp' : 'jpg'
    const outName = changeExtension(sanitizeName(input.name), ext)
    return new File([blob], outName, { type: blob.type })
  } catch {
    return renameExtension(input, 'webp')
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function sanitizeName(name: string): string {
  return name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_.-]/g, '_')
}

function changeExtension(name: string, ext: string): string {
  return name.replace(/\.[^.]+$/, '') + `.${ext}`
}

function renameExtension(file: File, ext: string): File {
  const outName = changeExtension(sanitizeName(file.name), ext)
  return new File([file], outName, { type: file.type })
}

