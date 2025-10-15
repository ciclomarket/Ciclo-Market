-- Optimización de RLS y limpieza de duplicados/permisos
-- Ejecutar en el editor SQL de Supabase. Idempotente / tolerante.

-- 1) Reescritura automática de expresiones USING/WITH CHECK para usar (select auth.*) y (select current_setting())
do $$
declare
  r record;
  qual text;
  wchk text;
  new_qual text;
  new_wchk text;
begin
  for r in
    select n.nspname as schemaname,
           c.relname as tablename,
           pol.polname as policyname,
           pg_get_expr(pol.polqual, pol.polrelid) as qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) as wchk
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  loop
    qual := coalesce(r.qual, '');
    wchk := coalesce(r.wchk, '');

    -- Envolver auth.*(...) y current_setting(...) con subselect para evitar initplan por fila
    new_qual := qual;
    if new_qual ~* '\mauth\.[a-z_]+\s*\(' and new_qual !~* '\(\s*select\s+auth\.' then
      new_qual := regexp_replace(new_qual, 'auth\.[a-z_]+\s*\([^\)]*\)', '(select \&)', 'gi');
    end if;
    if new_qual ~* '\mcurrent_setting\s*\(' and new_qual !~* '\(\s*select\s+current_setting\s*\(' then
      new_qual := regexp_replace(new_qual, 'current_setting\s*\([^\)]*\)', '(select \&)', 'gi');
    end if;

    new_wchk := wchk;
    if new_wchk ~* '\mauth\.[a-z_]+\s*\(' and new_wchk !~* '\(\s*select\s+auth\.' then
      new_wchk := regexp_replace(new_wchk, 'auth\.[a-z_]+\s*\([^\)]*\)', '(select \&)', 'gi');
    end if;
    if new_wchk ~* '\mcurrent_setting\s*\(' and new_wchk !~* '\(\s*select\s+current_setting\s*\(' then
      new_wchk := regexp_replace(new_wchk, 'current_setting\s*\([^\)]*\)', '(select \&)', 'gi');
    end if;

    if new_qual is distinct from qual or new_wchk is distinct from wchk then
      execute format('alter policy %I on %I.%I %s %s',
                     r.policyname, r.schemaname, r.tablename,
                     case when length(new_qual) > 0 then format('using (%s)', new_qual) else '' end,
                     case when length(new_wchk) > 0 then format('with check (%s)', new_wchk) else '' end);
    end if;
  end loop;
end$$;

-- 2) Reducir políticas redundantes: asegurar que políticas de "service role" sólo apliquen a service_role
do $$
begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='listing_questions' and policyname='service role can manage listing questions') then
    execute 'alter policy "service role can manage listing questions" on public.listing_questions to service_role';
  end if;

  -- Notifications: restringir variantes antiguas a service_role para evitar duplicados con las nuevas *_auth
  if exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_select') then
    execute 'alter policy notifications_select on public.notifications to service_role';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_insert') then
    execute 'alter policy notifications_insert on public.notifications to service_role';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_update') then
    execute 'alter policy notifications_update on public.notifications to service_role';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_delete') then
    execute 'alter policy notifications_delete on public.notifications to service_role';
  end if;
end$$;

-- 3) Listings: asegurar que políticas de modificación NO apliquen a anon
do $$
begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='listings' and policyname='Owners manage listings') then
    execute 'alter policy "Owners manage listings" on public.listings to authenticated, dashboard_user';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='listings' and policyname='Owners update listings') then
    execute 'alter policy "Owners update listings" on public.listings to authenticated, dashboard_user';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='listings' and policyname='listings_modify_own') then
    execute 'alter policy listings_modify_own on public.listings to authenticated, dashboard_user';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='listings' and policyname='listings_delete') then
    execute 'alter policy listings_delete on public.listings to authenticated, dashboard_user';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='listings' and policyname='listings_insert_own') then
    execute 'alter policy listings_insert_own on public.listings to authenticated, dashboard_user';
  end if;
  -- Mantener SELECT pública
  if exists (select 1 from pg_policies where schemaname='public' and tablename='listings' and policyname='listings_select_all') then
    execute 'alter policy listings_select_all on public.listings to anon, authenticated';
  end if;
end$$;

-- 4) Drop de índice duplicado en listing_questions (conserva idx_listing_questions_listing_created)
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='idx_lq_listing_created') then
    execute 'drop index if exists public.idx_lq_listing_created';
  end if;
end$$;

-- 5) Reporte: políticas potencialmente aún redundantes por rol/acción
with pol as (
  select schemaname, tablename, policyname, roles, cmd
  from pg_policies
  where schemaname='public'
)
select tablename, cmd as action, unnest(roles) as role, array_agg(policyname order by policyname) as policies
from pol
group by tablename, cmd, unnest(roles)
having count(*) > 1
order by tablename, action, role;
