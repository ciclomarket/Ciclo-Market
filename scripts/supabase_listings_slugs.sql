-- Slugs legibles para publicaciones (idempotente y seguro)
-- Ejecutar en el SQL Editor de Supabase (proyecto de Ciclo Market)

-- 1) Extensión para quitar acentos (si está disponible)
do $$ begin
  begin
    execute 'create extension if not exists unaccent';
  exception when others then
    -- si no hay permisos, seguimos sin unaccent
    null;
  end;
end $$;

-- 2) Columna slug (si no existe)
alter table if exists public.listings
  add column if not exists slug text;

-- 3) Helper: normaliza texto a slug
create or replace function public.to_slug(input text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(
    lower(
      -- intentar unaccent si está disponible
      coalesce(
        (select public.unaccent(input)),
        input
      )
    ),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

-- 4) Genera un slug único para listings a partir de título+modelo+año
create or replace function public.generate_listing_slug(p_title text, p_model text, p_year int, p_exclude_id text default null)
returns text language plpgsql as $$
declare
  base text;
  candidate text;
  counter int := 2;
  exists_slug boolean := true;
begin
  base := coalesce(public.to_slug(trim(coalesce(p_title,'')||' '||coalesce(p_model,'')||' '||coalesce(p_year::text,''))), 'listing');
  base := left(base, 80); -- limitar longitud base
  candidate := base;

  while exists_slug loop
    select exists(
      select 1 from public.listings
      where slug = candidate and (p_exclude_id is null or id::text <> p_exclude_id)
    ) into exists_slug;
    if exists_slug then
      candidate := left(base || '-' || counter::text, 96);
      counter := counter + 1;
    end if;
  end loop;
  return candidate;
end;
$$;

-- 5) Backfill de slugs faltantes (no pisa slugs existentes)
do $$ declare r record; begin
  for r in
    select id::text as id, title, model, year
    from public.listings
    where (slug is null or slug = '')
  loop
    begin
      update public.listings
        set slug = public.generate_listing_slug(r.title, r.model, r.year, r.id)
        where id::text = r.id;
    exception when others then
      -- continuar con siguientes filas si alguna falla
      null;
    end;
  end loop;
end $$;

-- 6) Índice único (sólo slugs no nulos)
do $$ begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and tablename = 'listings' and indexname = 'listings_slug_unique'
  ) then
    execute 'create unique index listings_slug_unique on public.listings (slug) where slug is not null';
  end if;
end $$;

-- 7) Trigger para auto-generar slug al insertar si viene null
create or replace function public.listings_slug_bi()
returns trigger language plpgsql as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.generate_listing_slug(new.title, new.model, new.year, null);
  end if;
  return new;
end;
$$;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_listings_slug_bi'
  ) then
    execute 'create trigger trg_listings_slug_bi before insert on public.listings for each row execute function public.listings_slug_bi()';
  end if;
end $$;

