-- Agregar columna plan_type a store_subscriptions (idempotente)
ALTER TABLE public.store_subscriptions
  ADD COLUMN IF NOT EXISTS plan_type text CHECK (plan_type IN ('monthly', 'yearly'));
