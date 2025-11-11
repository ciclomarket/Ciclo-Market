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
  if (!(input instanceof File)) return input

  const options = { ...DEFAULTS, ...opts }

  let workingFile = input

  if (isHeicFile(workingFile)) {
    const converted = await convertHeicToJpeg(workingFile, options.quality)
    if (converted) {
      workingFile = converted
    }
  }

  const mime = (workingFile.type || '').toLowerCase()
  if (!mime.startsWith('image/')) return workingFile

  // No comprimir imágenes ya pequeñas
  if (typeof workingFile.size === 'number' && workingFile.size > 0 && workingFile.size <= (options.minSizeBytes || 0)) {
    return workingFile
  }

  const imageUrl = URL.createObjectURL(workingFile)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = imageUrl
    })

    const { naturalWidth: width, naturalHeight: height } = img
    if (!width || !height) return workingFile

    const widthRatio = options.maxWidth / width
    const heightRatio = options.maxHeight / height
    const scale = Math.min(1, widthRatio, heightRatio)

    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return workingFile
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

    // Encode a WebP (preferido)
    const webpBlob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/webp', options.quality)
    )
    const inputSize = workingFile.size || 0
    if (webpBlob && webpBlob.size > 0 && (inputSize === 0 || webpBlob.size < inputSize)) {
      const outName = changeExtension(sanitizeName(workingFile.name || 'image'), 'webp')
      return new File([webpBlob], outName, { type: 'image/webp' })
    }

    // Fallback: intentar JPEG y comparar
    const jpegBlob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', Math.min(0.9, Math.max(0.6, options.quality)))
    )
    if (jpegBlob && jpegBlob.size > 0 && (inputSize === 0 || jpegBlob.size < inputSize)) {
      const outNameJpg = changeExtension(sanitizeName(workingFile.name || 'image'), 'jpg')
      return new File([jpegBlob], outNameJpg, { type: 'image/jpeg' })
    }

    // Si nada mejora el tamaño, conservar el original para máxima compatibilidad
    return workingFile
  } catch {
    return workingFile
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

type Heic2AnyFn = (options: { blob: Blob; toType: string; quality?: number }) => Promise<Blob | Blob[]>

function isHeicFile(file: File): boolean {
  const type = (file.type || '').toLowerCase()
  if (type.includes('heic') || type.includes('heif')) return true
  const name = (file.name || '').toLowerCase()
  return name.endsWith('.heic') || name.endsWith('.heif')
}

async function convertHeicToJpeg(file: File, quality: number): Promise<File | null> {
  try {
    const mod = await import('heic2any')
    const heic2any = (mod as unknown as { default?: unknown }).default ?? mod
    if (typeof heic2any !== 'function') return null
    const result = await (heic2any as Heic2AnyFn)({
      blob: file,
      toType: 'image/jpeg',
      quality: clampQuality(quality),
    })
    const blob = Array.isArray(result) ? result[0] : result
    if (!(blob instanceof Blob)) return null
    const outName = changeExtension(sanitizeName(file.name || 'foto'), 'jpg')
    return new File([blob], outName, { type: 'image/jpeg' })
  } catch {
    return null
  }
}

function clampQuality(raw?: number): number {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return DEFAULTS.quality
  return Math.min(1, Math.max(0.4, raw))
}

function sanitizeName(name: string): string {
  return name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_.-]/g, '_')
}

function changeExtension(name: string, ext: string): string {
  return name.replace(/\.[^.]+$/, '') + `.${ext}`
}

// Nota: ya no renombramos extensiones si no cambiamos el contenido, para evitar confusiones
