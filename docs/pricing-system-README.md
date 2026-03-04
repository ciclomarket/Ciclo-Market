# Sistema de Pricing Database - Ciclo Market

Sistema completo para recolectar, almacenar y analizar precios de bicicletas de múltiples fuentes.

## 🏗️ Arquitectura

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  MercadoLibre   │     │  CicloMarket    │     │  Otras Fuentes  │
│   (Scraper)     │     │    (Sync)       │     │   (API/CSV)     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │    scraping_jobs (cola)   │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  pricingScraperService    │
                    │    (rate limiting)        │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │     price_listings        │
                    └─────────────┬─────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
┌────────▼────────┐    ┌──────────▼──────────┐   ┌────────▼────────┐
│  market_prices  │    │ price_analytics_    │   │  price_changes  │
│   (agregados)   │    │      daily          │   │   (histórico)   │
└─────────────────┘    └─────────────────────┘   └─────────────────┘
```

## 📊 Tablas Principales

### Catálogo
- `bike_models` - Modelos oficiales de bicicletas
- `bike_model_aliases` - Nombres alternativos para matching
- `product_categories` - Taxonomía de categorías

### Ingesta
- `scraping_sources` - Configuración de fuentes de datos
- `scraping_jobs` - Cola de jobs de scraping
- `scraping_logs` - Log detallado de requests
- `price_listings` - Cada publicación individual

### Normalización
- `attribute_mappings` - Mapeo de atributos por fuente
- `listing_matches` - Detección de duplicados

### Análisis
- `market_prices` - Precios promedio calculados
- `price_analytics_daily` - Métricas diarias
- `source_coverage` - Cobertura por fuente
- `price_changes` - Historial de cambios de precio

## 🚀 Instalación

### 1. Aplicar migraciones SQL

```bash
cd /Users/timon/MundoBike
psql $DATABASE_URL -f scripts/supabase_pricing_v2.sql
```

O desde el SQL Editor de Supabase:
```sql
\i scripts/supabase_pricing_v2.sql
```

### 2. Instalar dependencias

```bash
cd server
npm install zod
```

### 3. Configurar variables de entorno

```bash
# server/.env
PRICING_SCRAPER_ENABLED=true

# Opcional: rate limits personalizados
MERCADOLIBRE_RATE_LIMIT=10  # requests por minuto
FACEBOOK_RATE_LIMIT=5
```

### 4. Iniciar el servidor

```bash
npm run server
```

## 📡 API Endpoints

### Ingesta de Datos

```http
POST /api/v1/pricing/ingest
Content-Type: application/json

{
  "source": "mercadolibre",
  "items": [
    {
      "external_id": "MLA123456",
      "title": "Specialized Tarmac SL8",
      "price": 4500000,
      "currency": "ARS",
      "condition": "new",
      "url": "https://..."
    }
  ]
}
```

### Sugerencia de Precio

```http
GET /api/v1/pricing/suggest?brand=Specialized&model=Tarmac&year=2024&condition=new
```

Respuesta:
```json
{
  "suggestion": {
    "confidence": "high",
    "price_ars": 4500000,
    "range": {
      "low": 3800000,
      "mid": 4500000,
      "high": 5200000
    }
  },
  "sources": {
    "mercadolibre": { "count": 12, "avg_price": 4480000 },
    "ciclomarket": { "count": 3, "avg_price": 4600000 }
  }
}
```

### Dashboard de Cobertura

```http
GET /api/v1/pricing/coverage
```

### Listar Modelos

```http
GET /api/v1/pricing/models?brand=Trek&category=mountain
```

### Jobs de Scraping (Admin)

```http
POST /api/v1/pricing/jobs
{
  "source_id": "uuid",
  "job_type": "full_sync",
  "params": { "searchQueries": ["bicicleta"] }
}

GET /api/v1/pricing/jobs?status=pending

POST /api/v1/pricing/recalculate
```

## ⚙️ Jobs Automáticos

Los jobs se ejecutan automáticamente según schedule:

| Job | Frecuencia | Descripción |
|-----|------------|-------------|
| `processScrapingJobs` | Cada 5 min | Procesa jobs pendientes de la cola |
| `recalculateMarketPrices` | Diario 2 AM | Recalcula promedios y tendencias |
| `detectExpiredListings` | Cada 12h | Marca listings no verificados |
| `cleanupOldLogs` | Domingo 3 AM | Limpia logs de >30 días |

## 🔧 Uso Manual

### Crear un job de scraping

```javascript
const { createScrapingJob } = require('./services/pricingScraperService')

await createScrapingJob({
  sourceId: 'uuid-mercadolibre',
  jobType: 'search',
  params: {
    urls: ['https://listado.mercadolibre.com.ar/bicicletas']
  },
  priority: 5
})
```

### Procesar jobs pendientes

```javascript
const { processPendingJobs } = require('./services/pricingScraperService')

const results = await processPendingJobs({ limit: 10 })
```

### Recalcular precios

```sql
SELECT recalculate_market_prices_enhanced();
```

O via API:
```bash
curl -X POST http://localhost:4000/api/v1/pricing/recalculate
```

## 📝 Agregar Nueva Fuente

1. Insertar en `scraping_sources`:
```sql
INSERT INTO scraping_sources (name, display_name, type, config)
VALUES ('nuevafuente', 'Nueva Fuente', 'marketplace', '{"rate_limit_per_minute": 10}');
```

2. Crear handler en `pricingScraperService.js`:
```javascript
case 'nuevafuente':
  return executeNuevaFuenteJob(job)
```

3. Implementar `executeNuevaFuenteJob()` con el scraping específico.

## 📈 Monitoreo

### Métricas clave

```sql
-- Listings por fuente hoy
SELECT source, COUNT(*) 
FROM price_listings 
WHERE DATE(scraped_at) = CURRENT_DATE 
GROUP BY source;

-- Jobs fallados últimas 24h
SELECT source_id, error_message, created_at
FROM scraping_jobs
WHERE status = 'failed' 
  AND created_at > NOW() - INTERVAL '24 hours';

-- Cobertura por modelo
SELECT 
  bm.brand, 
  bm.model,
  COUNT(pl.id) as listings,
  AVG(pl.price) as avg_price
FROM bike_models bm
LEFT JOIN price_listings pl ON pl.bike_model_id = bm.id
GROUP BY bm.id;
```

## 🛡️ Rate Limiting

Cada fuente tiene su propio rate limiter:

- **MercadoLibre**: 10 req/min (tiene anti-bot)
- **Facebook**: 5 req/min (requiere auth)
- **Tiendas**: 20 req/min

## 🔒 Seguridad

- RLS habilitado en todas las tablas
- Lectura pública para datos de precios
- Escritura restringida a admin/moderador
- `price_listings` acepta datos de fuentes configuradas

## 🐛 Troubleshooting

### Jobs no se ejecutan
```sql
-- Ver jobs pendientes
SELECT * FROM scraping_jobs WHERE status = 'pending' ORDER BY priority, scheduled_at;

-- Ver si el scheduler está activo
SHOW PRICING_SCRAPER_ENABLED;
```

### Datos no aparecen en market_prices
```sql
-- Verificar que hay listings activos
SELECT bike_model_id, COUNT(*) FROM price_listings WHERE status = 'active' GROUP BY bike_model_id;

-- Ejecutar recálculo manual
SELECT recalculate_market_prices_enhanced();
```

### Rate limiting too estricto
```sql
-- Ajustar config de fuente
UPDATE scraping_sources 
SET config = jsonb_set(config, '{rate_limit_per_minute}', '15')
WHERE name = 'mercadolibre';
```

## 📚 Documentación Relacionada

- `pricing-database-v2.md` - Diseño detallado
- `supabase_pricing_v2.sql` - Migraciones
- `AGENTS.md` - Convenciones del proyecto
