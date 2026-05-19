export const BRAND_SLUGS: Record<string, string> = {
  'specialized': 'Specialized',
  'trek': 'Trek',
  'giant': 'Giant',
  'scott': 'Scott',
  'cervelo': 'Cervelo',
  'cannondale': 'Cannondale',
  'orbea': 'Orbea',
  'merida': 'Merida',
  'pinarello': 'Pinarello',
  'cube': 'Cube',
  'bmc': 'BMC',
  'canyon': 'Canyon',
  'bianchi': 'Bianchi',
  'santa-cruz': 'Santa Cruz',
  'colnago': 'Colnago',
}

export function brandSlugToName(slug: string): string | null {
  return BRAND_SLUGS[slug.toLowerCase()] ?? null
}

export function brandNameToSlug(name: string): string | null {
  const lower = name.toLowerCase()
  return Object.keys(BRAND_SLUGS).find(k => BRAND_SLUGS[k].toLowerCase() === lower) ?? null
}
