# Email Schedule · Ciclo Market

Referencia de **todos los mails que se envían y cuándo** (estado: 2026-08-19).

> Proveedor de envío: **Brevo** (API HTTP, sin allowlist de IPs). `sendMail` prioriza
> `BREVO_API_KEY` → SMTP → Resend (fallback). Todo pasa por `server/src/lib/mail.js`.

---

## 1) Emails transaccionales (evento, sin horario)

Se envían cuando ocurre la acción. No dependen de cron.

| Email | Cuándo | Origen |
|---|---|---|
| Pago confirmado | Se acredita un pago de MercadoPago | `services/paymentService.js` |
| Consulta en tu publicación | Un comprador pregunta / el vendedor responde | `routes/appApi.js` |
| Tu tienda está activa | Se activa una tienda por primera vez | `src/index.js` |
| Alerta de verificación (staff) | Alguien solicita verificación | `routes/appApi.js` |

---

## 2) Email Engine — campañas automáticas (activas)

El orquestador corre **10:00 y 20:00 (ARG)** y cada campaña decide su día/hora
(`EMAIL_ENGINE_CRON=0 10,20 * * *`). Archivos en `server/src/email/campaigns/`.

| Campaña | Horario | Audiencia | Regla de envío |
|---|---|---|---|
| **Upgrade de plan Free** | Diario **20:00** | Free sin pago | 20% OFF individual / **bundle 50%** si 2+ publicaciones. **1 sola vez por usuario** |
| **¿Aún tenés tu bicicleta en venta?** | Diario **10:00** | Publicaciones activas | Cada **30 días** desde publicación. Botones: "Sigue en venta" / "Ya la vendí" |
| **Nuevos ingresos de la semana** | **Viernes 10:00** | Suscriptos a marketing | Semanal |
| **Activá WhatsApp (+70%)** | Diario **20:00** | Free sin WhatsApp | **Día 15** y **día 40** desde publicación (cada etapa 1 vez) |

Reglas globales (orquestador): opt-out (`marketing_emails_enabled`), supresiones
(`email_suppressions`), dedupe por `email_logs.idempotency_key` (solo `sent`), tope
de **3 emails/usuario/semana ISO**.

> El mail de **bundle** no es una campaña aparte: es la variante de `free_upgrade_offer`
> cuando el vendedor tiene 2+ publicaciones.

---

## 3) Emails APAGADOS (referencia)

Desactivados vía `*_ENABLED=false` en `render.yaml` / variables de Render. **No se envían.**

| Job | Se activa con |
|---|---|
| Newsletter / digest | `NEWSLETTER_DIGEST_ENABLED=true` |
| Review reminders (reseñas) | `REVIEW_REMINDER_ENABLED=true` |
| Recordatorio de renovación | `RENEWAL_NOTIFIER_ENABLED=true` |
| Extensión 90 días | `EXTEND_EXPIRED_ENABLED=true` |
| Búsquedas guardadas | `SAVED_SEARCH_DIGEST_ENABLED=true` |
| Digest de tiendas | `STORE_ANALYTICS_DIGEST_ENABLED=true` |
| Automations viejas (lun/mié/vie) | `MONDAY_NEW_ARRIVALS_ENABLED`, `WEDNESDAY_UPDATE_ENABLED`, `FRIDAY_UPGRADE_ENABLED` |
| Marketing automations | `MARKETING_AUTOMATIONS_ENABLED=true` |
| Campañas engine viejas | flags `campaign_*_enabled=false` en `app_settings` |

---

## 4) Envíos manuales

- **Blast upgrade free** (`server/scripts/campaigns/sendFreeUpgradeBlast.js`): corre a mano
  cuando se quiere; dedupe `free_upgrade_offer:{email}` (no duplica).
- **CRM admin** (`/api/admin/actions/send-email-template`): moderador manda templates a un vendedor.

---

## Configuración pendiente / a tener en cuenta

- **Render**: `BREVO_API_KEY` debe estar seteada (secreto) para que los envíos salgan
  por API. Si no, caen a SMTP (requiere autorizar IPs de Render en Brevo).
- **Render**: `REVIEW_REMINDER_ENABLED=false` (si estaba en `true` sigue mandando reseñas).
- **Firebase**: `sendUpgradeEmail` usa `BREVO_API_KEY` (secret) → `firebase deploy --only functions`.
- **Límite Brevo plan gratis**: ~300 emails/día.
- **Newsletter**: no hay; los 438 contactos de Resend quedaron intactos (sin importar).

---

## Archivos clave

| Propósito | Archivo |
|---|---|
| Envío central | `server/src/lib/mail.js` |
| API Brevo | `server/src/lib/brevo.js` |
| Orquestador + cron | `server/src/email/orchestrator.js` |
| Campañas | `server/src/email/campaigns/*.js` |
| Blast manual | `server/scripts/campaigns/sendFreeUpgradeBlast.js` |
| Migración contactos | `server/scripts/migrateResendToBrevo.js` |
