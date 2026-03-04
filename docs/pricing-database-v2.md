# Pricing Database V2 - Base de Datos de Precios Argentina

## Visión
Crear la base de datos de precios de bicicletas más completa de Argentina, combinando datos de Ciclo Market con fuentes externas (MercadoLibre, Facebook Marketplace, tiendas online, etc.) para ofrecer:
- Estimaciones de precio precisas
- Tendencias de mercado
- Alertas de precios
- Análisis comparativo entre fuentes

---

## Arquitectura de Datos

### 1. Catálogo Centralizado

#### `bike_models` (ya existe)
Catálogo maestro de modelos de bicicletas.

```sql
-- Campos existentes + nuevos propuestos
- id UUID PRIMARY KEY
- brand VARCHAR(100) NOT NULL
- model VARCHAR(200) NOT NULL
- category VARCHAR(50) -- 'mountain', 'road', 'urban', 'gravel', etc.
- subcategory VARCHAR(100) -- 'xc', 'trail', 'enduro', 'downhill', etc.
- frame_material VARCHAR(50) -- 'aluminum', 'carbon', 'steel', 'titanium'
- wheel_size VARCHAR(20) -- '29', '27.5', '26', '700c'
- original_msrp_usd INTEGER -- Precio original del fabricante
- year_released INTEGER
- year_discontinued INTEGER
- is_popular BOOLEAN -- Para destacar modelos comunes
- variants JSONB -- Configuraciones de fábrica (colores, tamaños, componentes)
```

#### `bike_model_aliases` (NUEVA)
Mapea nombres alternativos/errores comunes a modelos oficiales.

```sql
CREATE TABLE bike_model_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bike_model_id UUID REFERENCES bike_models(id) ON DELETE CASCADE,
  alias VARCHAR(200) NOT NULL, -- "Tarmac SL8", "Tarmac SL 8", "Specialized Tarmac"
  source VARCHAR(50), -- de dónde viene el alias
  match_score DECIMAL(3,2), -- qué tan confiable es (0.00-1.00)
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(alias, bike_model_id)
);
```

#### `product_categories` (NUEVA)
Taxonomía normalizada de categorías.

```sql
CREATE TABLE product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  parent_id UUID REFERENCES product_categories(id),
  level INTEGER DEFAULT 0, -- 0=root, 1=bici, 2=mtb, 3=xc
  metadata JSONB, -- atributos esperados para esta categoría
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### 2. Ingesta de Datos

#### `price_listings` (ya existe, ampliada)
Registro individual de cada publicación encontrada.

```sql
-- Campos existentes
- id UUID PRIMARY KEY
- bike_model_id UUID REFERENCES bike_models
- source VARCHAR(50) NOT NULL -- 'ciclomarket', 'mercadolibre', 'facebook', 'instagram', 'olx', 'bikeroos', 'etc'
- external_id VARCHAR(255) -- ID del marketplace
- external_url TEXT
- price INTEGER NOT NULL
- currency VARCHAR(3) DEFAULT 'ARS'
- price_usd INTEGER -- Calculado al momento del scrape
- year INTEGER -- Año de la bici
- condition VARCHAR(50) -- 'new', 'like_new', 'used', 'good', 'fair', 'poor'
- size VARCHAR(20) -- 'S', 'M', 'L', 'XL' o cms
- color VARCHAR(50)
- has_upgrades BOOLEAN -- ¿Tiene mejoras sobre stock?
- country VARCHAR(100) DEFAULT 'Argentina'
- province VARCHAR(100)
- city VARCHAR(100)
- listed_at TIMESTAMP -- Cuándo se publicó
- scraped_at TIMESTAMP DEFAULT NOW()
- sold_at TIMESTAMP -- Cuándo se vendió (si se detecta)
- status VARCHAR(20) DEFAULT 'active' -- 'active', 'sold', 'expired', 'deleted', 'paused'
- raw_data JSONB -- Datos crudos del scrape

-- NUEVOS CAMPOS
- seller_type VARCHAR(20) -- 'individual', 'store', 'unknown'
- seller_id_external VARCHAR(100) -- ID del vendedor en la fuente
- seller_rating DECIMAL(3,2) -- Rating del vendedor (si aplica)
- is_promoted BOOLEAN -- ¿Es publicidad pagada?
- views_count INTEGER -- Vistas (si disponible)
- location_coords POINT -- Lat/lng si disponible
- images_count INTEGER -- Cantidad de fotos
- description_hash VARCHAR(64) -- Hash para detectar cambios
- last_verified_at TIMESTAMP -- Última vez que confirmamos que sigue activa
- price_history JSONB -- [{date, price, currency}]
```

#### `scraping_sources` (NUEVA)
Configuración de cada fuente de datos.

```sql
CREATE TABLE scraping_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE, -- 'mercadolibre', 'facebook', 'olx'
  display_name VARCHAR(100) NOT NULL,
  base_url VARCHAR(255),
  type VARCHAR(20) NOT NULL, -- 'marketplace', 'store', 'aggregator', 'api'
  
  -- Configuración de scraping
  config JSONB DEFAULT '{}', -- {
                              --   "selectors": {...},
                              --   "rate_limit_per_minute": 10,
                              --   "requires_auth": false,
                              --   "anti_bot": true
                              -- }
  
  -- Estado
  is_active BOOLEAN DEFAULT true,
  is_reliable BOOLEAN DEFAULT true, -- ¿Confiamos en sus datos?
  
  -- Métricas
  last_scraped_at TIMESTAMP,
  total_listings_scraped INTEGER DEFAULT 0,
  avg_listings_per_day INTEGER,
  
  -- Notas legales/técnicas
  robots_txt_allowed BOOLEAN,
  terms_accepted BOOLEAN DEFAULT false,
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### `scraping_jobs` (NUEVA)
Jobs programados de scraping.

```sql
CREATE TABLE scraping_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES scraping_sources(id),
  job_type VARCHAR(50) NOT NULL, -- 'search', 'detail', 'update', 'full_sync'
  
  -- Parámetros del job
  params JSONB DEFAULT '{}', -- {
                             --   "query": "bicicleta mountain bike",
                             --   "category": "mlb1055",
                             --   "max_results": 1000,
                             --   "location": "Buenos Aires"
                             -- }
  
  -- Estado
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed', 'cancelled'
  priority INTEGER DEFAULT 5, -- 1=alta, 10=baja
  
  -- Scheduling
  scheduled_at TIMESTAMP, -- Cuándo debe ejecutarse
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  next_run_at TIMESTAMP, -- Para jobs recurrentes
  cron_expression VARCHAR(100), -- "0 */6 * * *" = cada 6 horas
  
  -- Resultados
  items_processed INTEGER DEFAULT 0,
  items_inserted INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  error_message TEXT,
  
  -- Metadata
  executed_by VARCHAR(50), -- 'scheduler', 'manual', 'webhook'
  ip_address INET,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scraping_jobs_status ON scraping_jobs(status);
CREATE INDEX idx_scraping_jobs_scheduled ON scraping_jobs(scheduled_at) WHERE status = 'pending';
```

#### `scraping_logs` (NUEVA)
Log detallado de cada request de scraping.

```sql
CREATE TABLE scraping_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES scraping_jobs(id),
  source_id UUID REFERENCES scraping_sources(id),
  
  -- Request
  url TEXT NOT NULL,
  method VARCHAR(10) DEFAULT 'GET',
  headers JSONB,
  
  -- Response
  status_code INTEGER,
  response_time_ms INTEGER,
  content_type VARCHAR(100),
  content_length INTEGER,
  
  -- Resultado
  success BOOLEAN,
  error_type VARCHAR(50), -- 'timeout', 'blocked', 'parse_error', 'rate_limited'
  error_message TEXT,
  
  -- Datos extraídos
  items_extracted INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scraping_logs_job ON scraping_logs(job_id);
CREATE INDEX idx_scraping_logs_created ON scraping_logs(created_at);
```

---

### 3. Normalización y Matching

#### `attribute_mappings` (NUEVA)
Mapea atributos de diferentes fuentes a valores normalizados.

```sql
CREATE TABLE attribute_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(50) NOT NULL, -- 'mercadolibre', 'facebook'
  attribute_type VARCHAR(50) NOT NULL, -- 'condition', 'category', 'brand', 'size'
  source_value VARCHAR(200) NOT NULL, -- "Nuevo", "Usado", "Como nuevo"
  normalized_value VARCHAR(200) NOT NULL, -- "new", "used", "like_new"
  confidence DECIMAL(3,2) DEFAULT 1.00,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(source, attribute_type, source_value)
);

-- Ejemplos de datos:
-- ('mercadolibre', 'condition', 'Nuevo', 'new', 1.0)
-- ('mercadolibre', 'condition', 'Usado', 'used', 1.0)
-- ('facebook', 'condition', 'Como nuevo', 'like_new', 0.9)
-- ('facebook', 'condition', 'Excelente estado', 'like_new', 0.8)
```

#### `listing_matches` (NUEVA)
Cuando detectamos que el mismo item está en múltiples fuentes.

```sql
CREATE TABLE listing_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_listing_id UUID REFERENCES price_listings(id),
  duplicate_listing_id UUID REFERENCES price_listings(id),
  match_confidence DECIMAL(3,2) NOT NULL, -- 0.00-1.00
  match_reason VARCHAR(100), -- 'same_external_id', 'same_title_similar_price', 'same_seller'
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(primary_listing_id, duplicate_listing_id)
);
```

---

### 4. Análisis y Agregaciones

#### `market_prices` (ya existe)
Precios promedio calculados por modelo/condición/año.

```sql
-- Campos existentes + nuevos
- id UUID PRIMARY KEY
- bike_model_id UUID REFERENCES bike_models
- country VARCHAR(100) DEFAULT 'Argentina'
- currency VARCHAR(3) DEFAULT 'ARS'
- condition VARCHAR(50)
- year INTEGER
- calculated_at TIMESTAMP DEFAULT NOW()
- sample_size INTEGER
- avg_price INTEGER
- median_price INTEGER
- min_price INTEGER
- max_price INTEGER
- std_deviation INTEGER
- p25 INTEGER -- Percentil 25
- p75 INTEGER -- Percentil 75
- trend_percent DECIMAL(5,2) -- vs mes anterior

-- NUEVOS CAMPOS
- samples_by_source JSONB -- {"ciclomarket": 15, "mercadolibre": 42, "facebook": 8}
- price_change_30d DECIMAL(5,2)
- price_change_90d DECIMAL(5,2)
- reliability_score DECIMAL(3,2) -- basado en sample_size y consistencia
- last_listing_at TIMESTAMP -- fecha del último listing incluido
```

#### `price_analytics_daily` (NUEVA)
Métricas diarias para tendencias.

```sql
CREATE TABLE price_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  bike_model_id UUID REFERENCES bike_models(id),
  
  -- Métricas del día
  listings_count INTEGER DEFAULT 0,
  new_listings INTEGER DEFAULT 0,
  sold_listings INTEGER DEFAULT 0,
  avg_price INTEGER,
  median_price INTEGER,
  min_price INTEGER,
  max_price INTEGER,
  
  -- Por fuente
  by_source JSONB, -- {"mercadolibre": {"count": 10, "avg_price": 500000}, ...}
  
  -- Por condición
  by_condition JSONB, -- {"new": {...}, "used": {...}}
  
  -- Por ubicación
  top_provinces JSONB, -- [{"province": "Buenos Aires", "count": 50, "avg_price": 450000}]
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(date, bike_model_id)
);

CREATE INDEX idx_price_analytics_date ON price_analytics_daily(date);
CREATE INDEX idx_price_analytics_model ON price_analytics_daily(bike_model_id);
```

#### `source_coverage` (NUEVA)
Métricas de cobertura por fuente.

```sql
CREATE TABLE source_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES scraping_sources(id),
  date DATE NOT NULL,
  
  -- Listings
  total_listings INTEGER DEFAULT 0,
  active_listings INTEGER DEFAULT 0,
  new_listings INTEGER DEFAULT 0,
  removed_listings INTEGER DEFAULT 0,
  
  -- Modelos
  unique_models INTEGER DEFAULT 0,
  models_with_prices INTEGER DEFAULT 0,
  
  -- Precios
  avg_price INTEGER,
  price_range_low INTEGER,
  price_range_high INTEGER,
  
  -- Calidad
  listings_with_images INTEGER DEFAULT 0,
  listings_with_location INTEGER DEFAULT 0,
  listings_matched_to_model INTEGER DEFAULT 0,
  
  -- Tiempo de respuesta
  avg_response_time_ms INTEGER,
  error_rate DECIMAL(5,2),
  
  UNIQUE(source_id, date)
);
```

---

### 5. Alertas y Monitoreo

#### `price_alerts` (ya existe)
Suscripciones de usuarios a alertas de precio.

```sql
-- Ampliar con:
- alert_type VARCHAR(20) DEFAULT 'below_target' -- 'below_target', 'price_drop', 'new_listing'
- source_filter VARCHAR(50)[] -- ['mercadolibre', 'ciclomarket'] o NULL para todos
- condition_filter VARCHAR(50)[] -- ['new', 'used']
- location_filter JSONB -- {"province": "Buenos Aires", "city": "CABA"}
```

#### `price_changes` (NUEVA)
Registro de cambios de precio detectados.

```sql
CREATE TABLE price_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES price_listings(id),
  old_price INTEGER NOT NULL,
  new_price INTEGER NOT NULL,
  old_currency VARCHAR(3),
  new_currency VARCHAR(3),
  change_percent DECIMAL(5,2),
  detected_at TIMESTAMP DEFAULT NOW(),
  
  -- Contexto
  market_avg_at_change INTEGER,
  market_median_at_change INTEGER
);

CREATE INDEX idx_price_changes_listing ON price_changes(listing_id);
CREATE INDEX idx_price_changes_detected ON price_changes(detected_at);
```

---

## Flujos de Datos

### 1. Ingesta Inicial (Full Sync)
```
scraping_job (type='full_sync') 
  → scrapea lista de resultados
  → por cada item: inserta en price_listings (status='pending_detail')
  → crea scraping_jobs individuales para detalle
  → cuando completa: actualiza source_coverage
```

### 2. Actualización Incremental
```
scraping_job (cron="0 */6 * * *") → cada 6 horas
  → scrapea últimas publicaciones
  → actualiza price_listings existentes
  → detecta cambios de precio → inserta en price_changes
  → marca vendidos si ya no aparecen
```

### 3. Matching de Modelos
```
Trigger: nueva fila en price_listings
  → busca coincidencias en bike_model_aliases
  → si encuentra: actualiza bike_model_id
  → si no: marca para revisión manual (bike_model_id=NULL)
```

### 4. Recálculo de Market Prices
```
Function: recalculate_market_prices()
  → Corre diariamente
  → Agrupa price_listings por bike_model_id + condition + year
  → Calcula estadísticas (avg, median, p25, p75)
  → Inserta/actualiza market_prices
  → Actualiza price_analytics_daily
```

---

## APIs y Endpoints

### Ingesta de Datos

```typescript
// POST /api/v1/pricing/ingest
// Para recibir datos de scrapers externos o partners
{
  source: "bikeroos", // debe existir en scraping_sources
  auth_token: "...",
  items: [{
    external_id: "BR-12345",
    title: "Specialized Tarmac SL8",
    price: 4500000,
    currency: "ARS",
    condition: "new",
    brand: "Specialized",
    model: "Tarmac SL8",
    year: 2024,
    // ... otros campos
  }]
}

// Respuesta:
{
  processed: 50,
  inserted: 45,
  updated: 5,
  errors: [],
  job_id: "uuid"
}
```

### Consulta de Precios

```typescript
// GET /api/v1/pricing/suggest?brand=Specialized&model=Tarmac&year=2024&condition=new
{
  bike_model_id: "uuid",
  model: {
    brand: "Specialized",
    model: "Tarmac SL8",
    year: 2024
  },
  
  // Estimación principal
  suggestion: {
    confidence: "high", // high | medium | low
    price_ars: 4500000,
    price_usd: 4200,
    currency: "ARS",
    
    // Rango esperado
    range: {
      low: 3800000,    // p25
      mid: 4500000,    // median
      high: 5200000    // p75
    }
  },
  
  // Fuentes de datos
  sources: {
    ciclomarket: { count: 3, avg_price: 4600000 },
    mercadolibre: { count: 12, avg_price: 4480000 },
    facebook: { count: 5, avg_price: 4350000 }
  },
  
  // Muestras específicas
  samples: [{
    source: "mercadolibre",
    price: 4500000,
    condition: "new",
    url: "https://...",
    listed_at: "2024-01-15"
  }],
  
  // Tendencia
  trend: {
    direction: "stable", // up | down | stable
    percent_30d: 2.5,
    percent_90d: -1.2
  }
}
```

### Dashboard de Cobertura

```typescript
// GET /api/v1/pricing/coverage
{
  total_listings: 15000,
  active_listings: 12000,
  unique_models: 450,
  
  by_source: {
    mercadolibre: { count: 8000, reliability: 0.95 },
    ciclomarket: { count: 3000, reliability: 0.99 },
    facebook: { count: 2500, reliability: 0.70 },
    bikeroos: { count: 1500, reliability: 0.85 }
  },
  
  last_24h: {
    new_listings: 150,
    price_changes: 45,
    sold_detected: 30
  },
  
  gaps: [{
    type: "missing_model",
    brand: "Trek",
    model: "Madone",
    count: 25,
    priority: "high"
  }]
}
```

---

## Jobs y Automatización

### 1. Scraper Scheduler (cada 5 minutos)
```javascript
// Revisa scraping_jobs pendientes y los ejecuta
// respeta rate limits de cada source
```

### 2. Daily Analytics (2 AM)
```sql
-- Calcula price_analytics_daily
-- Actualiza market_prices
-- Genera reporte de cobertura
```

### 3. Model Matching (cada hora)
```sql
-- Busca price_listings con bike_model_id=NULL
-- Intenta matchear usando bike_model_aliases
-- Si no encuentra, usa fuzzy matching
```

### 4. Price Alerts (cada 30 minutos)
```sql
-- Revisa price_changes recientes
-- Notifica usuarios con price_alerts coincidentes
```

### 5. Data Cleanup (domingos 3 AM)
```sql
-- Marca listings expirados (>90 días sin update)
-- Archiva datos antiguos (>1 año)
-- Optimiza tablas
```

---

## Escalabilidad

### Particionamiento Recomendado

```sql
-- price_listings por mes
CREATE TABLE price_listings_2024_01 PARTITION OF price_listings
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- price_analytics_daily por año
CREATE TABLE price_analytics_daily_2024 PARTITION OF price_analytics_daily
  FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

-- scraping_logs por semana (tabla grande, purgar después de 30 días)
```

### Índices Críticos

```sql
-- Búsquedas comunes
CREATE INDEX idx_price_listings_model_active ON price_listings(bike_model_id) WHERE status = 'active';
CREATE INDEX idx_price_listings_source_scraped ON price_listings(source, scraped_at);
CREATE INDEX idx_price_listings_price ON price_listings(price) WHERE status = 'active';
CREATE INDEX idx_price_listings_location ON price_listings(province, city) WHERE status = 'active';

-- Búsqueda de texto
CREATE INDEX idx_price_listings_title_search ON price_listings USING gin(to_tsvector('spanish', title));

-- JSONB
CREATE INDEX idx_price_listings_raw_data ON price_listings USING gin(raw_data);
```

---

## Consideraciones Legales

1. **Respetar robots.txt** de cada sitio
2. **Rate limiting** estricto (max 10 req/min por fuente)
3. **Términos de servicio** revisados
4. **Datos públicos únicamente** (no login requerido)
5. **User-Agent identificable** con contacto
6. **Considerar APIs oficiales** donde existan (MercadoLibre, etc.)

---

## Roadmap de Implementación

### Fase 1: Fundamentos (Semana 1-2)
- [ ] Crear tablas nuevas
- [ ] Implementar scraper base mejorado
- [ ] API de ingesta
- [ ] Dashboard básico de cobertura

### Fase 2: Fuentes (Semana 3-4)
- [ ] MercadoLibre (expandido)
- [ ] Facebook Marketplace
- [ ] Tiendas online (Bikeroos, etc.)
- [ ] Sistema de jobs programados

### Fase 3: Inteligencia (Semana 5-6)
- [ ] Matching de modelos mejorado
- [ ] Detección de duplicados
- [ ] Análisis de tendencias
- [ ] Alertas de precio

### Fase 4: Optimización (Semana 7-8)
- [ ] Particionamiento
- [ ] Caché agresiva
- [ ] API pública documentada
- [ ] Exportación de datos
