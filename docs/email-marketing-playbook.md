# Ciclo Market - Email Marketing Playbook (Operativo)

## Objetivo
Documento operativo para campañas de email de Ciclo Market: lógica, calendario, reglas de envío y comandos de ejecución.

## Reglas Globales del Engine
- Template base: `wednesdayListingUpdate` (sin rediseño estructural).
- Hard limit de fatiga: máximo **3 emails por usuario por semana ISO**.
- Supresiones: `email_suppressions` bloquea envíos de marketing.
- Opt-out: `user_notification_settings.marketing_emails_enabled=false` bloquea envíos.
- Dedupe: `email_logs.idempotency_key` evita duplicados por campaña/entidad.
- Prioridad de campañas (si compiten en el mismo run):
  1. `payment_abandon_20off`
  2. `upgrade_comparison`
  3. `price_drop_alert`
  4. `buyer_interest_weekly`
  5. `new_arrivals_weekly`
  6. `seller_weekly_performance`
  7. `external_lead_weekly`

## Campañas Activas
Estado actual en producción: **todas las campañas del engine están activas** vía cron jobs en Render.

### 1) Payment Abandon 20% (`payment_abandon_20off`)
- Propósito: recuperar upgrades abandonados.
- Ventana: pagos `pending` entre **10 minutos y 24 horas**.
- Fuente de verdad: `payments` + `payments.listing_id`.
- Validaciones duras:
  - listing existe,
  - listing `status in ('active','published')`,
  - listing sigue `free` (si ya pasó a premium/pro, no se envía).
- Dedupe: `payment_abandon:{email}:{paymentId}`.
- CTA: Premium/Pro con precio con 20%.

### 2) Upgrade Comparison (`upgrade_comparison`)
- Propósito: convertir listings `free` a paid.
- Target: listing free de bajo rendimiento.
- Benchmark: listing paid con mejor rendimiento real.
- Validación pre-envío en orquestador: listing target debe seguir `free`.
- Dedupe semanal: `upgrade_comparison:{userId}:{listingId}:{isoYear-isoWeek}`.

### 3) Price Drop Alert (`price_drop_alert`)
- Propósito: activar demanda ante baja de precio.
- Trigger: baja en `price_adjustments`.
- Audiencia: usuarios con vistas/likes recientes del listing.
- Frecuencia actual: 1 vez por día (cron dedicado).

### 4) Buyer Interest Weekly (`buyer_interest_weekly`)
- Propósito: reenganche por categoría de interés.
- Trigger: interés inferido desde `contact_events`.
- Envío semanal: lunes 20:00.
- Máx cards: 8.

### 5) New Arrivals Weekly (`new_arrivals_weekly`)
- Propósito: tráfico semanal al marketplace.
- Trigger: publicaciones nuevas últimos 7 días.
- Envío semanal: sábado 20:00.
- Máx cards: 8.

### 6) Seller Weekly Performance (`seller_weekly_performance`)
- Propósito: retorno al dashboard y optimización de listings.
- Contenido: views/contactos/favoritos + acciones sugeridas.
- Envío semanal: domingo 20:00.

## Calendario de Cron Jobs (Render)

### Configurados / recomendados
- `email-payment-abandon-10min`
  - Schedule: `*/10 * * * *`
  - Campaign: `payment_abandon_20off`
- `email-buyer-interest-2000`
  - Schedule: `0 20 * * 1` (lunes 20:00)
  - Campaign: `buyer_interest_weekly`
- `email-new-arrivals-2000`
  - Schedule: `0 20 * * 6` (sábado 20:00)
  - Campaign: `new_arrivals_weekly`
- `email-upgrade-comparison-wed`
  - Schedule: `0 20 * * 3` (miércoles 20:00)
  - Campaign: `upgrade_comparison`
- `email-seller-weekly-sun`
  - Schedule: `0 20 * * 0` (domingo 20:00)
  - Campaign: `seller_weekly_performance`
- `email-price-drop-daily`
  - Schedule: `0 12 * * *` (diario 12:00)
  - Campaign: `price_drop_alert`

## Comando Base de Ejecución
```bash
curl -X POST "https://ciclo-market.onrender.com/api/cron/email-orchestrator" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":false,"campaigns":["NOMBRE_CAMPAÑA"]}'
```

## QA / Operación
- Limpiar historial de test para un email:
```sql
delete from public.email_logs where lower(email_to) = 'usuario@dominio.com';
```
- Quitar supresión de test:
```sql
delete from public.email_suppressions where lower(email) = 'usuario@dominio.com';
```
- Ver últimos logs de una campaña:
```sql
select created_at, campaign, status, skip_reason, email_to, listing_id, payment_id
from public.email_logs
where campaign = 'payment_abandon_20off'
order by created_at desc
limit 100;
```

## Notas de UX actuales
- En mobile: grids pasan a 1 columna para evitar deformación/desfase.
- Listing cards con imagen cuadrada (`object-fit: cover`) para evitar formato banner.
- CTAs sin duplicación (un solo CTA por plan).
