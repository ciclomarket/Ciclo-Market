-- Instrumentación para actividad de usuarios y publicaciones en el panel admin.
-- Ejecutar en el editor SQL de Supabase luego de desplegar cambios web.

-- Historial de cambios de estado en publicaciones (crea evento para cada transición)
create table if not exists public.listing_status_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  seller_id uuid null,
  previous_status text null,
  next_status text not null,
  changed_at timestamptz not null default now()
);

create index if not exists listing_status_events_listing_idx on public.listing_status_events(listing_id, changed_at desc);
create index if not exists listing_status_events_status_idx on public.listing_status_events(next_status, changed_at desc);

alter table public.listing_status_events enable row level security;

-- Lectura restringida a administradores/moderadores (mismo criterio que eventos)
drop policy if exists "mods can read listing status events" on public.listing_status_events;
create policy "mods can read listing status events"
  on public.listing_status_events for select
  using (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role in ('moderator','admin')
    )
  );

-- Trigger que registra transiciones de estado
create or replace function public.trg_listing_status_events()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.listing_status_events(listing_id, seller_id, previous_status, next_status, changed_at)
    values (new.id, new.seller_id, null, new.status, coalesce(new.created_at, now()));
    return new;
  end if;

  if (new.status is distinct from old.status) then
    insert into public.listing_status_events(listing_id, seller_id, previous_status, next_status, changed_at)
    values (new.id, new.seller_id, old.status, new.status, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_listing_status_events_biu on public.listings;
create trigger trg_listing_status_events_biu
  after insert or update of status on public.listings
  for each row
  execute function public.trg_listing_status_events();

-- Vista resumida para actividad de publicaciones (nuevos vs pausados)
create or replace view public.admin_listing_activity_summary as
select
  count(distinct case when l.created_at >= now() - interval '7 days' then l.id end) as listings_created_7d,
  count(distinct case when l.created_at >= now() - interval '14 days' and l.created_at < now() - interval '7 days' then l.id end) as listings_created_prev_7d,
  count(distinct case when l.created_at >= now() - interval '30 days' then l.id end) as listings_created_30d,
  count(distinct case when l.created_at >= now() - interval '60 days' and l.created_at < now() - interval '30 days' then l.id end) as listings_created_prev_30d,
  count(case when e.next_status = 'paused' and e.changed_at >= now() - interval '7 days' then 1 end) as listings_paused_7d,
  count(case when e.next_status = 'paused' and e.changed_at >= now() - interval '14 days' and e.changed_at < now() - interval '7 days' then 1 end) as listings_paused_prev_7d,
  count(case when e.next_status = 'paused' and e.changed_at >= now() - interval '30 days' then 1 end) as listings_paused_30d,
  count(case when e.next_status = 'paused' and e.changed_at >= now() - interval '60 days' and e.changed_at < now() - interval '30 days' then 1 end) as listings_paused_prev_30d
from public.listings l
left join public.listing_status_events e
  on e.listing_id = l.id
  and e.changed_at >= now() - interval '60 days';
alter view public.admin_listing_activity_summary set (security_invoker = true);

-- Vista de crecimiento de usuarios (7 / 30 / 90 + períodos anteriores)
create or replace view public.admin_user_growth_summary as
select
  count(*) filter (where u.created_at >= now() - interval '7 days') as users_7d,
  count(*) filter (where u.created_at >= now() - interval '14 days' and u.created_at < now() - interval '7 days') as users_prev_7d,
  count(*) filter (where u.created_at >= now() - interval '30 days') as users_30d,
  count(*) filter (where u.created_at >= now() - interval '60 days' and u.created_at < now() - interval '30 days') as users_prev_30d,
  count(*) filter (where u.created_at >= now() - interval '90 days') as users_90d,
  count(*) filter (where u.created_at >= now() - interval '180 days' and u.created_at < now() - interval '90 days') as users_prev_90d
from public.users u;
alter view public.admin_user_growth_summary set (security_invoker = true);
