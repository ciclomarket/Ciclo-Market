# Sistema de Pricing Database para Ciclo Market

## Resumen de Mejoras Implementadas (V2)

### Nuevo sistema de sugerencias de precio:
1. **Diferenciación por moneda**: ARS vs USD separados
2. **Búsqueda por marca + modelo + año** exactos
3. **Fallback a modelos similares**: Si no hay 3+ exactos, busca modelos parecidos (±2 años)
4. **Mensajes claros**: "No encontramos suficientes Specialized Tarmac SL8"
5. **Indicadores de confianza**:
   - Verde: 3+ modelos exactos
   - Amarillo: Modelos similares disponibles
   - Alerta: Investigar en otros marketplaces

---

## Estructura de DB Propuesta

### Tabla: bike_models
Catalogo de modelos de bicicletas.

```sql
CREATE TABLE bike_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(200) NOT NULL,
  category VARCHAR(50),
  year_released INTEGER,
  original_msrp_usd INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(brand, model, year_released)
);
```

### Tabla: price_listings
Publicaciones de precios de todas las fuentes.

```sql
CREATE TABLE price_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bike_model_id UUID REFERENCES bike_models(id),
  source VARCHAR(50) NOT NULL, -- ciclomarket, mercadolibre, facebook
  external_id VARCHAR(255),
  external_url TEXT,
  price INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'ARS',
  price_usd INTEGER,
  year INTEGER,
  condition VARCHAR(50),
  province VARCHAR(100),
  city VARCHAR(100),
  listed_at TIMESTAMP,
  scraped_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'active',
  raw_data JSONB
);

CREATE INDEX idx_price_listings_model ON price_listings(bike_model_id);
CREATE INDEX idx_price_listings_source ON price_listings(source);
CREATE INDEX idx_price_listings_active ON price_listings(status) WHERE status = 'active';
```

### Tabla: market_prices
Precios promedio calculados (cache).

```sql
CREATE TABLE market_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bike_model_id UUID REFERENCES bike_models(id),
  currency VARCHAR(3) DEFAULT 'ARS',
  condition VARCHAR(50),
  year INTEGER,
  calculated_at TIMESTAMP DEFAULT NOW(),
  sample_size INTEGER,
  avg_price INTEGER,
  median_price INTEGER,
  min_price INTEGER,
  max_price INTEGER,
  trend_percent DECIMAL(5,2),
  UNIQUE(bike_model_id, currency, condition, year)
);
```

---

## Función de Sugerencia

```sql
CREATE OR REPLACE FUNCTION get_price_suggestion(
  p_brand VARCHAR,
  p_model VARCHAR,
  p_year INTEGER,
  p_condition VARCHAR,
  p_currency VARCHAR DEFAULT 'ARS'
)
RETURNS TABLE (
  exact_matches INTEGER,
  exact_avg INTEGER,
  similar_matches INTEGER,
  similar_avg INTEGER,
  confidence VARCHAR,
  suggestion INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH exact AS (
    SELECT COUNT(*) as cnt, AVG(price) as avg_price
    FROM price_listings pl
    JOIN bike_models bm ON bm.id = pl.bike_model_id
    WHERE bm.brand ILIKE p_brand
      AND bm.model ILIKE p_model
      AND pl.year = p_year
      AND pl.condition = p_condition
      AND pl.currency = p_currency
      AND pl.status = 'active'
  ),
  similar AS (
    SELECT COUNT(*) as cnt, AVG(price) as avg_price
    FROM price_listings pl
    JOIN bike_models bm ON bm.id = pl.bike_model_id
    WHERE bm.brand ILIKE p_brand
      AND pl.year BETWEEN p_year - 2 AND p_year + 2
      AND pl.condition = p_condition
      AND pl.currency = p_currency
      AND pl.status = 'active'
  )
  SELECT 
    exact.cnt::INTEGER,
    exact.avg_price::INTEGER,
    (similar.cnt - exact.cnt)::INTEGER,
    similar.avg_price::INTEGER,
    CASE 
      WHEN exact.cnt >= 3 THEN 'high'
      WHEN similar.cnt >= 5 THEN 'medium'
      ELSE 'low'
    END,
    COALESCE(exact.avg_price, similar.avg_price)::INTEGER
  FROM exact, similar;
END;
$$ LANGUAGE plpgsql;
```

---

## Estrategias de Carga de Datos

### 1. Sync desde Ciclo Market (automático)
Job que corre cada hora:
```sql
INSERT INTO price_listings (source, price, currency, year, condition, province, city, listed_at, status)
SELECT 'ciclomarket', price, COALESCE(price_currency, 'ARS'), year, condition, province, city, to_timestamp(created_at / 1000), status
FROM listings WHERE status = 'active' AND price > 0;
```

### 2. Importación manual CSV
Para cargar datos de MercadoLibre, Facebook, etc.

### 3. API de ingesta
Endpoint para recibir datos de scrapers controlados.

---

## Roadmap

### Fase 1 (Ahora)
- Crear tablas
- Importar catálogo de modelos populares
- Sync automático desde listings

### Fase 2 (Próximo)
- Scraper controlado de MercadoLibre (10 req/min)
- Job diario de recálculo
- Gráficos de tendencia

### Fase 3 (Futuro)
- Alertas de precio
- Comparador entre fuentes
- App móvil para reportar precios

---

## Notas Legales
- Respetar robots.txt
- No superar rate limits
- Solo datos públicos
- Considerar API oficial de ML
