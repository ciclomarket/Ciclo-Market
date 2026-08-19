-- ============================================================================
-- ACTIVAR NUEVAS CAMPAÑAS DE EMAIL (v2) — Ciclo Market
-- ============================================================================
-- Activa SOLO las 4 campañas reformuladas y desactiva las anteriores.
--
-- 1) free_upgrade_offer  : upgrade de plan Free con descuento (diario 20:00, 1 vez por publicación)
-- 2) sold_followup       : "¿Aún tenés tu bicicleta en venta?" (cada 30 días, 2 botones)
-- 3) new_arrivals_weekly : nuevos ingresos de la semana (viernes 10:00)
-- 4) whatsapp_upsell     : activar WhatsApp (día 15 y día 40 desde publicación)
--
-- Requisitos previos en Render (servicio Ciclo-Market):
--   EMAIL_ENGINE_ENABLED = true
--   EMAIL_ENGINE_CRON    = 0 10,20 * * *
--   (los demás *_ENABLED de email quedan en false)
-- ============================================================================

-- 1) Tabla de eventos de la campaña sold_followup (botones del mail)
create table if not exists public.sold_followup_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  listing_id uuid null references public.listings(id) on delete cascade,
  seller_id uuid null references public.users(id) on delete set null,
  action text not null check (action in ('still_selling', 'sold')),
  source text not null default 'email',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_sold_followup_events_listing
  on public.sold_followup_events (listing_id, created_at desc);

-- Solo el server (service role) escribe/lee; sin acceso público.
alter table public.sold_followup_events enable row level security;

-- 2) Encender el engine y SOLO las 4 campañas nuevas
insert into public.app_settings(key, value)
values
  ('email_engine_enabled',                       '{"enabled": true}'::jsonb),
  ('campaign_free_upgrade_offer_enabled',        '{"enabled": true}'::jsonb),
  ('campaign_sold_followup_enabled',             '{"enabled": true}'::jsonb),
  ('campaign_new_arrivals_weekly_enabled',       '{"enabled": true}'::jsonb),
  ('campaign_whatsapp_upsell_enabled',           '{"enabled": true}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 3) Desactivar explícitamente las campañas viejas
insert into public.app_settings(key, value)
values
  ('campaign_payment_abandon_20off_enabled',     '{"enabled": false}'::jsonb),
  ('campaign_upgrade_comparison_enabled',        '{"enabled": false}'::jsonb),
  ('campaign_price_drop_alert_enabled',          '{"enabled": false}'::jsonb),
  ('campaign_buyer_interest_weekly_enabled',     '{"enabled": false}'::jsonb),
  ('campaign_seller_weekly_performance_enabled', '{"enabled": false}'::jsonb),
  ('campaign_external_lead_weekly_enabled',      '{"enabled": false}'::jsonb),
  ('campaign_free_listing_upgrade_reminder_enabled', '{"enabled": false}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();
