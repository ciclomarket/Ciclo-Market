export type SupportedCurrency = 'USD' | 'ARS'

export function formatListingPrice(
  value: number,
  currency: SupportedCurrency | undefined,
  format: (n: number) => string,
  fx: number
) {
  if (Number.isNaN(value)) return ''
  if (!currency) return format(value)
  const locale = currency === 'ARS' ? 'es-AR' : 'en-US'
  const amount = value
  const grouped = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(amount)
  return `${currency} $ ${grouped}`
}
