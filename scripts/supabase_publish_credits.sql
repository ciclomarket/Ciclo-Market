-- Créditos de publicación por pago (idempotente)
-- Ejecutar en el editor SQL de Supabase

create table if not exists public.publish_credits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  plan_code text not null check (plan_code in ('basic','premium')),
  status text not null check (status in ('pending','available','used','expired','cancelled')) default 'pending',
  provider text not null default 'mercadopago',
  provider_ref text null,           -- ID de pago aprobado
  preference_id text null,          -- ID de preference MP (creación del checkout)
  used_at timestamptz null,
  expires_at timestamptz null,
  listing_id uuid null
);

-- Unicidades e índices útiles
create unique index if not exists publish_credits_provider_ref_key on public.publish_credits(provider_ref, provider) where provider_ref is not null;
create unique index if not exists publish_credits_preference_id_key on public.publish_credits(preference_id, provider) where preference_id is not null;
create index if not exists publish_credits_user_status_idx on public.publish_credits(user_id, status, created_at desc);
-- Para revertir canjes no adjuntos eficientemente
create index if not exists publish_credits_used_at_idx on public.publish_credits(status, used_at, listing_id);

alter table public.publish_credits enable row level security;

-- Lectura propia (dueño puede ver sus créditos)
drop policy if exists "users can read own credits" on public.publish_credits;
create policy "users can read own credits"
  on public.publish_credits for select
  using (auth.uid() = user_id);

-- Por defecto, no permitir insert/update/delete desde cliente (solo service role)
drop policy if exists "users cannot modify credits" on public.publish_credits;
create policy "users cannot modify credits"
  on public.publish_credits for all
  using (false) with check (false);

-- Vistas simples (opcionales) para admin en Supabase (si usás el panel)
create or replace view public.admin_publish_credits_daily as
select date_trunc('day', created_at) as day, status, plan_code, count(*) as total
from public.publish_credits
where created_at >= now() - interval '90 days'
group by 1,2,3
order by 1 asc;
