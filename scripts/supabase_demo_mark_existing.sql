-- Marcar como DEMO todas las publicaciones EXISTENTES de admin@ciclomarket.ar
-- Ejecutar esto DESPUÉS de haber corrido supabase_demo_account.sql

-- 1) Primero verificar que admin@ciclomarket.ar está marcado como demo
DO $$
DECLARE
  v_user_id uuid;
  v_is_demo boolean;
BEGIN
  SELECT id, is_demo_account INTO v_user_id, v_is_demo
  FROM public.users 
  WHERE email = 'admin@ciclomarket.ar';
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró usuario admin@ciclomarket.ar';
  END IF;
  
  IF NOT coalesce(v_is_demo, false) THEN
    -- Marcar como demo si no lo está
    UPDATE public.users 
    SET is_demo_account = true 
    WHERE id = v_user_id;
    RAISE NOTICE 'Usuario admin@ciclomarket.ar marcado como demo account';
  ELSE
    RAISE NOTICE 'Usuario admin@ciclomarket.ar ya está marcado como demo';
  END IF;
  
  -- 2) Marcar TODAS sus publicaciones existentes como demo
  UPDATE public.listings
  SET is_demo_listing = true
  WHERE seller_id = v_user_id
    AND coalesce(is_demo_listing, false) = false;
  
  IF FOUND THEN
    RAISE NOTICE 'Marcadas % publicaciones existentes como demo', FOUND;
  ELSE
    RAISE NOTICE 'No había publicaciones pendientes de marcar como demo';
  END IF;
END $$;

-- 3) Verificación: contar publicaciones demo del admin
SELECT 
  u.email,
  u.is_demo_account,
  count(l.id) as total_listings,
  count(l.id) FILTER (WHERE l.is_demo_listing = true) as demo_listings
FROM public.users u
LEFT JOIN public.listings l ON l.seller_id = u.id
WHERE u.email = 'admin@ciclomarket.ar'
GROUP BY u.id, u.email, u.is_demo_account;
