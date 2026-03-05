create extension if not exists pgcrypto;

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign text not null,
  priority int not null,
  user_id uuid null references public.users(id) on delete set null,
  lead_email text null,
  email_to text not null,
  listing_id uuid null references public.listings(id) on delete set null,
  payment_id uuid null references public.payments(id) on delete set null,
  idempotency_key text not null,
  iso_year int not null,
  iso_week int not null,
  status text not null check (status in ('queued','sent','skipped','failed')),
  skip_reason text null,
  provider text not null default 'smtp',
  provider_message_id text null,
  subject text null,
  metadata jsonb not null default '{}'::jsonb,
  error text null,
  unique (idempotency_key)
);

create index if not exists idx_email_logs_user_iso_status
  on public.email_logs (user_id, iso_year, iso_week, status);
create index if not exists idx_email_logs_email_created
  on public.email_logs (email_to, created_at desc);
create index if not exists idx_email_logs_campaign_created
  on public.email_logs (campaign, created_at desc);
create index if not exists idx_email_logs_status_created
  on public.email_logs (status, created_at desc);

create table if not exists public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  reason text not null default 'unsubscribe',
  source text not null default 'user_action',
  created_at timestamptz not null default now(),
  user_id uuid null references public.users(id) on delete set null
);

create index if not exists idx_email_suppressions_created
  on public.email_suppressions (created_at desc);

create table if not exists public.external_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text not null,
  status text not null default 'active' check (status in ('active', 'unsubscribed', 'bounced')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_sent_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_external_leads_status_seen
  on public.external_leads (status, last_seen_at desc);

create table if not exists public.user_interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  score numeric(6,2) not null default 1,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'contact_events',
  unique (user_id, category, source)
);

create index if not exists idx_user_interests_user_updated
  on public.user_interests (user_id, updated_at desc);

alter table if exists public.user_notification_settings
  add column if not exists marketing_emails_enabled boolean default true;

update public.user_notification_settings
set marketing_emails_enabled = coalesce(marketing_emails, true)
where marketing_emails_enabled is distinct from coalesce(marketing_emails, true);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings(key, value)
values
  ('email_engine_enabled', '{"enabled": true}'::jsonb),
  ('campaign_payment_abandon_20off_enabled', '{"enabled": true}'::jsonb),
  ('campaign_upgrade_comparison_enabled', '{"enabled": true}'::jsonb),
  ('campaign_price_drop_alert_enabled', '{"enabled": true}'::jsonb),
  ('campaign_buyer_interest_weekly_enabled', '{"enabled": true}'::jsonb),
  ('campaign_new_arrivals_weekly_enabled', '{"enabled": true}'::jsonb),
  ('campaign_seller_weekly_performance_enabled', '{"enabled": true}'::jsonb),
  ('campaign_external_lead_weekly_enabled', '{"enabled": true}'::jsonb)
on conflict (key) do nothing;

alter table public.email_logs enable row level security;
alter table public.email_suppressions enable row level security;
alter table public.external_leads enable row level security;
alter table public.user_interests enable row level security;
alter table public.app_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='email_logs' and policyname='email_logs_service_role_select'
  ) then
    create policy email_logs_service_role_select on public.email_logs
      for select to service_role using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='email_logs' and policyname='email_logs_service_role_insert'
  ) then
    create policy email_logs_service_role_insert on public.email_logs
      for insert to service_role with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='email_logs' and policyname='email_logs_service_role_update'
  ) then
    create policy email_logs_service_role_update on public.email_logs
      for update to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='email_logs' and policyname='email_logs_deny_client'
  ) then
    create policy email_logs_deny_client on public.email_logs
      for all to anon, authenticated using (false) with check (false);
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='email_suppressions' and policyname='email_suppressions_service_role_select'
  ) then
    create policy email_suppressions_service_role_select on public.email_suppressions
      for select to service_role using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='email_suppressions' and policyname='email_suppressions_service_role_insert'
  ) then
    create policy email_suppressions_service_role_insert on public.email_suppressions
      for insert to service_role with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='email_suppressions' and policyname='email_suppressions_service_role_update'
  ) then
    create policy email_suppressions_service_role_update on public.email_suppressions
      for update to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='email_suppressions' and policyname='email_suppressions_deny_client'
  ) then
    create policy email_suppressions_deny_client on public.email_suppressions
      for all to anon, authenticated using (false) with check (false);
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='external_leads' and policyname='external_leads_service_role_select'
  ) then
    create policy external_leads_service_role_select on public.external_leads
      for select to service_role using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='external_leads' and policyname='external_leads_service_role_insert'
  ) then
    create policy external_leads_service_role_insert on public.external_leads
      for insert to service_role with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='external_leads' and policyname='external_leads_service_role_update'
  ) then
    create policy external_leads_service_role_update on public.external_leads
      for update to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='external_leads' and policyname='external_leads_insert_public'
  ) then
    create policy external_leads_insert_public on public.external_leads
      for insert to anon, authenticated with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='external_leads' and policyname='external_leads_deny_public_select_update'
  ) then
    create policy external_leads_deny_public_select_update on public.external_leads
      for select to anon, authenticated using (false);
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_interests' and policyname='user_interests_service_role_select'
  ) then
    create policy user_interests_service_role_select on public.user_interests
      for select to service_role using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_interests' and policyname='user_interests_service_role_insert'
  ) then
    create policy user_interests_service_role_insert on public.user_interests
      for insert to service_role with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_interests' and policyname='user_interests_service_role_update'
  ) then
    create policy user_interests_service_role_update on public.user_interests
      for update to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_interests' and policyname='user_interests_deny_client'
  ) then
    create policy user_interests_deny_client on public.user_interests
      for all to anon, authenticated using (false) with check (false);
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='app_settings' and policyname='app_settings_service_role_select'
  ) then
    create policy app_settings_service_role_select on public.app_settings
      for select to service_role using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='app_settings' and policyname='app_settings_service_role_insert'
  ) then
    create policy app_settings_service_role_insert on public.app_settings
      for insert to service_role with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='app_settings' and policyname='app_settings_service_role_update'
  ) then
    create policy app_settings_service_role_update on public.app_settings
      for update to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='app_settings' and policyname='app_settings_deny_client'
  ) then
    create policy app_settings_deny_client on public.app_settings
      for all to anon, authenticated using (false) with check (false);
  end if;
end$$;

comment on table public.email_logs is 'Log unificado de campañas de email (orquestador)';
comment on table public.email_suppressions is 'Lista de supresión de emails de marketing';
comment on table public.external_leads is 'Leads externos (sin cuenta) para campañas semanales';
comment on table public.user_interests is 'Intereses inferidos por usuario para segmentación';
comment on table public.app_settings is 'Feature flags y configuración de aplicación';

comment on column public.email_logs.idempotency_key is 'Clave única por campaña+entidad+semana para dedupe';
comment on column public.email_logs.status is 'Estado del intento de envío: queued|sent|skipped|failed';
comment on column public.email_logs.skip_reason is 'Motivo de skip (suppressed, weekly_limit, duplicate, conflict, disabled)';
