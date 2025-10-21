-- Listings RLS policies (idempotent)
-- Ejecutar en el editor SQL de Supabase. Crea políticas mínimas para permitir:
--  - SELECT público (anon/authenticated)
--  - INSERT de dueños (authenticated)
--  - UPDATE de dueños (authenticated)
--  - UPDATE de moderadores/admin por claim JWT (authenticated con role=moderator|admin)
--  - Todas las operaciones para service_role (backend)

do $$
begin
  -- Asegurar RLS habilitado
  execute 'alter table public.listings enable row level security';

  -- Grants básicos para PostgREST (no-op si ya existen)
  execute 'grant usage on schema public to anon, authenticated';
  execute 'grant select on table public.listings to anon, authenticated';
  execute 'grant insert, update on table public.listings to authenticated';
  execute 'grant all on table public.listings to service_role';

  -- SELECT pública
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='listings' and policyname='listings_select_all'
  ) then
    create policy listings_select_all
      on public.listings
      for select
      to anon, authenticated
      using (true);
  end if;

  -- INSERT: sólo dueño (seller_id = auth.uid())
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='listings' and policyname='listings_insert_own'
  ) then
    create policy listings_insert_own
      on public.listings
      for insert
      to authenticated
      with check (seller_id = auth.uid());
  end if;

  -- UPDATE: dueño
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='listings' and policyname='listings_update_own'
  ) then
    create policy listings_update_own
      on public.listings
      for update
      to authenticated
      using (seller_id = auth.uid())
      with check (seller_id = auth.uid());
  end if;

  -- UPDATE: moderador/admin (basado en tabla public.user_roles)
  -- Permite editar cualquier listing a usuarios con rol 'moderator' o 'admin'
  -- Idempotente: si existe la política anterior, la recreamos con la nueva condición
  if exists (
    select 1 from pg_policies where schemaname='public' and tablename='listings' and policyname='listings_update_moderator'
  ) then
    execute 'drop policy listings_update_moderator on public.listings';
  end if;
  create policy listings_update_moderator
    on public.listings
    for update
    to authenticated
    using (
      exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid() and ur.role in (''moderator'',''admin'')
      )
    )
    with check (
      exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid() and ur.role in (''moderator'',''admin'')
      )
    );

  -- Service role full access (backend)
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='listings' and policyname='listings_all_service'
  ) then
    create policy listings_all_service
      on public.listings
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end$$;
