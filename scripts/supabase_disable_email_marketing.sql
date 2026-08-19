-- ============================================================================
-- APAGAR TODO EL EMAIL MARKETING DE CICLO MARKET
-- ============================================================================
-- Apaga el Email Engine completo (las 8 campañas del orquestador) + cada
-- campaña individualmente.
--
-- IMPORTANTE: Este script tiene efecto INMEDIATO (el orquestador lee estos
-- flags en CADA corrida), sin necesidad de redeploy ni tocar variables de
-- entorno de Render.
--
-- Para revertir: volver a setear 'enabled': true en las keys deseadas.
-- ============================================================================

-- 1) Master switch: apaga TODO el Email Engine (corta todas las campañas)
insert into public.app_settings(key, value)
values ('email_engine_enabled', '{"enabled": false}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 2) Cada campaña individual (por redundancia y para dejarlo documentado)
insert into public.app_settings(key, value)
values
  ('campaign_payment_abandon_20off_enabled',             '{"enabled": false}'::jsonb),
  ('campaign_upgrade_comparison_enabled',                '{"enabled": false}'::jsonb),
  ('campaign_price_drop_alert_enabled',                  '{"enabled": false}'::jsonb),
  ('campaign_buyer_interest_weekly_enabled',             '{"enabled": false}'::jsonb),
  ('campaign_new_arrivals_weekly_enabled',               '{"enabled": false}'::jsonb),
  ('campaign_seller_weekly_performance_enabled',         '{"enabled": false}'::jsonb),
  ('campaign_external_lead_weekly_enabled',              '{"enabled": false}'::jsonb),
  ('campaign_free_listing_upgrade_reminder_enabled',     '{"enabled": false}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ============================================================================
-- NOTA: Los demás jobs de email (renewalNotifier, newsletterDigest,
-- reviewReminder, marketingAutomations, monday/wednesday/friday, etc.) se
-- controlan por variables de entorno (*_ENABLED) en Render, NO por esta tabla.
-- Para apagarlos también, ver render.yaml (todos en "false").
-- ============================================================================
