-- Agregar campo de biografía al perfil de usuarios (idempotente)
-- Ejecutar en el editor SQL de Supabase

do $$
begin
  execute 'alter table public.users add column if not exists bio text null';
end$$;

