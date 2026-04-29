-- Agregar campos específicos para Fixie/Pista
-- Relación Plato:Piñón y Tipo de maza

-- Agregar columna gear_ratio (Relación Plato:Piñón)
ALTER TABLE public.listings
ADD COLUMN IF NOT EXISTS gear_ratio TEXT;

-- Agregar columna hub_type (Tipo de maza)
ALTER TABLE public.listings
ADD COLUMN IF NOT EXISTS hub_type TEXT;

-- Comentarios de documentación
COMMENT ON COLUMN public.listings.gear_ratio IS 'Relación Plato:Piñón para Fixie/Pista (ej: 46:16)';
COMMENT ON COLUMN public.listings.hub_type IS 'Tipo de maza para Fixie/Pista (ej: Flip Flop, Fixed)';

SELECT 'Campos gear_ratio y hub_type agregados correctamente' AS resultado;
