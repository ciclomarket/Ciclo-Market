-- Recordatorio de reseñas: crea recordatorios inmediatamente tras el primer contacto
-- Ejecutar en el editor SQL de Supabase. Idempotente.

-- 1) Tabla de recordatorios -------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'review_reminders'
  ) then
    create table public.review_reminders (
      id uuid primary key default gen_random_uuid(),
      seller_id uuid not null,
      buyer_id uuid not null,
      listing_id uuid null,
      contact_event_id uuid null,
      ready_at timestamptz not null,
      sent_email boolean not null default false,
      sent_inapp boolean not null default false,
      created_at timestamptz not null default now(),
      unique (seller_id, buyer_id)
    );
  end if;
end$$;

-- Índices útiles (idempotentes)
do $$ begin
  execute 'create index if not exists ix_review_reminders_buyer_ready on public.review_reminders (buyer_id, ready_at)';
  execute 'create index if not exists ix_review_reminders_ready_at on public.review_reminders (ready_at)';
end $$;

-- 2) RLS y políticas --------------------------------------------------------
do $$
begin
  execute 'alter table public.review_reminders enable row level security';
  execute 'alter table public.review_reminders force row level security';

  -- Lectura de recordatorios por el propio comprador (in-app)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'review_reminders' and policyname = 'review_reminders_select_self'
  ) then
    create policy review_reminders_select_self
      on public.review_reminders
      for select
      to authenticated
      using (auth.uid() = buyer_id);
  end if;

  -- Inserción/actualización/lectura por backend (service_role)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'review_reminders' and policyname = 'review_reminders_all_service'
  ) then
    create policy review_reminders_all_service
      on public.review_reminders
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end$$;

-- Grant mínimos para PostgREST
do $$ begin
  execute 'grant usage on schema public to anon, authenticated, service_role';
  execute 'grant select on table public.review_reminders to authenticated, service_role';
  execute 'grant insert, update, delete on table public.review_reminders to service_role';
end $$;

-- 3) Trigger: al insertar contact_events, crear recordatorio si no existe ---
create or replace function public.trg_contact_events_create_review_reminder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
  v_first_contact timestamptz;
  v_seller uuid;
  v_buyer uuid;
begin
  -- Sólo si hay buyer_id (anon no genera recordatorio personalizable)
  if new.buyer_id is null then
    return new;
  end if;

  -- Compatibilidad: castear seller_id/buyer_id a uuid si la tabla contact_events los guarda como text
  begin
    v_seller := new.seller_id::uuid;
    v_buyer := new.buyer_id::uuid;
  exception when others then
    -- Si no podemos castear, evitamos romper la inserción de contact_events
    return new;
  end;

  -- Si ya existe recordatorio para el par seller-buyer, no hacer nada
  select exists(
    select 1 from public.review_reminders
    where seller_id = v_seller and buyer_id = v_buyer
  ) into v_exists;
  if v_exists then
    return new;
  end if;

  -- Buscar el primer contacto histórico (por compatibilidad de tipos)
  select min(created_at) into v_first_contact
  from public.contact_events
  where seller_id::text = new.seller_id::text
    and buyer_id::text = new.buyer_id::text;

  if v_first_contact is null then
    v_first_contact := coalesce(new.created_at, now());
  end if;

  insert into public.review_reminders (
    seller_id, buyer_id, listing_id, contact_event_id, ready_at
  ) values (
    v_seller, v_buyer, new.listing_id, new.id, now()
  )
  on conflict (seller_id, buyer_id) do nothing;

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
    where n.nspname = 'public' and c.relname = 'contact_events' and t.tgname = 'contact_events_create_review_reminder'
  ) then
    create trigger contact_events_create_review_reminder
      after insert on public.contact_events
      for each row execute function public.trg_contact_events_create_review_reminder();
  end if;
end$$;

-- 4) Vista conveniente de recordatorios listos (opcional)
create or replace view public.v_review_reminders_ready as
  select r.*
  from public.review_reminders r
  where r.ready_at <= now()
    and (not r.sent_email or not r.sent_inapp);

-- Grants para la vista
do $$ begin
  execute 'grant select on table public.v_review_reminders_ready to service_role';
end $$;

-- 5) Emisor de notificaciones in-app (inserta en public.notifications y marca sent_inapp)
create or replace function public.review_reminders_emit_ready_notifications(p_limit int default 100)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in (
    select id, buyer_id, seller_id
    from public.review_reminders
    where ready_at <= now() and sent_inapp = false
    order by ready_at asc
    limit greatest(1, p_limit)
  ) loop
    begin
      insert into public.notifications (user_id, type, title, body, cta_url, metadata)
      values (
        r.buyer_id,
        'system',
        'Podés dejar una reseña',
        'Tu reseña para este vendedor ya está disponible. ¡Contá tu experiencia y ayudá a otros!',
        '/vendedor/' || r.seller_id || '?review=1',
        jsonb_build_object('seller_id', r.seller_id)
      );
      update public.review_reminders set sent_inapp = true where id = r.id;
      v_count := v_count + 1;
    exception when others then
      -- continuar con el siguiente
      continue;
    end;
  end loop;
  return v_count;
end;
$$;

-- 6) Helper para marcar recordatorios como enviados por email (lo usará el backend)
create or replace function public.review_reminders_mark_email_sent(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v int; begin
  update public.review_reminders set sent_email = true where id = any(p_ids) and ready_at <= now();
  get diagnostics v = row_count;
  return v;
end; $$;
