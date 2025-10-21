-- Vista de métricas administrativas (corré esto en Supabase SQL)
-- Publicaciones activas por día (últimos 30 días)
create or replace view admin_listings_active_by_day as
select
  d::date as day,
  count(l.id) as active
from generate_series(now() - interval '30 days', now(), interval '1 day') d
left join public.listings l
  on l.status = 'active'
  and coalesce(l.created_at, now()) <= d
  and (l.expires_at is null or l.expires_at >= d)
group by 1
order by 1 asc;

