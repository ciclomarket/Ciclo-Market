-- Endurecimiento de funciones: fijar search_path para evitar escaladas por shadowing
-- Ejecutar en el editor SQL de Supabase. Idempotente / tolerante.

do $$
declare
  fn record;
  target_names text[] := array[
    'touch_thread_on_message',
    'is_moderator',
    'trg_lq_set_meta',
    'trg_listing_questions_set_meta',
    'set_users_updated_at',
    'mark_thread_read',
    'notify_chat_message',
    'decrement_gift_uses',
    'listings_apply_plan_snapshot',
    'listings_plan_guard',
    -- también aplicamos a esta función local por buenas prácticas
    'mark_notifications_read'
  ];
begin
  for fn in
    select p.oid::regprocedure as regproc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(target_names)
  loop
    execute format('alter function %s set search_path = public, pg_temp', fn.regproc);
  end loop;
end$$;

-- Reporte de verificación: funciones en public cuyo search_path no está fijado
select p.proname as function,
       p.oid::regprocedure as signature,
       coalesce(array_to_string(p.proconfig, ', '), '') as settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proconfig is null
    or not exists (
      select 1
      from unnest(p.proconfig) cfg
      where cfg ilike 'search_path=%'
    )
  )
order by 1;

