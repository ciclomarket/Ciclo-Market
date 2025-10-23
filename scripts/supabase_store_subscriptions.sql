-- Suscripciones mensuales para tiendas (idempotente)
-- Ejecutar en el editor SQL de Supabase

-- 1) Tabla principal de suscripciones de tienda
create table if not exists public.store_subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  user_id uuid not null,
  status text not null check (status in (
    'pending',       -- creada pero sin confirmar pago
    'active',        -- renovándose automáticamente
    'trialing',      -- período de prueba vigente
    'past_due',      -- pago fallido, en período de gracia
    'canceled',      -- cancelada definitivamente
    'paused'         -- pausa administrativa
  )) default 'pending',

  auto_renew boolean not null default true,
  currency text not null default 'ARS',
  price_cents integer not null check (price_cents >= 0),

  provider text not null default 'mercadopago',
  provider_sub_id text null,      -- ID de suscripción/preapproval del proveedor
  provider_customer_id text null, -- ID de cliente/mandato (si aplica)
  provider_status text null,      -- espejo de estado del proveedor (debug)
  init_url text null,             -- URL para iniciar/confirmar la suscripción
  manage_url text null,           -- URL para gestionar/cancelar en el proveedor (si aplica)

  current_period_start timestamptz null,
  current_period_end   timestamptz null,
  trial_end            timestamptz null,
  grace_until          timestamptz null,
  cancel_at_period_end boolean not null default false,

  notes text null
);

create index if not exists ix_store_subscriptions_user_created on public.store_subscriptions(user_id, created_at desc);
create index if not exists ix_store_subscriptions_provider on public.store_subscriptions(provider, provider_sub_id);

alter table public.store_subscriptions enable row level security;

-- 2) RLS: el usuario dueño puede leer su suscripción; modificaciones sólo service_role
do $$ begin
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='store_subscriptions'
  ) then
    -- limpiar políticas previas (opcional): no hacemos drop para no romper si existen otras
    null;
  end if;
end $$;

drop policy if exists "stores_sub_read_own" on public.store_subscriptions;
create policy "stores_sub_read_own"
  on public.store_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "stores_sub_modify_service" on public.store_subscriptions;
create policy "stores_sub_modify_service"
  on public.store_subscriptions
  for all
  to service_role
  using (true)
  with check (true);

-- 3) Trigger de updated_at
create or replace function public.trg_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'store_subscriptions_touch_updated') then
    create trigger store_subscriptions_touch_updated
      before update on public.store_subscriptions
      for each row execute function public.trg_touch_updated_at();
  end if;
end $$;

-- 4) Helper de elegibilidad/entitlement: ¿la tienda está activa?
create or replace function public.store_is_active(p_user uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.store_subscriptions s
    where s.user_id = p_user
      and (
        s.status in ('active','trialing') and coalesce(s.current_period_end, now()) >= now()
        or (s.status = 'past_due' and coalesce(s.grace_until, now()) >= now())
      )
  )
  or exists (
    -- Modo override: si el perfil tiene store_enabled, mantener activo aunque no haya suscripción
    select 1 from public.users u where u.id = p_user and coalesce(u.store_enabled, false) = true
  );
$$;

-- 5) Aplicar plan PRO a listings sólo si la tienda está activa (sustituye la versión anterior)
create or replace function public.trg_listings_apply_pro_for_stores()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active boolean := false;
begin
  if new.seller_id is not null then
    select public.store_is_active(new.seller_id) into v_active;
  end if;
  if v_active then
    new.seller_plan := 'pro';
    if coalesce(new.plan, '') = '' then new.plan := 'pro'; end if;
    if coalesce(new.plan_code, '') = '' then new.plan_code := 'pro'; end if;
    new.seller_plan_expires := null;
    new.expires_at := null;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'listings' and t.tgname = 'listings_apply_pro_for_stores'
  ) then
    create trigger listings_apply_pro_for_stores
      before insert or update of seller_id, seller_plan, plan, plan_code, expires_at, seller_plan_expires on public.listings
      for each row execute function public.trg_listings_apply_pro_for_stores();
  end if;
end$$;

-- 6) Vista opcional de suscripciones activas (para admin)
create or replace view public.admin_store_subscriptions_active as
select user_id, status, currency, price_cents, current_period_start, current_period_end
from public.store_subscriptions
where (status in ('active','trialing') and coalesce(current_period_end, now()) >= now())
   or (status = 'past_due' and coalesce(grace_until, now()) >= now());
alter view public.admin_store_subscriptions_active set (security_invoker = true);

