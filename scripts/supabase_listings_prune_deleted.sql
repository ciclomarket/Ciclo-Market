-- Prune hard-deletes for listings marked as 'deleted'
-- Ejecutar en el editor SQL de Supabase con un rol con permisos suficientes (owner).
-- Recomendado: correr primero el SELECT de control.

-- 1) Ver cuántos registros están marcados como deleted (control)
select count(*) as to_delete
from public.listings
where lower(trim(status)) = 'deleted';

-- 2) Opcional: listar IDs/títulos a eliminar (preview)
select id, title, created_at, expires_at, renewal_notified_at
from public.listings
where lower(trim(status)) = 'deleted'
order by coalesce(expires_at, created_at) desc
limit 200;

-- 3) Eliminar definitivamente los registros marcados como deleted
--    SUGERENCIA: si querés limitar por antigüedad, agregá una condición sobre updated_at/created_at
--    p.ej.: and coalesce(updated_at, created_at) < now() - interval '7 days'
delete from public.listings
where lower(trim(status)) = 'deleted';

-- 4) (Opcional) Limpieza de tablas relacionadas
-- ATENCIÓN: solo si tenés claves foráneas y querés borrar relacionados.
-- Ejemplos (descomentar si aplica):
-- delete from public.listing_questions where listing_id not in (select id from public.listings);
