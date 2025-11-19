-- Configuración de tabla para registrar envíos de automatizaciones de marketing
-- Ejecutar en el editor SQL de Supabase

create extension if not exists pgcrypto;

create table if not exists public.marketing_automations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  seller_id uuid null references public.users(id) on delete set null,
  scenario text not null check (scenario in ('expired','free_expiring','highlight_upsell')),
  email_to text null,
  sent_at timestamptz not null default now()
);

create index if not exists idx_marketing_automations_listing
  on public.marketing_automations (listing_id, scenario, sent_at desc);

create index if not exists idx_marketing_automations_scenario_sent
  on public.marketing_automations (scenario, sent_at desc);

alter table public.marketing_automations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'marketing_automations'
      and policyname = 'marketing_automations_select_service'
  ) then
    create policy marketing_automations_select_service
      on public.marketing_automations
      for select
      to service_role
      using (true);
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'marketing_automations'
      and policyname = 'marketing_automations_insert_service'
  ) then
    create policy marketing_automations_insert_service
      on public.marketing_automations
      for insert
      to service_role
      with check (true);
  end if;
end$$;
