-- Revert: quitar columna google_place_id agregada para Google Reviews
do $$
begin
  execute 'alter table public.users drop column if exists google_place_id';
exception when others then
  null;
end$$;

