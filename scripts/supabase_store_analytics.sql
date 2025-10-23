-- Analytics para tiendas (vistas + policy)

-- Policy: cada tienda puede leer únicamente sus propios eventos
drop policy if exists "stores can read own events" on public.events;
create policy "stores can read own events"
  on public.events for select
  using (store_user_id = auth.uid());

-- Métricas diarias (últimos 90 días) por tienda
create or replace view public.store_metrics_daily as
select
  date_trunc('day', created_at) as day,
  type,
  listing_id,
  store_user_id,
  count(*) as total
from public.events
where created_at >= now() - interval '90 days'
  and store_user_id is not null
group by 1,2,3,4
order by 1 asc;
alter view public.store_metrics_daily set (security_invoker = true);

-- Resumen por publicación (30 días)
create or replace view public.store_listing_summary_30d as
with base as (
  select listing_id, store_user_id,
    sum(case when type='listing_view' then 1 else 0 end) as views,
    sum(case when type='wa_click' then 1 else 0 end) as wa_clicks
  from public.events
  where created_at >= now() - interval '30 days'
    and store_user_id is not null
  group by 1,2
)
select
  listing_id,
  store_user_id,
  views,
  wa_clicks,
  case when views > 0 then round(100.0 * wa_clicks::numeric / views, 2) else 0 end as ctr
from base
order by wa_clicks desc nulls last, views desc nulls last;
alter view public.store_listing_summary_30d set (security_invoker = true);

-- Resumen global por tienda (30 días)
create or replace view public.store_summary_30d as
select
  store_user_id,
  sum(case when type='store_view' then 1 else 0 end) as store_views,
  sum(case when type='listing_view' then 1 else 0 end) as listing_views,
  sum(case when type='wa_click' then 1 else 0 end) as wa_clicks
from public.events
where created_at >= now() - interval '30 days'
  and store_user_id is not null
group by 1;
alter view public.store_summary_30d set (security_invoker = true);
