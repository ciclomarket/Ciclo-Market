-- Campo de horarios para tiendas (texto libre)
-- Ejecutar en Supabase

do $$
begin
  execute 'alter table public.users add column if not exists store_hours text null';
exception when others then
  -- ignorar si no aplica
  null;
end$$;

