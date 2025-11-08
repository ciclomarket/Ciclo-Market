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
 * Compress an image client‑side y devuelve el archivo MÁS CHICO posible.
 * Intenta WebP primero; si no reduce tamaño, conserva el original.
 * Si WebP falla, intenta JPEG; si tampoco mejora, devuelve el original.
 */
export async function compressToWebp(input: File, opts: CompressOptions = {}): Promise<File> {
  if (!input || !(input instanceof File) || !input.type.startsWith('image/')) return input

  const options = { ...DEFAULTS, ...opts }

  // No comprimir imágenes ya pequeñas
  if (typeof input.size === 'number' && input.size > 0 && input.size <= (options.minSizeBytes || 0)) {
    return input
  }

  const imageUrl = URL.createObjectURL(input)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = imageUrl
    })

    const { naturalWidth: width, naturalHeight: height } = img
    if (!width || !height) return input

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

    // Encode a WebP (preferido)
    const webpBlob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/webp', options.quality)
    )
    const inputSize = input.size || 0
    if (webpBlob && webpBlob.size > 0 && (inputSize === 0 || webpBlob.size < inputSize)) {
      const outName = changeExtension(sanitizeName(input.name), 'webp')
      return new File([webpBlob], outName, { type: 'image/webp' })
    }

    // Fallback: intentar JPEG y comparar
    const jpegBlob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', Math.min(0.9, Math.max(0.6, options.quality)))
    )
    if (jpegBlob && jpegBlob.size > 0 && (inputSize === 0 || jpegBlob.size < inputSize)) {
      const outNameJpg = changeExtension(sanitizeName(input.name), 'jpg')
      return new File([jpegBlob], outNameJpg, { type: 'image/jpeg' })
    }

    // Si nada mejora el tamaño, conservar el original para máxima compatibilidad
    return input
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

// Nota: ya no renombramos extensiones si no cambiamos el contenido, para evitar confusiones
