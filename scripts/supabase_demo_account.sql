-- Sistema de cuentas DEMO para admin@ciclomarket.ar
-- Permite crear publicaciones y tiendas ocultas al público pero visibles para el demo user

-- 1) Agregar columna is_demo_account a users
alter table public.users
  add column if not exists is_demo_account boolean default false;

-- Crear índice para performance
create index if not exists ix_users_is_demo_account on public.users (is_demo_account) where is_demo_account = true;

-- 2) Agregar columna is_demo_listing a listings (opcional, para casos mixtos)
alter table public.listings
  add column if not exists is_demo_listing boolean default false;

create index if not exists ix_listings_is_demo on public.listings (is_demo_listing) where is_demo_listing = true;

-- 3) Actualizar el usuario admin@ciclomarket.ar como demo account
do $$
begin
  update public.users
  set is_demo_account = true
  where email = 'admin@ciclomarket.ar';
  
  if not found then
    raise notice 'No se encontró usuario admin@ciclomarket.ar. Creá el usuario primero o ajustá el email.';
  else
    raise notice 'Usuario admin@ciclomarket.ar marcado como demo account';
  end if;
end$$;

-- 4) Trigger: auto-marcar listings como demo si el seller es demo account
create or replace function public.trg_listings_mark_demo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_demo boolean := false;
begin
  -- Verificar si el seller es demo account
  if new.seller_id is not null then
    select coalesce(is_demo_account, false) into v_is_demo
    from public.users where id = new.seller_id;
  end if;
  
  -- Marcar el listing como demo si el seller lo es
  if v_is_demo then
    new.is_demo_listing := true;
  end if;
  
  return new;
end;
$$;

-- Recrear trigger (idempotente)
do $$
begin
  if exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'listings' and t.tgname = 'listings_mark_demo'
  ) then
    drop trigger listings_mark_demo on public.listings;
  end if;
  
  create trigger listings_mark_demo
    before insert or update of seller_id on public.listings
    for each row execute function public.trg_listings_mark_demo();
end$$;

-- 5) Función auxiliar: verificar si un usuario es demo
create or replace function public.is_demo_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(is_demo_account, false)
  from public.users
  where id = p_user_id;
$$;

-- 6) Actualizar políticas RLS de listings para ocultar demos al público
-- Eliminar políticas existentes primero, luego crear las nuevas

do $$
begin
  -- Eliminar política anterior si existe
  if exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'listings' and policyname = 'listings_select_public'
  ) then
    drop policy listings_select_public on public.listings;
  end if;
end$$;

-- Crear nueva política para anónimos (no ven listings de demo)
create policy listings_select_public
  on public.listings
  for select
  to anon
  using (
    not exists (
      select 1 from public.users u
      where u.id = listings.seller_id and u.is_demo_account = true
    )
    and coalesce(listings.is_demo_listing, false) = false
  );

do $$
begin
  -- Eliminar política anterior si existe
  if exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'listings' and policyname = 'listings_select_auth'
  ) then
    drop policy listings_select_auth on public.listings;
  end if;
end$$;

-- Crear nueva política para usuarios autenticados
create policy listings_select_auth
  on public.listings
  for select
  to authenticated
  using (
    not exists (
      select 1 from public.users u
      where u.id = listings.seller_id and u.is_demo_account = true
    )
    or listings.seller_id = auth.uid()
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role in ('moderator','admin')
    )
  );

-- 7) Función para obtener listings visibles (usada en el frontend)
create or replace function public.get_visible_listings(
  p_limit integer default 20,
  p_offset integer default 0,
  p_category text default null,
  p_location text default null,
  p_min_price integer default null,
  p_max_price integer default null
)
returns setof public.listings
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.listings l
  where 
    not exists (
      select 1 from public.users u
      where u.id = l.seller_id and u.is_demo_account = true
    )
    and (p_category is null or l.category = p_category)
    and (p_location is null or l.location ilike '%' || p_location || '%')
    and (p_min_price is null or l.price >= p_min_price)
    and (p_max_price is null or l.price <= p_max_price)
    and l.status in ('active', 'published')
  order by l.created_at desc
  limit p_limit offset p_offset;
$$;

-- 8) Función para verificar si una tienda es visible (no demo)
create or replace function public.is_store_visible(p_store_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not coalesce(u.is_demo_account, false)
  from public.users u
  where u.store_slug = p_store_slug
  limit 1;
$$;

-- 9) Vista para tiendas públicas (excluye demos)
drop view if exists public.public_stores;

create view public.public_stores as
select 
  id,
  full_name,
  store_name,
  store_slug,
  store_address,
  store_phone,
  store_instagram,
  store_facebook,
  store_website,
  store_banner_url,
  store_avatar_url,
  store_banner_position_y,
  store_enabled,
  created_at,
  updated_at
from public.users
where 
  store_enabled = true
  and store_slug is not null
  and coalesce(is_demo_account, false) = false;

-- Dar permisos sobre la vista
grant select on public.public_stores to anon, authenticated;

-- 10) Función para verificar si el usuario actual es demo (útil para UI)
create or replace function public.is_current_user_demo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(is_demo_account, false)
  from public.users
  where id = auth.uid();
$$;

-- LISTO!
-- 
-- RESUMEN DE FUNCIONAMIENTO:
-- 
-- 1. admin@ciclomarket.ar (marcado como is_demo_account=true) puede:
--    - Crear publicaciones normales (se marcan automáticamente como is_demo_listing)
--    - Ver TODAS sus publicaciones en "Mis Publicaciones"
--    - Crear una tienda con store_slug
--    - Ver su tienda en su perfil
--
-- 2. Usuarios anónimos (no logueados):
--    - NO ven listings del demo user
--    - NO pueden acceder a la tienda demo por slug
--    - NO ven la tienda en directorios/búsquedas
--
-- 3. Usuarios logueados normales:
--    - NO ven listings del demo user
--    - NO ven la tienda demo en ninguna parte
--
-- 4. Moderadores/Admins:
--    - SÍ ven todo el contenido de demo
