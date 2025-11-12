-- Tabla de eventos genéricos para analytics
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null check (type in ('site_view','listing_view','store_view','wa_click')),
  listing_id uuid null,
  store_user_id uuid null,
  user_id uuid null,
  anon_id text null,
  path text null,
  referrer text null,
  ua text null,
  meta jsonb null
);

create index if not exists events_type_created_at_idx on public.events(type, created_at desc);
create index if not exists events_listing_created_at_idx on public.events(listing_id, created_at desc);
create index if not exists events_store_created_at_idx on public.events(store_user_id, created_at desc);

alter table public.events enable row level security;

-- Fuente del evento (web, mobile, admin, etc.) para segmentar engagement
alter table if exists public.events
  add column if not exists source text;

-- Lectura sólo para moderadores/admin (basado en user_roles)
drop policy if exists "mods can read events" on public.events;
create policy "mods can read events"
  on public.events for select
  using (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role in ('moderator','admin')
    )
  );

-- Insert básico (desde backend con service role; si quisieras insert directo desde cliente, podés abrir un policy con check por type)

-- Vistas agregadas (últimos 90 días)
create or replace view public.admin_events_daily as
select date_trunc('day', created_at) as day, type, count(*) as total
from public.events
where created_at >= now() - interval '90 days'
group by 1,2
order by 1 asc;
-- Ensure view runs with querying user's privileges (RLS-aware)
alter view public.admin_events_daily set (security_invoker = true);

create or replace view public.admin_listing_views_daily as
select date_trunc('day', created_at) as day, listing_id, count(*) as total
from public.events
where type = 'listing_view' and created_at >= now() - interval '90 days'
group by 1,2
order by 1 asc;
alter view public.admin_listing_views_daily set (security_invoker = true);

create or replace view public.admin_store_views_daily as
select date_trunc('day', created_at) as day, store_user_id, count(*) as total
from public.events
where type = 'store_view' and created_at >= now() - interval '90 days'
group by 1,2
order by 1 asc;
alter view public.admin_store_views_daily set (security_invoker = true);

create or replace view public.admin_wa_clicks_daily as
select date_trunc('day', created_at) as day, listing_id, count(*) as total
from public.events
where type = 'wa_click' and created_at >= now() - interval '90 days'
group by 1,2
order by 1 asc;
alter view public.admin_wa_clicks_daily set (security_invoker = true);

-- Resumen agregado por publicación (7 / 30 / 90 días) para el panel admin
create or replace view public.admin_listing_engagement_summary as
select
  l.id as listing_id,
  l.seller_id,
  l.title,
  coalesce(nullif(l.plan_code, ''), nullif(l.plan, ''), nullif(l.seller_plan, '')) as plan_code,
  sum(case when e.type = 'listing_view' and e.created_at >= now() - interval '7 days' then 1 else 0 end) as views_7d,
  sum(case when e.type = 'listing_view' and e.created_at >= now() - interval '30 days' then 1 else 0 end) as views_30d,
  sum(case when e.type = 'listing_view' and e.created_at >= now() - interval '90 days' then 1 else 0 end) as views_90d,
  sum(case when e.type = 'wa_click' and e.created_at >= now() - interval '7 days' then 1 else 0 end) as wa_clicks_7d,
  sum(case when e.type = 'wa_click' and e.created_at >= now() - interval '30 days' then 1 else 0 end) as wa_clicks_30d,
  sum(case when e.type = 'wa_click' and e.created_at >= now() - interval '90 days' then 1 else 0 end) as wa_clicks_90d
from public.listings l
left join public.events e
  on e.listing_id = l.id
  and e.created_at >= now() - interval '90 days'
group by 1,2,3,4;
alter view public.admin_listing_engagement_summary set (security_invoker = true);

-- Estadísticas agregadas de publicaciones para métricas de calidad
create or replace view public.admin_listing_engagement_stats as
select
  count(*) as listings_total,
  avg(views_30d) as avg_views_30d,
  avg(wa_clicks_30d) as avg_wa_clicks_30d
from public.admin_listing_engagement_summary;
alter view public.admin_listing_engagement_stats set (security_invoker = true);

-- Resumen agregado por tienda oficial (7 / 30 / 90 días)
create or replace view public.admin_store_engagement_summary as
select
  u.id as store_user_id,
  u.store_name,
  sum(case when e.type = 'store_view' and e.created_at >= now() - interval '7 days' then 1 else 0 end) as store_views_7d,
  sum(case when e.type = 'store_view' and e.created_at >= now() - interval '30 days' then 1 else 0 end) as store_views_30d,
  sum(case when e.type = 'store_view' and e.created_at >= now() - interval '90 days' then 1 else 0 end) as store_views_90d,
  sum(case when e.type = 'listing_view' and e.created_at >= now() - interval '7 days' then 1 else 0 end) as listing_views_7d,
  sum(case when e.type = 'listing_view' and e.created_at >= now() - interval '30 days' then 1 else 0 end) as listing_views_30d,
  sum(case when e.type = 'listing_view' and e.created_at >= now() - interval '90 days' then 1 else 0 end) as listing_views_90d,
  sum(case when e.type = 'wa_click' and e.created_at >= now() - interval '7 days' then 1 else 0 end) as wa_clicks_7d,
  sum(case when e.type = 'wa_click' and e.created_at >= now() - interval '30 days' then 1 else 0 end) as wa_clicks_30d,
  sum(case when e.type = 'wa_click' and e.created_at >= now() - interval '90 days' then 1 else 0 end) as wa_clicks_90d
from public.users u
left join public.events e
  on e.store_user_id = u.id
  and e.created_at >= now() - interval '90 days'
where coalesce(u.store_enabled, false) = true
group by 1,2;
alter view public.admin_store_engagement_summary set (security_invoker = true);
