'use strict'

// Extrae los datos de una publicación externa (texto + fotos) usando Claude
// y los devuelve en el formato del wizard de publicación (src/pages/CreateListing.tsx).

const AnthropicModule = require('@anthropic-ai/sdk')

const Anthropic = AnthropicModule.default || AnthropicModule

const DEFAULT_MODEL = 'claude-opus-5-5'
const MAX_IMAGES = 6

// Copias de las opciones del front. Si cambian allá, actualizar acá:
// src/constants/catalog.ts, src/components/wizard/StepSpecs.tsx, src/constants/locations.ts
const BIKE_CATEGORIES = ['Ruta', 'MTB', 'Gravel', 'Urbana', 'Fixie', 'E-Bike', 'Niños', 'Pista', 'Triatlón']
const FRAME_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '48', '50', '52', '54', '56', '58', 'Niños', 'Talle único']
const WHEEL_SIZES = ['700c', '650b', '29"', '27.5"', '26"', '24"', '22"', '20"', '18"', '16"', '14"', '12"']
const CONDITIONS = ['Nuevo', 'Como nuevo', 'Usado']
const MATERIALS = ['Aluminio', 'Carbono', 'Aluminio + Carbono', 'Titanio', 'Acero', 'Otro']
const BRAKE_TYPES = ['Disco hidráulico', 'Disco mecánico', 'Herradura']
const DRIVETRAINS = [
  'Shimano Claris', 'Shimano Sora', 'Shimano Tiagra', 'Shimano 105', 'Shimano 105 Di2', 'Shimano Ultegra', 'Shimano Ultegra Di2', 'Shimano Dura‑Ace', 'Shimano Dura‑Ace Di2',
  'Shimano GRX 400', 'Shimano GRX 600', 'Shimano GRX 800', 'Shimano GRX Di2',
  'Shimano Deore', 'Shimano Deore XT', 'Shimano SLX', 'Shimano XTR', 'Shimano XT M8100', 'Shimano XTR M9100',
  'SRAM Apex', 'SRAM Apex eTap AXS', 'SRAM Rival', 'SRAM Rival eTap AXS', 'SRAM Force', 'SRAM Force eTap AXS', 'SRAM Red', 'SRAM Red eTap AXS',
  'SRAM SX Eagle', 'SRAM NX Eagle', 'SRAM GX Eagle', 'SRAM X01 Eagle', 'SRAM XX1 Eagle', 'SRAM GX Eagle Transmission', 'SRAM X0 Transmission', 'SRAM XX Transmission',
  'Campagnolo Centaur', 'Campagnolo Potenza', 'Campagnolo Chorus', 'Campagnolo Record', 'Campagnolo Super Record', 'Campagnolo Super Record EPS', 'Campagnolo Ekar',
]
const PROVINCES = [
  'Buenos Aires', 'Ciudad Autónoma de Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos',
  'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis',
  'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
]

const withUnknown = (values) => [...values, '']

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'is_bike', 'category', 'brand', 'model', 'year', 'condition', 'material', 'frameSize', 'wheelSize',
    'drivetrain', 'drivetrainOther', 'brakeType', 'priceAmount', 'priceCurrency', 'province', 'city',
    'description', 'extras', 'sellerFirstName', 'missing',
  ],
  properties: {
    is_bike: { type: 'boolean', description: 'true si lo que se vende es una bicicleta completa' },
    category: { type: 'string', enum: withUnknown(BIKE_CATEGORIES) },
    brand: { type: 'string' },
    model: { type: 'string' },
    year: { type: 'string', description: 'Año de 4 dígitos o vacío' },
    condition: { type: 'string', enum: withUnknown(CONDITIONS) },
    material: { type: 'string', enum: withUnknown(MATERIALS) },
    frameSize: { type: 'string', enum: withUnknown(FRAME_SIZES) },
    wheelSize: { type: 'string', enum: withUnknown(WHEEL_SIZES) },
    drivetrain: { type: 'string', enum: withUnknown(DRIVETRAINS), description: 'Grupo exacto de la lista, o vacío' },
    drivetrainOther: { type: 'string', description: 'Grupo en texto libre si no coincide con la lista (ej: "Shimano Altus 3x8")' },
    brakeType: { type: 'string', enum: withUnknown(BRAKE_TYPES) },
    priceAmount: { type: 'number', description: 'Precio numérico sin separadores; 0 si no figura' },
    priceCurrency: { type: 'string', enum: ['USD', 'ARS'] },
    province: { type: 'string', enum: withUnknown(PROVINCES) },
    city: { type: 'string' },
    description: { type: 'string' },
    extras: { type: 'string', description: 'Upgrades o accesorios incluidos, en una línea' },
    sellerFirstName: { type: 'string', description: 'Nombre de pila del vendedor si aparece, o vacío' },
    missing: { type: 'array', items: { type: 'string' }, description: 'Datos importantes que no se pudieron determinar' },
  },
}

const SYSTEM_PROMPT = `Sos un asistente de Ciclo Market, un marketplace de bicicletas de Argentina.
Te pasan el texto y las fotos de una publicación que una persona hizo en otro sitio (Facebook Marketplace, MercadoLibre, Instagram, etc.).
Tu trabajo es completar los campos de una publicación de Ciclo Market con esos datos.

Reglas:
- Usá solo información que esté en el texto o que se vea claramente en las fotos (por ejemplo, la marca en el cuadro o el grupo en el cambio trasero). Si no estás seguro, dejá el campo vacío y agregalo a "missing".
- En los campos con lista de opciones, elegí la opción exacta o dejá vacío.
- Precio: en Argentina los precios en dólares suelen decir "USD", "u$s", "dólares" o ser montos chicos (ej: 850). Montos grandes sin moneda (ej: 1.200.000) son pesos (ARS).
- Ubicación: "CABA" o "Capital Federal" es "Ciudad Autónoma de Buenos Aires". Barrios del conurbano (ej: Quilmes, San Isidro) son provincia "Buenos Aires" con esa ciudad.
- "description": reescribí la descripción del vendedor en español rioplatense, clara y en primera persona, de 2 a 5 oraciones. No inventes datos. No incluyas teléfonos, emails, links, ni menciones a otras plataformas.
- Nunca incluyas datos de contacto en ningún campo.`

let cachedClient = null

function isExtractorConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

function getClient() {
  if (!cachedClient) cachedClient = new Anthropic()
  return cachedClient
}

function resolveModel() {
  return (process.env.PREFILL_AI_MODEL || DEFAULT_MODEL).trim()
}

/**
 * @param {{ text: string, imageUrls: string[] }} input
 * @returns {Promise<object>} campos extraídos (ver EXTRACTION_SCHEMA)
 */
async function extractListingFromSource({ text, imageUrls }) {
  const model = resolveModel()
  const images = (imageUrls || []).slice(0, MAX_IMAGES)

  const content = [
    ...images.map((url) => ({ type: 'image', source: { type: 'url', url } })),
    {
      type: 'text',
      text: `Texto de la publicación original:\n"""\n${text || '(sin texto, usá solo las fotos)'}\n"""`,
    },
  ]

  const params = {
    model,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: EXTRACTION_SCHEMA },
    },
  }

  // Fallback del lado del servidor si el modelo principal rechaza el pedido (solo Opus 5.5).
  const response = model === DEFAULT_MODEL
    ? await getClient().beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await getClient().messages.create(params)

  if (response.stop_reason === 'refusal') {
    const err = new Error('ai_refusal')
    err.code = 'ai_refusal'
    throw err
  }
  if (response.stop_reason === 'max_tokens') {
    const err = new Error('ai_truncated')
    err.code = 'ai_truncated'
    throw err
  }

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock) {
    const err = new Error('ai_empty_response')
    err.code = 'ai_empty_response'
    throw err
  }
  return JSON.parse(textBlock.text)
}

/**
 * Convierte la extracción al formato de borrador del wizard (DraftPayload en CreateListing.tsx).
 */
function toWizardDraft(extracted, images) {
  const e = extracted || {}
  const price = Number(e.priceAmount)
  const city = String(e.city || '').trim()
  return {
    mainCategory: 'Bicicletas',
    category: e.category || '',
    brand: String(e.brand || '').trim(),
    model: String(e.model || '').trim(),
    year: /^\d{4}$/.test(String(e.year || '')) ? String(e.year) : '',
    condition: e.condition || '',
    material: e.material || '',
    frameSize: e.frameSize || '',
    wheelSize: e.wheelSize || '',
    drivetrain: e.drivetrain || (e.drivetrainOther ? 'Otro' : ''),
    drivetrainOther: e.drivetrain ? '' : String(e.drivetrainOther || '').trim(),
    brakeType: e.brakeType || '',
    description: String(e.description || '').trim(),
    extras: String(e.extras || '').trim(),
    images: Array.isArray(images) ? images.slice(0, 12) : [],
    priceCurrency: e.priceCurrency === 'ARS' ? 'ARS' : 'USD',
    priceInput: Number.isFinite(price) && price > 0 ? String(Math.round(price)) : '',
    province: e.province || '',
    // La ciudad se valida contra la lista de la provincia en el front (/p/:token).
    city,
  }
}

module.exports = {
  extractListingFromSource,
  isExtractorConfigured,
  toWizardDraft,
}
