/**
 * Pricing algorithm (heurístico) para tasación de bicicletas usadas.
 *
 * Objetivo: dar una estimación razonable tipo "blue book" basada en:
 * - Depreciación inicial al salir de la tienda.
 * - Depreciación anual con curva logarítmica (cae más rápido al principio y se aplana con los años).
 * - Ajuste por "tier" de marca (premium retiene más valor).
 * - Ajuste por estado/condición.
 *
 * Nota: Este módulo NO usa datos de mercado; es un baseline configurable.
 */

const DEFAULT_PRICING_CONFIG = Object.freeze({
  /**
   * Caída inicial inmediata al salir de la tienda (15–20%).
   * Ej: 0.18 = -18%.
   */
  INITIAL_DROP_RATE: 0.18,

  /**
   * "Pérdida adicional" esperada del año 0 al año 1 (5–10%) sobre el valor ya con caída inicial.
   * Se usa para calibrar la curva logarítmica.
   */
  YEAR1_ADDITIONAL_DROP_RATE: 0.08,

  /**
   * Prima de retención para marcas premium vs budget (10% más valor).
   * Se aplica como multiplicador.
   */
  PREMIUM_BRAND_MULTIPLIER: 1.1,
  BUDGET_BRAND_MULTIPLIER: 1.0,

  /**
   * Factores por condición.
   * - excellent: 100% del valor depreciado
   * - good: 90%
   * - fair: 75%
   * - new: ligeramente por encima de excellent (configurable); igualmente aplica la depreciación inicial.
   */
  CONDITION_MULTIPLIERS: Object.freeze({
    new: 1.05,
    excellent: 1.0,
    good: 0.9,
    fair: 0.75,
  }),

  /**
   * Rango alrededor del estimado (±5%).
   */
  RANGE_PCT: 0.05,

  /**
   * Piso y techo relativos al MSRP original para evitar resultados absurdos.
   * - FLOOR: evita que bicis muy viejas se vayan a ~0.
   * - CEILING: evita superar MSRP.
   */
  FLOOR_OF_ORIGINAL: 0.05,
  CEILING_OF_ORIGINAL: 1.0,

  /**
   * Redondeo del output.
   * - 1: redondea a dólares enteros
   * - 0.01: redondea a centavos
   */
  ROUND_TO: 1,
})

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function roundTo(value, step) {
  const s = Number(step)
  if (!Number.isFinite(s) || s <= 0) return value
  return Math.round(value / s) * s
}

function assertEnum(value, allowed, label) {
  if (allowed.includes(value)) return
  throw new TypeError(`${label} inválido: "${value}". Valores permitidos: ${allowed.join(', ')}`)
}

function resolveCurrentYear(config) {
  const explicit = Number(config?.CURRENT_YEAR)
  if (Number.isFinite(explicit) && explicit > 1900) return Math.floor(explicit)
  return new Date().getFullYear()
}

/**
 * Convierte una "caída del año 1" (sobre el valor post-caída-inicial) en un exponente k para:
 *   multiplier(age) = (1 + age)^(-k)
 *
 * Propiedad: para age=1 -> multiplier(1) = 2^(-k) => drop = 1 - 2^(-k)
 */
function deriveLogCurveExponent(year1AdditionalDropRate) {
  const r = clamp(Number(year1AdditionalDropRate), 0, 0.95)
  if (r === 0) return 0
  return Math.log(1 / (1 - r)) / Math.log(2)
}

function depreciatedValueNoCondition(originalPriceUsd, ageYears, config) {
  const base = Number(originalPriceUsd)
  const age = Math.max(0, Math.floor(Number(ageYears) || 0))

  const initialDropRate = clamp(Number(config.INITIAL_DROP_RATE), 0, 0.9)
  const afterInitial = base * (1 - initialDropRate)

  const k = deriveLogCurveExponent(config.YEAR1_ADDITIONAL_DROP_RATE)
  const curveMultiplier = k === 0 ? 1 : (1 + age) ** (-k)

  return afterInitial * curveMultiplier
}

function brandMultiplier(brandTier, config) {
  if (brandTier === 'premium') return Number(config.PREMIUM_BRAND_MULTIPLIER) || 1
  if (brandTier === 'budget') return Number(config.BUDGET_BRAND_MULTIPLIER) || 1
  return 1
}

/**
 * Calcula la tasación estimada y datos auxiliares para UI.
 *
 * @param {number} originalPriceUsd MSRP aproximado en USD cuando era nueva
 * @param {number} year Año del modelo
 * @param {'new'|'excellent'|'good'|'fair'} condition Estado de la bici
 * @param {'premium'|'budget'} brandTier Tier de marca
 * @param {object} [configOverride] Override parcial de DEFAULT_PRICING_CONFIG
 * @returns {{
 *   estimatedPrice: number,
 *   priceRange: { min: number, max: number },
 *   depreciationGraphData: Array<[number, number]>
 * }}
 */
function calculateBikePrice(originalPriceUsd, year, condition, brandTier, configOverride = {}) {
  const config = { ...DEFAULT_PRICING_CONFIG, ...(configOverride || {}) }

  const base = Number(originalPriceUsd)
  if (!Number.isFinite(base) || base <= 0) {
    throw new TypeError(`originalPriceUsd inválido: "${originalPriceUsd}"`)
  }

  const modelYear = Math.floor(Number(year))
  if (!Number.isFinite(modelYear) || modelYear < 1900 || modelYear > 3000) {
    throw new TypeError(`year inválido: "${year}"`)
  }

  assertEnum(condition, ['new', 'excellent', 'good', 'fair'], 'condition')
  assertEnum(brandTier, ['premium', 'budget'], 'brandTier')

  const currentYear = resolveCurrentYear(config)
  const ageYears = Math.max(0, currentYear - modelYear)

  const conditionMult = Number(config.CONDITION_MULTIPLIERS?.[condition])
  const tierMult = brandMultiplier(brandTier, config)

  const valueBase = depreciatedValueNoCondition(base, ageYears, config)
  let estimated = valueBase * tierMult * conditionMult

  const floor = base * clamp(Number(config.FLOOR_OF_ORIGINAL), 0, 1)
  const ceiling = base * clamp(Number(config.CEILING_OF_ORIGINAL), 0, 5)
  estimated = clamp(estimated, floor, ceiling)

  estimated = roundTo(estimated, config.ROUND_TO)

  const rangePct = clamp(Number(config.RANGE_PCT), 0, 0.5)
  const min = roundTo(estimated * (1 - rangePct), config.ROUND_TO)
  const max = roundTo(estimated * (1 + rangePct), config.ROUND_TO)

  const depreciationGraphData = []
  for (let y = modelYear; y <= currentYear; y += 1) {
    const age = y - modelYear
    const v = depreciatedValueNoCondition(base, age, config) * tierMult * conditionMult
    const vv = roundTo(clamp(v, floor, ceiling), config.ROUND_TO)
    depreciationGraphData.push([y, vv])
  }

  return {
    estimatedPrice: estimated,
    priceRange: { min, max },
    depreciationGraphData,
  }
}

module.exports = { calculateBikePrice, DEFAULT_PRICING_CONFIG }

