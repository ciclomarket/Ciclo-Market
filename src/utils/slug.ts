export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildListingSlug({ id, title }: { id: string; title: string }): string {
  const base = slugify(title || 'listing') || 'listing'
  return `${base}--${id}`
}

export function extractListingId(slugOrId: string): string {
  if (!slugOrId) return ''
  const delimiter = '--'
  const idx = slugOrId.lastIndexOf(delimiter)
  if (idx === -1) return slugOrId
  return slugOrId.slice(idx + delimiter.length)
}
