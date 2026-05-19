export const PROVINCIA_SLUGS: Record<string, string> = {
  'buenos-aires': 'Buenos Aires',
  'cordoba': 'Córdoba',
  'caba': 'Ciudad Autónoma de Buenos Aires',
  'entre-rios': 'Entre Ríos',
  'santa-fe': 'Santa Fe',
  'mendoza': 'Mendoza',
  'san-juan': 'San Juan',
  'misiones': 'Misiones',
  'la-rioja': 'La Rioja',
  'chaco': 'Chaco',
  'neuquen': 'Neuquén',
  'catamarca': 'Catamarca',
  'la-pampa': 'La Pampa',
  'tucuman': 'Tucumán',
  'rio-negro': 'Río Negro',
  'san-luis': 'San Luis',
}

export function provinciaSlugToName(slug: string): string | null {
  return PROVINCIA_SLUGS[slug.toLowerCase()] ?? null
}
