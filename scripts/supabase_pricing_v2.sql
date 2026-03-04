-- ============================================================================
-- PRICING DATABASE V2 - Migración completa
-- Base de datos de precios de bicicletas para Argentina
-- ============================================================================

-- ============================================================================
-- 1. TABLAS DE CATÁLOGO
-- ============================================================================

-- Tabla: bike_model_aliases
-- Mapea nombres alternativos a modelos oficiales
CREATE TABLE IF NOT EXISTS public.bike_model_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bike_model_id UUID NOT NULL REFERENCES public.bike_models(id) ON DELETE CASCADE,
    alias VARCHAR(200) NOT NULL,
    source VARCHAR(50),
    match_score DECIMAL(3,2) DEFAULT 0.90 CHECK (match_score >= 0 AND match_score <= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(alias, bike_model_id)
);

COMMENT ON TABLE public.bike_model_aliases IS 'Aliases para mapear nombres alternativos a modelos oficiales';

CREATE INDEX IF NOT EXISTS idx_bike_model_aliases_alias ON public.bike_model_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_bike_model_aliases_model ON public.bike_model_aliases(bike_model_id);

-- Tabla: product_categories
-- Taxonomía normalizada de categorías de bicicletas
CREATE TABLE IF NOT EXISTS public.product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    parent_id UUID REFERENCES public.product_categories(id),
    level INTEGER DEFAULT 0 CHECK (level >= 0 AND level <= 5),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.product_categories IS 'Taxonomía normalizada de categorías de bicicletas';

CREATE INDEX IF NOT EXISTS idx_product_categories_parent ON public.product_categories(parent_id);

-- Insertar categorías base
INSERT INTO public.product_categories (name, level) VALUES
    ('Bicicletas', 0),
    ('Mountain Bike', 1),
    ('Ruta / Carretera', 1),
    ('Urbanas / Paseo', 1),
    ('Gravel / Ciclocross', 1),
    ('BMX / Dirt', 1),
    ('Eléctricas', 1),
    ('Plegables', 1),
    ('Niños', 1),
    ('Triatlón / Contrarreloj', 1)
ON CONFLICT (name) DO NOTHING;

-- Subcategorías de MTB
INSERT INTO public.product_categories (name, parent_id, level)
SELECT 'Cross Country (XC)', id, 2 FROM public.product_categories WHERE name = 'Mountain Bike'
UNION ALL
SELECT 'Trail', id, 2 FROM public.product_categories WHERE name = 'Mountain Bike'
UNION ALL
SELECT 'All Mountain / Enduro', id, 2 FROM public.product_categories WHERE name = 'Mountain Bike'
UNION ALL
SELECT 'Downhill', id, 2 FROM public.product_categories WHERE name = 'Mountain Bike'
UNION ALL
SELECT 'Dirt Jump', id, 2 FROM public.product_categories WHERE name = 'Mountain Bike'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. TABLAS DE INGESTA
-- ============================================================================

-- Tabla: scraping_sources
-- Configuración de cada fuente de datos
CREATE TABLE IF NOT EXISTS public.scraping_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    base_url VARCHAR(255),
    type VARCHAR(20) NOT NULL CHECK (type IN ('marketplace', 'store', 'aggregator', 'api', 'feed')),
    config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    is_reliable BOOLEAN DEFAULT true,
    last_scraped_at TIMESTAMP WITH TIME ZONE,
    total_listings_scraped INTEGER DEFAULT 0,
    avg_listings_per_day INTEGER,
    robots_txt_allowed BOOLEAN,
    terms_accepted BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.scraping_sources IS 'Fuentes de datos para scraping de precios';

CREATE INDEX IF NOT EXISTS idx_scraping_sources_active ON public.scraping_sources(is_active);

-- Insertar fuentes iniciales
INSERT INTO public.scraping_sources (name, display_name, base_url, type, config, is_reliable, terms_accepted) VALUES
    ('ciclomarket', 'Ciclo Market', 'https://www.ciclomarket.ar', 'marketplace', '{"rate_limit_per_minute": 60, "requires_auth": false, "anti_bot": false}', true, true),
    ('mercadolibre', 'MercadoLibre', 'https://www.mercadolibre.com.ar', 'marketplace', '{"rate_limit_per_minute": 10, "requires_auth": false, "anti_bot": true}', true, false),
    ('facebook', 'Facebook Marketplace', 'https://www.facebook.com/marketplace', 'marketplace', '{"rate_limit_per_minute": 5, "requires_auth": true, "anti_bot": true}', false, false),
    ('olx', 'OLX Argentina', 'https://www.olx.com.ar', 'marketplace', '{"rate_limit_per_minute": 10, "requires_auth": false, "anti_bot": true}', true, false),
    ('bikeroos', 'Bikeroos', 'https://www.bikeroos.com', 'store', '{"rate_limit_per_minute": 20, "requires_auth": false, "anti_bot": false}', true, false),
    ('moove', 'Moove', 'https://www.moove.com.ar', 'store', '{"rate_limit_per_minute": 20, "requires_auth": false, "anti_bot": false}', true, false),
    ('manual', 'Carga Manual', NULL, 'api', '{"rate_limit_per_minute": 1000}', true, true)
ON CONFLICT (name) DO NOTHING;

-- Tabla: scraping_jobs
-- Jobs programados de scraping
CREATE TABLE IF NOT EXISTS public.scraping_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES public.scraping_sources(id),
    job_type VARCHAR(50) NOT NULL CHECK (job_type IN ('search', 'detail', 'update', 'full_sync', 'delta_sync', 'validate')),
    params JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    cron_expression VARCHAR(100),
    items_processed INTEGER DEFAULT 0,
    items_inserted INTEGER DEFAULT 0,
    items_updated INTEGER DEFAULT 0,
    items_failed INTEGER DEFAULT 0,
    error_message TEXT,
    executed_by VARCHAR(50),
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.scraping_jobs IS 'Jobs programados de scraping';

CREATE INDEX IF NOT EXISTS idx_scraping_jobs_status ON public.scraping_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_scheduled ON public.scraping_jobs(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_source ON public.scraping_jobs(source_id);
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_next_run ON public.scraping_jobs(next_run_at) WHERE cron_expression IS NOT NULL;

-- Tabla: scraping_logs
-- Log detallado de cada request
CREATE TABLE IF NOT EXISTS public.scraping_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES public.scraping_jobs(id) ON DELETE SET NULL,
    source_id UUID REFERENCES public.scraping_sources(id),
    url TEXT NOT NULL,
    method VARCHAR(10) DEFAULT 'GET',
    headers JSONB,
    status_code INTEGER,
    response_time_ms INTEGER,
    content_type VARCHAR(100),
    content_length INTEGER,
    success BOOLEAN,
    error_type VARCHAR(50) CHECK (error_type IN ('timeout', 'blocked', 'parse_error', 'rate_limited', 'network', 'unknown')),
    error_message TEXT,
    items_extracted INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.scraping_logs IS 'Log detallado de requests de scraping';

CREATE INDEX IF NOT EXISTS idx_scraping_logs_job ON public.scraping_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_scraping_logs_created ON public.scraping_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_scraping_logs_source ON public.scraping_logs(source_id);

-- ============================================================================
-- 3. TABLAS DE NORMALIZACIÓN
-- ============================================================================

-- Tabla: attribute_mappings
-- Mapea atributos de fuentes a valores normalizados
CREATE TABLE IF NOT EXISTS public.attribute_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(50) NOT NULL,
    attribute_type VARCHAR(50) NOT NULL CHECK (attribute_type IN ('condition', 'category', 'brand', 'size', 'frame_material', 'wheel_size')),
    source_value VARCHAR(200) NOT NULL,
    normalized_value VARCHAR(200) NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 1.00 CHECK (confidence >= 0 AND confidence <= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(source, attribute_type, source_value)
);

COMMENT ON TABLE public.attribute_mappings IS 'Mapeo de atributos de fuentes a valores normalizados';

CREATE INDEX IF NOT EXISTS idx_attribute_mappings_lookup ON public.attribute_mappings(source, attribute_type, source_value);

-- Insertar mapeos comunes para condición
INSERT INTO public.attribute_mappings (source, attribute_type, source_value, normalized_value, confidence) VALUES
    -- MercadoLibre
    ('mercadolibre', 'condition', 'Nuevo', 'new', 1.0),
    ('mercadolibre', 'condition', 'Usado', 'used', 1.0),
    ('mercadolibre', 'condition', 'Reacondicionado', 'refurbished', 1.0),
    -- Facebook
    ('facebook', 'condition', 'Nuevo', 'new', 1.0),
    ('facebook', 'condition', 'Usado - Como nuevo', 'like_new', 0.9),
    ('facebook', 'condition', 'Usado - Buen estado', 'used', 0.9),
    ('facebook', 'condition', 'Usado - Aceptable', 'fair', 0.8),
    -- OLX
    ('olx', 'condition', 'Nuevo', 'new', 1.0),
    ('olx', 'condition', 'Usado', 'used', 1.0),
    -- CicloMarket
    ('ciclomarket', 'condition', 'new', 'new', 1.0),
    ('ciclomarket', 'condition', 'like_new', 'like_new', 1.0),
    ('ciclomarket', 'condition', 'used', 'used', 1.0),
    ('ciclomarket', 'condition', 'good', 'good', 1.0),
    ('ciclomarket', 'condition', 'fair', 'fair', 1.0)
ON CONFLICT (source, attribute_type, source_value) DO NOTHING;

-- Tabla: listing_matches
-- Detecta el mismo producto en múltiples fuentes
CREATE TABLE IF NOT EXISTS public.listing_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    primary_listing_id UUID NOT NULL REFERENCES public.price_listings(id),
    duplicate_listing_id UUID NOT NULL REFERENCES public.price_listings(id),
    match_confidence DECIMAL(3,2) NOT NULL CHECK (match_confidence >= 0 AND match_confidence <= 1),
    match_reason VARCHAR(100),
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(primary_listing_id, duplicate_listing_id)
);

COMMENT ON TABLE public.listing_matches IS 'Relaciones entre listings duplicados en diferentes fuentes';

CREATE INDEX IF NOT EXISTS idx_listing_matches_primary ON public.listing_matches(primary_listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_matches_duplicate ON public.listing_matches(duplicate_listing_id);

-- ============================================================================
-- 4. TABLAS DE ANÁLISIS
-- ============================================================================

-- Tabla: price_analytics_daily
-- Métricas diarias por modelo
CREATE TABLE IF NOT EXISTS public.price_analytics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    bike_model_id UUID REFERENCES public.bike_models(id),
    listings_count INTEGER DEFAULT 0,
    new_listings INTEGER DEFAULT 0,
    sold_listings INTEGER DEFAULT 0,
    avg_price INTEGER,
    median_price INTEGER,
    min_price INTEGER,
    max_price INTEGER,
    by_source JSONB DEFAULT '{}',
    by_condition JSONB DEFAULT '{}',
    top_provinces JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(date, bike_model_id)
);

COMMENT ON TABLE public.price_analytics_daily IS 'Métricas diarias de precios por modelo';

CREATE INDEX IF NOT EXISTS idx_price_analytics_date ON public.price_analytics_daily(date);
CREATE INDEX IF NOT EXISTS idx_price_analytics_model ON public.price_analytics_daily(bike_model_id);
CREATE INDEX IF NOT EXISTS idx_price_analytics_date_model ON public.price_analytics_daily(date, bike_model_id);

-- Tabla: source_coverage
-- Métricas de cobertura por fuente
CREATE TABLE IF NOT EXISTS public.source_coverage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES public.scraping_sources(id),
    date DATE NOT NULL,
    total_listings INTEGER DEFAULT 0,
    active_listings INTEGER DEFAULT 0,
    new_listings INTEGER DEFAULT 0,
    removed_listings INTEGER DEFAULT 0,
    unique_models INTEGER DEFAULT 0,
    models_with_prices INTEGER DEFAULT 0,
    avg_price INTEGER,
    price_range_low INTEGER,
    price_range_high INTEGER,
    listings_with_images INTEGER DEFAULT 0,
    listings_with_location INTEGER DEFAULT 0,
    listings_matched_to_model INTEGER DEFAULT 0,
    avg_response_time_ms INTEGER,
    error_rate DECIMAL(5,2),
    UNIQUE(source_id, date)
);

COMMENT ON TABLE public.source_coverage IS 'Métricas de cobertura por fuente de datos';

CREATE INDEX IF NOT EXISTS idx_source_coverage_date ON public.source_coverage(date);
CREATE INDEX IF NOT EXISTS idx_source_coverage_source ON public.source_coverage(source_id);

-- Tabla: price_changes
-- Registro de cambios de precio detectados
CREATE TABLE IF NOT EXISTS public.price_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES public.price_listings(id),
    old_price INTEGER NOT NULL,
    new_price INTEGER NOT NULL,
    old_currency VARCHAR(3),
    new_currency VARCHAR(3),
    change_percent DECIMAL(5,2),
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    market_avg_at_change INTEGER,
    market_median_at_change INTEGER
);

COMMENT ON TABLE public.price_changes IS 'Historial de cambios de precio detectados';

CREATE INDEX IF NOT EXISTS idx_price_changes_listing ON public.price_changes(listing_id);
CREATE INDEX IF NOT EXISTS idx_price_changes_detected ON public.price_changes(detected_at);

-- ============================================================================
-- 5. ACTUALIZACIONES A TABLAS EXISTENTES
-- ============================================================================

-- Agregar campos a price_listings si no existen
DO $$
BEGIN
    -- Campos nuevos para enriquecimiento
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_listings' AND column_name = 'seller_type') THEN
        ALTER TABLE public.price_listings ADD COLUMN seller_type VARCHAR(20) CHECK (seller_type IN ('individual', 'store', 'unknown'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_listings' AND column_name = 'seller_id_external') THEN
        ALTER TABLE public.price_listings ADD COLUMN seller_id_external VARCHAR(100);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_listings' AND column_name = 'seller_rating') THEN
        ALTER TABLE public.price_listings ADD COLUMN seller_rating DECIMAL(3,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_listings' AND column_name = 'is_promoted') THEN
        ALTER TABLE public.price_listings ADD COLUMN is_promoted BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_listings' AND column_name = 'views_count') THEN
        ALTER TABLE public.price_listings ADD COLUMN views_count INTEGER;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_listings' AND column_name = 'location_coords') THEN
        ALTER TABLE public.price_listings ADD COLUMN location_coords POINT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_listings' AND column_name = 'images_count') THEN
        ALTER TABLE public.price_listings ADD COLUMN images_count INTEGER;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_listings' AND column_name = 'description_hash') THEN
        ALTER TABLE public.price_listings ADD COLUMN description_hash VARCHAR(64);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_listings' AND column_name = 'last_verified_at') THEN
        ALTER TABLE public.price_listings ADD COLUMN last_verified_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_listings' AND column_name = 'price_history') THEN
        ALTER TABLE public.price_listings ADD COLUMN price_history JSONB DEFAULT '[]';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_listings' AND column_name = 'title') THEN
        ALTER TABLE public.price_listings ADD COLUMN title TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_listings' AND column_name = 'description') THEN
        ALTER TABLE public.price_listings ADD COLUMN description TEXT;
    END IF;
END $$;

-- Agregar índices nuevos a price_listings
CREATE INDEX IF NOT EXISTS idx_price_listings_model_active ON public.price_listings(bike_model_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_price_listings_source_scraped ON public.price_listings(source, scraped_at);
CREATE INDEX IF NOT EXISTS idx_price_listings_title_search ON public.price_listings USING gin(to_tsvector('spanish', COALESCE(title, '')));

-- Agregar campos a market_prices si no existen
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_prices' AND column_name = 'samples_by_source') THEN
        ALTER TABLE public.market_prices ADD COLUMN samples_by_source JSONB DEFAULT '{}';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_prices' AND column_name = 'price_change_30d') THEN
        ALTER TABLE public.market_prices ADD COLUMN price_change_30d DECIMAL(5,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_prices' AND column_name = 'price_change_90d') THEN
        ALTER TABLE public.market_prices ADD COLUMN price_change_90d DECIMAL(5,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_prices' AND column_name = 'reliability_score') THEN
        ALTER TABLE public.market_prices ADD COLUMN reliability_score DECIMAL(3,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_prices' AND column_name = 'last_listing_at') THEN
        ALTER TABLE public.market_prices ADD COLUMN last_listing_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- ============================================================================
-- 6. FUNCIONES Y TRIGGERS
-- ============================================================================

-- Función: recalculate_market_prices_enhanced
-- Versión mejorada que incluye análisis por fuente
CREATE OR REPLACE FUNCTION public.recalculate_market_prices_enhanced()
RETURNS void AS $$
BEGIN
    -- Actualizar market_prices existentes
    INSERT INTO public.market_prices (
        bike_model_id, country, currency, condition, year,
        calculated_at, sample_size, avg_price, median_price,
        min_price, max_price, std_deviation, p25, p75,
        samples_by_source, last_listing_at
    )
    SELECT 
        pl.bike_model_id,
        pl.country,
        pl.currency,
        pl.condition,
        pl.year,
        NOW() as calculated_at,
        COUNT(*) as sample_size,
        ROUND(AVG(pl.price))::INTEGER as avg_price,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pl.price)::INTEGER as median_price,
        MIN(pl.price) as min_price,
        MAX(pl.price) as max_price,
        ROUND(STDDEV(pl.price))::INTEGER as std_deviation,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY pl.price)::INTEGER as p25,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY pl.price)::INTEGER as p75,
        jsonb_object_agg(pl.source, cnt) as samples_by_source,
        MAX(pl.scraped_at) as last_listing_at
    FROM public.price_listings pl
    INNER JOIN (
        SELECT bike_model_id, source, COUNT(*) as cnt
        FROM public.price_listings
        WHERE status = 'active' AND bike_model_id IS NOT NULL
        GROUP BY bike_model_id, source
    ) sub ON pl.bike_model_id = sub.bike_model_id AND pl.source = sub.source
    WHERE pl.status = 'active' 
      AND pl.bike_model_id IS NOT NULL
      AND pl.scraped_at >= NOW() - INTERVAL '30 days'
    GROUP BY pl.bike_model_id, pl.country, pl.currency, pl.condition, pl.year
    ON CONFLICT (bike_model_id, country, currency, condition, year) 
    DO UPDATE SET
        calculated_at = EXCLUDED.calculated_at,
        sample_size = EXCLUDED.sample_size,
        avg_price = EXCLUDED.avg_price,
        median_price = EXCLUDED.median_price,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        std_deviation = EXCLUDED.std_deviation,
        p25 = EXCLUDED.p25,
        p75 = EXCLUDED.p75,
        samples_by_source = EXCLUDED.samples_by_source,
        last_listing_at = EXCLUDED.last_listing_at;
        
    -- Calcular tendencias (30d y 90d)
    UPDATE public.market_prices mp
    SET 
        price_change_30d = (
            SELECT CASE 
                WHEN prev.avg_price > 0 THEN ROUND(((mp.avg_price - prev.avg_price)::NUMERIC / prev.avg_price * 100), 2)
                ELSE NULL
            END
            FROM public.market_prices prev
            WHERE prev.bike_model_id = mp.bike_model_id
              AND prev.condition = mp.condition
              AND prev.year = mp.year
              AND prev.currency = mp.currency
              AND prev.calculated_at >= NOW() - INTERVAL '35 days'
              AND prev.calculated_at < NOW() - INTERVAL '25 days'
            ORDER BY prev.calculated_at DESC
            LIMIT 1
        ),
        price_change_90d = (
            SELECT CASE 
                WHEN prev.avg_price > 0 THEN ROUND(((mp.avg_price - prev.avg_price)::NUMERIC / prev.avg_price * 100), 2)
                ELSE NULL
            END
            FROM public.market_prices prev
            WHERE prev.bike_model_id = mp.bike_model_id
              AND prev.condition = mp.condition
              AND prev.year = mp.year
              AND prev.currency = mp.currency
              AND prev.calculated_at >= NOW() - INTERVAL '95 days'
              AND prev.calculated_at < NOW() - INTERVAL '85 days'
            ORDER BY prev.calculated_at DESC
            LIMIT 1
        ),
        reliability_score = CASE
            WHEN mp.sample_size >= 10 THEN 1.0
            WHEN mp.sample_size >= 5 THEN 0.8
            WHEN mp.sample_size >= 3 THEN 0.6
            ELSE 0.4
        END;
        
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.recalculate_market_prices_enhanced() IS 'Recalcula precios de mercado con análisis por fuente y tendencias';

-- Función: detect_price_change
-- Detecta y registra cambios de precio
CREATE OR REPLACE FUNCTION public.detect_price_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.price IS DISTINCT FROM NEW.price AND OLD.price IS NOT NULL THEN
        INSERT INTO public.price_changes (
            listing_id, old_price, new_price, 
            old_currency, new_currency, change_percent
        ) VALUES (
            NEW.id, OLD.price, NEW.price,
            OLD.currency, NEW.currency,
            CASE 
                WHEN OLD.price > 0 THEN ROUND(((NEW.price - OLD.price)::NUMERIC / OLD.price * 100), 2)
                ELSE NULL
            END
        );
        
        -- Actualizar price_history
        NEW.price_history = COALESCE(OLD.price_history, '[]'::jsonb) || jsonb_build_object(
            'date', NOW(),
            'price', NEW.price,
            'currency', NEW.currency
        );
    END IF;
    
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para detectar cambios de precio
DROP TRIGGER IF EXISTS trg_detect_price_change ON public.price_listings;
CREATE TRIGGER trg_detect_price_change
    BEFORE UPDATE ON public.price_listings
    FOR EACH ROW
    EXECUTE FUNCTION public.detect_price_change();

-- Función: update_source_coverage
-- Actualiza métricas de cobertura
CREATE OR REPLACE FUNCTION public.update_source_coverage(p_source_id UUID, p_date DATE)
RETURNS void AS $$
BEGIN
    INSERT INTO public.source_coverage (
        source_id, date, total_listings, active_listings,
        unique_models, models_with_prices,
        listings_with_images, listings_with_location,
        listings_matched_to_model
    )
    SELECT 
        p_source_id,
        p_date,
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'active'),
        COUNT(DISTINCT bike_model_id),
        COUNT(DISTINCT bike_model_id) FILTER (WHERE bike_model_id IS NOT NULL),
        COUNT(*) FILTER (WHERE images_count > 0),
        COUNT(*) FILTER (WHERE province IS NOT NULL),
        COUNT(*) FILTER (WHERE bike_model_id IS NOT NULL)
    FROM public.price_listings
    WHERE source = (SELECT name FROM public.scraping_sources WHERE id = p_source_id)
      AND DATE(scraped_at) = p_date
    ON CONFLICT (source_id, date) 
    DO UPDATE SET
        total_listings = EXCLUDED.total_listings,
        active_listings = EXCLUDED.active_listings,
        unique_models = EXCLUDED.unique_models,
        models_with_prices = EXCLUDED.models_with_prices,
        listings_with_images = EXCLUDED.listings_with_images,
        listings_with_location = EXCLUDED.listings_with_location,
        listings_matched_to_model = EXCLUDED.listings_matched_to_model;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. RLS POLICIES
-- ============================================================================

-- Habilitar RLS en tablas nuevas
ALTER TABLE public.bike_model_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraping_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraping_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraping_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribute_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_changes ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura pública
CREATE POLICY bike_model_aliases_public_read ON public.bike_model_aliases FOR SELECT USING (true);
CREATE POLICY product_categories_public_read ON public.product_categories FOR SELECT USING (true);
CREATE POLICY scraping_sources_public_read ON public.scraping_sources FOR SELECT USING (true);
CREATE POLICY attribute_mappings_public_read ON public.attribute_mappings FOR SELECT USING (true);
CREATE POLICY price_analytics_daily_public_read ON public.price_analytics_daily FOR SELECT USING (true);
CREATE POLICY source_coverage_public_read ON public.source_coverage FOR SELECT USING (true);
CREATE POLICY price_changes_public_read ON public.price_changes FOR SELECT USING (true);

-- Políticas de admin para escritura
CREATE POLICY scraping_sources_admin_write ON public.scraping_sources 
    FOR ALL USING (public.admin_get_my_role() IN ('admin', 'moderator'));
CREATE POLICY scraping_jobs_admin_write ON public.scraping_jobs 
    FOR ALL USING (public.admin_get_my_role() IN ('admin', 'moderator'));
CREATE POLICY scraping_logs_admin_write ON public.scraping_logs 
    FOR ALL USING (public.admin_get_my_role() IN ('admin', 'moderator'));
CREATE POLICY attribute_mappings_admin_write ON public.attribute_mappings 
    FOR ALL USING (public.admin_get_my_role() IN ('admin', 'moderator'));
CREATE POLICY bike_model_aliases_admin_write ON public.bike_model_aliases 
    FOR ALL USING (public.admin_get_my_role() IN ('admin', 'moderator'));
CREATE POLICY product_categories_admin_write ON public.product_categories 
    FOR ALL USING (public.admin_get_my_role() IN ('admin', 'moderator'));
CREATE POLICY listing_matches_admin_write ON public.listing_matches 
    FOR ALL USING (public.admin_get_my_role() IN ('admin', 'moderator'));

-- ============================================================================
-- 8. DATOS INICIALES
-- ============================================================================

-- Insertar aliases para modelos populares
INSERT INTO public.bike_model_aliases (bike_model_id, alias, match_score)
SELECT 
    bm.id,
    bm.model,
    1.0
FROM public.bike_models bm
WHERE NOT EXISTS (
    SELECT 1 FROM public.bike_model_aliases bma 
    WHERE bma.bike_model_id = bm.id AND bma.alias = bm.model
)
ON CONFLICT (alias, bike_model_id) DO NOTHING;

-- ============================================================================
-- MIGRACIÓN COMPLETADA
-- ============================================================================
