export type SupportedCurrency = 'USD' | 'ARS'

export function computeDisplayAmount(value: number, currency: SupportedCurrency | undefined, fx: number) {
  if (!currency || currency === 'USD') return value
  return value * fx
}

export function formatListingPrice(
  value: number,
  currency: SupportedCurrency | undefined,
  format: (n: number) => string,
  fx: number
) {
  if (Number.isNaN(value)) return ''
  if (!currency) return format(value)
  const amount = computeDisplayAmount(value, currency, fx)
  const locale = currency === 'ARS' ? 'es-AR' : 'en-US'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}
