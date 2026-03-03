-- Función para generar resumen semanal de tienda
CREATE OR REPLACE FUNCTION generate_store_weekly_summary(store_user_id UUID)
RETURNS TABLE (
  total_views BIGINT,
  total_contacts BIGINT,
  new_listings BIGINT,
  top_listing_title TEXT,
  top_listing_views BIGINT,
  week_start DATE,
  week_end DATE
) AS $$
DECLARE
  week_start_date DATE;
  week_end_date DATE;
BEGIN
  -- Calcular rango de la semana pasada (lunes a domingo)
  week_end_date := CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::INTEGER;
  week_start_date := week_end_date - 6;
  
  RETURN QUERY
  WITH weekly_stats AS (
    SELECT 
      COALESCE(SUM(CASE WHEN e.event_type = 'listing_view' THEN 1 ELSE 0 END), 0) as views,
      COALESCE(SUM(CASE WHEN e.event_type = 'contact_seller' THEN 1 ELSE 0 END), 0) as contacts
    FROM events e
    WHERE e.user_id = store_user_id
      AND e.created_at >= week_start_date
      AND e.created_at < week_end_date + 1
  ),
  new_listings_count AS (
    SELECT COUNT(*) as count
    FROM listings l
    WHERE l.seller_id = store_user_id
      AND l.created_at >= week_start_date
      AND l.created_at < week_end_date + 1
  ),
  top_listing AS (
    SELECT 
      l.title,
      COALESCE(l.view_count, 0) as views
    FROM listings l
    WHERE l.seller_id = store_user_id
      AND l.status = 'active'
    ORDER BY l.view_count DESC NULLS LAST
    LIMIT 1
  )
  SELECT 
    ws.views,
    ws.contacts,
    nlc.count,
    COALESCE(tl.title, 'Sin publicaciones'),
    COALESCE(tl.views, 0),
    week_start_date,
    week_end_date
  FROM weekly_stats ws
  CROSS JOIN new_listings_count nlc
  CROSS JOIN top_listing tl;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener usuarios que quieren resumen semanal
CREATE OR REPLACE FUNCTION get_users_for_weekly_digest()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  store_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.email,
    COALESCE(us.store_name, us.full_name, 'Mi Tienda')
  FROM auth.users u
  JOIN user_notification_settings uns ON u.id = uns.user_id
  JOIN users us ON u.id = us.id
  WHERE uns.weekly_digest = true
    AND us.store_enabled = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION generate_store_weekly_summary IS 'Genera estadísticas semanales para una tienda específica';
COMMENT ON FUNCTION get_users_for_weekly_digest IS 'Obtiene usuarios con tienda que activaron el resumen semanal';
