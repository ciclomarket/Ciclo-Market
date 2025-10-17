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

    // Encode to WebP (preferido). Si falla, intentamos JPEG; si aún así falla, devolvemos el original.
    const webpBlob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/webp', options.quality)
    )
    if (!webpBlob) {
      // Fallback poco probable
      const jpegBlob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', options.quality)
      )
      if (!jpegBlob) return input
      // Aun si el JPEG resultara más grande, preferimos retornarlo comprimido
      const outNameJpg = changeExtension(sanitizeName(input.name), 'jpg')
      return new File([jpegBlob], outNameJpg, { type: 'image/jpeg' })
    }

    const outName = changeExtension(sanitizeName(input.name), 'webp')
    return new File([webpBlob], outName, { type: 'image/webp' })
  } catch {
    return input
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
  // Mantiene el contenido original; NO cambia el tipo. Evitar usar este camino para forzar webp.
  return new File([file], outName, { type: file.type })
}
