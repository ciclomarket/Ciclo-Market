-- Sweepstakes tables, trigger y RLS básicos
-- Ejecutar en el editor SQL de Supabase. Pensado para ser idempotente.

-- 1) Tablas base -----------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'sweepstakes'
  ) then
    create table public.sweepstakes (
      id uuid primary key default gen_random_uuid(),
      slug text unique not null,
      title text not null,
      start_at timestamptz not null,
      end_at timestamptz not null,
      created_at timestamptz not null default now(),
      check (start_at < end_at)
    );
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'sweepstakes_participants'
  ) then
    create table public.sweepstakes_participants (
      sweepstake_id uuid references public.sweepstakes(id) on delete cascade,
      user_id uuid not null,
      first_listing_id uuid null,
      created_at timestamptz not null default now(),
      primary key (sweepstake_id, user_id)
    );
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'sweepstakes_winners'
  ) then
    create table public.sweepstakes_winners (
      sweepstake_id uuid references public.sweepstakes(id) on delete cascade,
      user_id uuid not null,
      selected_at timestamptz not null default now(),
      primary key (sweepstake_id)
    );
  end if;
end$$;

-- Índices útiles
create index if not exists ix_sweepstakes_active on public.sweepstakes (start_at, end_at);
create index if not exists ix_sweepstakes_participants_listing on public.sweepstakes_participants (first_listing_id);
create index if not exists ix_sweepstakes_participants_created on public.sweepstakes_participants (created_at desc);

-- 2) Grants y RLS ----------------------------------------------------------
do $$
begin
  execute 'alter table public.sweepstakes enable row level security';
  execute 'alter table public.sweepstakes_participants enable row level security';
  execute 'alter table public.sweepstakes_winners enable row level security';

  -- Grants mínimos
  execute 'grant usage on schema public to anon, authenticated, service_role';
  execute 'grant select on table public.sweepstakes to anon, authenticated, service_role';
  execute 'grant insert, update, delete on table public.sweepstakes to service_role';

  execute 'grant select on table public.sweepstakes_participants to service_role';
  execute 'grant insert, update, delete on table public.sweepstakes_participants to service_role';

  execute 'grant select on table public.sweepstakes_winners to service_role';
  execute 'grant insert, update, delete on table public.sweepstakes_winners to service_role';

  -- Políticas sweepstakes: lectura pública, escritura service_role
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sweepstakes' and policyname = 'sweepstakes_select_public'
  ) then
    create policy sweepstakes_select_public
      on public.sweepstakes
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sweepstakes' and policyname = 'sweepstakes_all_service'
  ) then
    create policy sweepstakes_all_service
      on public.sweepstakes
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  -- Participantes: acceso únicamente vía backend/service_role
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sweepstakes_participants' and policyname = 'sweep_participants_all_service'
  ) then
    create policy sweep_participants_all_service
      on public.sweepstakes_participants
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  -- Ganadores: solo backend/service_role
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sweepstakes_winners' and policyname = 'sweep_winners_all_service'
  ) then
    create policy sweep_winners_all_service
      on public.sweepstakes_winners
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end$$;

-- 3) Trigger: al crear listing dentro del rango, sumar participante ----------
create or replace function public.fn_add_participant_on_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sweep public.sweepstakes;
begin
  select *
  into v_sweep
  from public.sweepstakes
  where now() between start_at and end_at
  order by start_at asc
  limit 1;

  if not found then
    return new;
  end if;

  if new.seller_id is null then
    return new;
  end if;

  insert into public.sweepstakes_participants (sweepstake_id, user_id, first_listing_id)
  values (v_sweep.id, new.seller_id, new.id)
  on conflict (sweepstake_id, user_id) do update
    set first_listing_id = public.sweepstakes_participants.first_listing_id;

  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'listings' and t.tgname = 'trg_listing_participation'
  ) then
    execute 'drop trigger trg_listing_participation on public.listings';
  end if;
  execute 'create trigger trg_listing_participation after insert on public.listings for each row execute function public.fn_add_participant_on_listing()';
end$$;

-- Nota: si la tabla public.listings utiliza un nombre distinto para el vendedor (por ejemplo user_id),
-- actualizá la función fn_add_participant_on_listing para castear el campo correcto.
