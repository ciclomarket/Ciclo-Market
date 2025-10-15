-- RLS y políticas para tablas públicas expuestas a PostgREST
-- Ejecutar en el editor SQL de Supabase. Idempotente.

-- Contact Events -------------------------------------------------------------
do $$
begin
  -- Habilitar RLS
  execute 'alter table public.contact_events enable row level security';
  -- Forzar RLS incluso para el owner (service_role bypassa igualmente)
  execute 'alter table public.contact_events force row level security';

  -- Insertar solo con service_role (el backend usa la service key)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contact_events' and policyname = 'contact_events_insert_service'
  ) then
    create policy contact_events_insert_service
      on public.contact_events
      for insert
      to service_role
      with check (true);
  end if;

  -- (Opcional) lectura solo para service_role; omitir si no se necesita
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'contact_events' and policyname = 'contact_events_select_service'
  ) then
    create policy contact_events_select_service
      on public.contact_events
      for select
      to service_role
      using (true);
  end if;
end$$;

-- Reviews -------------------------------------------------------------------
do $$
begin
  execute 'alter table public.reviews enable row level security';
  execute 'alter table public.reviews force row level security';

  -- Lectura desde backend (service_role)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reviews' and policyname = 'reviews_select_service'
  ) then
    create policy reviews_select_service
      on public.reviews
      for select
      to service_role
      using (true);
  end if;

  -- Inserción desde backend (service_role)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reviews' and policyname = 'reviews_insert_service'
  ) then
    create policy reviews_insert_service
      on public.reviews
      for insert
      to service_role
      with check (true);
  end if;
end$$;

-- Plans ---------------------------------------------------------------------
do $$
begin
  execute 'alter table public.plans enable row level security';
  execute 'alter table public.plans force row level security';

  -- Lectura pública (clientes web usan anon/authenticated)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'plans' and policyname = 'plans_select_public'
  ) then
    create policy plans_select_public
      on public.plans
      for select
      to anon, authenticated
      using (true);
  end if;

  -- Modificaciones solo por backend (service_role)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'plans' and policyname = 'plans_modify_service'
  ) then
    create policy plans_modify_service
      on public.plans
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  -- Asegurar privilegios de lectura para roles front (PostgREST requiere GRANT + POLICY)
  -- (si ya existen, GRANT es no-op)
  execute 'grant usage on schema public to anon, authenticated';
  execute 'grant select on table public.plans to anon, authenticated';
end$$;

-- Share Boosts ---------------------------------------------------------------
do $$
begin
  execute 'alter table public.share_boosts enable row level security';
  execute 'alter table public.share_boosts force row level security';

  -- Backend lista/filtra pendientes (service_role)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'share_boosts' and policyname = 'share_boosts_select_service'
  ) then
    create policy share_boosts_select_service
      on public.share_boosts
      for select
      to service_role
      using (true);
  end if;

  -- Backend inserta solicitudes (service_role)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'share_boosts' and policyname = 'share_boosts_insert_service'
  ) then
    create policy share_boosts_insert_service
      on public.share_boosts
      for insert
      to service_role
      with check (true);
  end if;

  -- Backend actualiza estado (service_role)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'share_boosts' and policyname = 'share_boosts_update_service'
  ) then
    create policy share_boosts_update_service
      on public.share_boosts
      for update
      to service_role
      using (true)
      with check (true);
  end if;
end$$;

-- Gift Codes -----------------------------------------------------------------
do $$
begin
  execute 'alter table public.gift_codes enable row level security';
  execute 'alter table public.gift_codes force row level security';

  -- Solo backend administra y consulta gift codes
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'gift_codes' and policyname = 'gift_codes_all_service'
  ) then
    create policy gift_codes_all_service
      on public.gift_codes
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end$$;

-- Gift Redemptions -----------------------------------------------------------
do $$
begin
  execute 'alter table public.gift_redemptions enable row level security';
  execute 'alter table public.gift_redemptions force row level security';

  -- Solo backend inserta y consulta redenciones
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'gift_redemptions' and policyname = 'gift_redemptions_all_service'
  ) then
    create policy gift_redemptions_all_service
      on public.gift_redemptions
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end$$;
