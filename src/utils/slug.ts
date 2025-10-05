export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildListingSlug({
  id,
  title,
  brand,
  model,
  category
}: {
  id: string
  title: string
  brand?: string | null
  model?: string | null
  category?: string | null
}): string {
  const parts = [brand, model, category]
    .map((value) => (value ?? '').trim())
    .filter((value) => value.length > 0)

  const baseSource = parts.length > 0 ? parts.join(' ') : title || 'listing'
  const base = slugify(baseSource) || 'listing'
  return `${base}--${id}`
}

export function extractListingId(slugOrId: string): string {
  if (!slugOrId) return ''
  const delimiter = '--'
  const idx = slugOrId.lastIndexOf(delimiter)
  if (idx === -1) return slugOrId
  return slugOrId.slice(idx + delimiter.length)
}
