-- Extensión de perfil para "Tiendas oficiales" y ejemplo de carga

-- 1) Agregar columnas (idempotente)
alter table public.users
  add column if not exists store_enabled boolean default false,
  add column if not exists store_name text null,
  add column if not exists store_slug text null,
  add column if not exists store_address text null,
  add column if not exists store_phone text null,
  add column if not exists store_instagram text null,
  add column if not exists store_facebook text null,
  add column if not exists store_website text null,
  add column if not exists store_banner_url text null,
  add column if not exists store_avatar_url text null;
  -- Posición vertical del banner (0-100, porcentaje) para recorte responsivo
  alter table public.users
    add column if not exists store_banner_position_y numeric default 50;

-- 2) Índice único parcial para store_slug (no nulo)
create unique index if not exists ux_users_store_slug
  on public.users (store_slug)
  where store_slug is not null;

-- 3) Constraint para forzar minúsculas en store_slug (si no existe)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_store_slug_lower_chk'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_store_slug_lower_chk
      check (store_slug is null or store_slug = lower(store_slug));
  end if;
end$$;

-- 4) Crear/actualizar una tienda “modelo” para un usuario existente por email
do $$
declare
  v_user_id uuid;
begin
  -- TODO: Reemplazá por el email del dueño de la tienda
  select id into v_user_id
  from public.users
  where email = 'tienda@ejemplo.com'
  limit 1;

  if v_user_id is null then
    raise notice 'No se encontró usuario con ese email (tienda@ejemplo.com). Ajustá el email y reintentá.';
    return;
  end if;

  update public.users
  set store_enabled     = true,
      store_name        = 'BiciWorld',
      store_slug        = lower('biciworld'),
      store_address     = 'Av. Siempre Viva 742, CABA',
      store_phone       = '+54 11 5555-5555',
      store_instagram   = 'ciclomarket.ar',
      store_facebook    = 'ciclomarket.ar',
      store_website     = 'https://bicimodelo.com.ar',
      store_banner_url        = 'https://ciclomarket.ar/OG-Marketplace.png',
      store_avatar_url        = 'https://ciclomarket.ar/android-chrome-192x192.png',
      store_banner_position_y = 50
  where id = v_user_id;
end$$;

-- 5) (Opcional) Índice de ayuda para lookups por slug
create index if not exists ix_users_store_slug on public.users (store_slug);

-- 6) Normalizar store_slug en INSERT/UPDATE (en DB) y garantizar formato
create or replace function public.trg_users_store_slug_normalize()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.store_slug is not null then
    -- a) minúsculas
    new.store_slug := lower(new.store_slug);
    -- b) sólo a-z0-9-_ (otros a '-')
    new.store_slug := regexp_replace(new.store_slug, '[^a-z0-9_-]+', '-', 'g');
    -- c) quitar guiones al inicio/fin
    new.store_slug := regexp_replace(new.store_slug, '(^-+|-+$)', '', 'g');
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
    where n.nspname = 'public' and c.relname = 'users' and t.tgname = 'users_store_slug_normalize'
  ) then
    create trigger users_store_slug_normalize
      before insert or update of store_slug on public.users
      for each row execute function public.trg_users_store_slug_normalize();
  end if;
end$$;

-- 7) Forzar plan 'pro' para listings de tiendas oficiales (server-side)
create or replace function public.trg_listings_apply_pro_for_stores()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_store boolean := false;
begin
  if new.seller_id is not null then
    select coalesce(store_enabled, false) into v_is_store
    from public.users where id = new.seller_id;
  end if;
  if v_is_store then
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

-- 8) Índice auxiliar para listados de tiendas (futuro directorio)
create index if not exists ix_users_store_enabled on public.users (store_enabled) where store_enabled = true;

-- 9) Asegurar plan 'pro' para tiendas en tabla public.plans (idempotente)
do $$
begin
  if not exists (
    select 1 from public.plans where coalesce(code, id)::text = 'pro'
  ) then
    insert into public.plans (
      id,
      code,
      name,
      price,
      currency,
      period_days,
      listing_duration_days,
      max_listings,
      max_photos,
      whatsapp_enabled,
      social_boost,
      description,
      accent_color
    ) values (
      'pro',
      'pro',
      'Tienda verificada',
      0,
      'ARS',
      3650,            -- ~10 años para efectos de "ilimitado"
      3650,
      0,               -- 0 = ilimitadas
      12,              -- fotos sugeridas para tiendas
      true,
      true,
      'Beneficios de tienda oficial: publicaciones sin vencimiento y mayor exposición.',
      '#0ea5e9'
    );
  end if;
end$$;
