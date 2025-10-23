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
