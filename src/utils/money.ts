export type MoneyParseOptions = {
  /**
   * Cuando es `true`, permite decimales (ej: 10.5 o 10,5).
   * Si es `false`, se redondea al entero más cercano.
   */
  allowDecimals?: boolean
}

/**
 * Parsea inputs humanos de dinero para AR/US (ej: "10.000", "10,000", "10.000,50", "10,000.50").
 * Devuelve `null` si no se puede parsear.
 */
export function parseMoneyInput(raw: unknown, options: MoneyParseOptions = {}): number | null {
  if (raw == null) return null
  let text = String(raw).trim()
  if (!text) return null

  // Mantener solo dígitos, separadores y signo.
  text = text.replace(/[^\d.,-]/g, '')
  if (!text) return null

  const lastDot = text.lastIndexOf('.')
  const lastComma = text.lastIndexOf(',')
  const hasDot = lastDot !== -1
  const hasComma = lastComma !== -1

  let decimalSep: '.' | ',' | null = null
  let thousandsSep: '.' | ',' | null = null

  const digitsAfter = (idx: number) => (idx >= 0 ? (text.length - idx - 1) : 0)

  if (hasDot && hasComma) {
    // El separador que aparece más a la derecha suele ser el decimal.
    if (lastComma > lastDot) {
      decimalSep = ','
      thousandsSep = '.'
    } else {
      decimalSep = '.'
      thousandsSep = ','
    }
  } else if (hasDot) {
    const after = digitsAfter(lastDot)
    // "10.000" => miles, "10.5"/"10.50" => decimal
    if (after === 3 && text.length > 4) {
      thousandsSep = '.'
    } else {
      decimalSep = '.'
    }
  } else if (hasComma) {
    const after = digitsAfter(lastComma)
    // "10,000" => miles, "10,5"/"10,50" => decimal
    if (after === 3 && text.length > 4) {
      thousandsSep = ','
    } else {
      decimalSep = ','
    }
  }

  let normalized = text

  // Si no hay definición de miles pero hay múltiples separadores iguales,
  // tratarlos como miles excepto el último.
  const stripAllButLast = (sep: '.' | ',') => {
    const parts = normalized.split(sep)
    if (parts.length <= 2) return
    normalized = parts.slice(0, -1).join('') + sep + parts[parts.length - 1]
  }

  if (!thousandsSep && decimalSep) {
    stripAllButLast(decimalSep)
  }

  if (thousandsSep) {
    normalized = normalized.replaceAll(thousandsSep, '')
  }

  if (decimalSep) {
    // Reemplazar el último separador decimal por '.'
    const idx = normalized.lastIndexOf(decimalSep)
    if (idx !== -1) {
      normalized = normalized.slice(0, idx).replaceAll(decimalSep, '') + '.' + normalized.slice(idx + 1)
    }
  }

  // Evitar casos como "-" o ".".
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return null

  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  if (options.allowDecimals) return n
  return Math.round(n)
}

