-- Agrega columnas para marcar pagos aplicados a destaques y upgrades.
-- Ejecutar una sola vez en el proyecto de Supabase (producción y/o staging).

alter table public.payments
  add column if not exists applied boolean default false;

alter table public.payments
  add column if not exists applied_at timestamptz;

comment on column public.payments.applied is 'Indica si el pago ya se aplicó (p. ej. destaque otorgado).';
comment on column public.payments.applied_at is 'Fecha en la que se aplicó el pago.';
