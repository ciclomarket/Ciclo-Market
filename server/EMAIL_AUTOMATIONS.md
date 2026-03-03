# Email Automations - CicloMarket

Sistema de 3 automatizaciones de email semanales con flujo profesional y testeable.

## 📋 Automatizaciones

| Día | Nombre | Audiencia | Contenido |
|-----|--------|-----------|-----------|
| **Lunes 9am** | Nuevos ingresos | `user_notification_settings.marketing_emails = true` | 8 últimos listings de la semana |
| **Miércoles 10am** | Actualización de publicación | Usuarios con listings activos | Stats de performance (visitas, contactos) |
| **Viernes 11am** | Upgrade para plan Free | Usuarios con plan `free` | Incentivo a upgrade con checkout MP |

## 🔧 Variables de Entorno (Render)

### Habilitar/Deshabilitar

```bash
# Lunes - Nuevos ingresos
MONDAY_NEW_ARRIVALS_ENABLED=true
MONDAY_NEW_ARRIVALS_CRON=0 9 * * 1
MONDAY_NEW_ARRIVALS_TZ=America/Argentina/Buenos_Aires

# Miércoles - Update de listings
WEDNESDAY_UPDATE_ENABLED=true
WEDNESDAY_UPDATE_CRON=0 10 * * 3
WEDNESDAY_UPDATE_TZ=America/Argentina/Buenos_Aires

# Viernes - Upgrade offer
FRIDAY_UPGRADE_ENABLED=true
FRIDAY_UPGRADE_CRON=0 11 * * 5
FRIDAY_UPGRADE_TZ=America/Argentina/Buenos_Aires
```

> **Nota:** Las automatizaciones están **deshabilitadas por defecto**. Seteá `ENABLED=true` para activarlas.

### Secrets requeridos (ya existen)

```bash
RESEND_API_KEY=re_xxxx
SMTP_FROM="Ciclo Market <admin@ciclomarket.ar>"
CRON_SECRET=tu_secret_para_endpoints
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxx
FRONTEND_URL=https://www.ciclomarket.ar
SERVER_BASE_URL=https://ciclo-market.onrender.com
```

## 🧪 Comandos de Test (CLI)

### Desde Render (SSH) o local:

```bash
# Monday - Dry run (preview)
npm run email:monday:dry

# Monday - Enviar real
npm run email:monday:once

# Wednesday - Dry run
npm run email:wednesday:dry

# Wednesday - Enviar real  
npm run email:wednesday:once

# Friday - Dry run
npm run email:friday:dry

# Friday - Enviar real
npm run email:friday:once
```

### Script universal con preview:

```bash
# Monday - Test a email específico
node scripts/sendTestEmail.js --template monday --to tu@email.com --dry-run

# Wednesday - Test con seller específico
node scripts/sendTestEmail.js --template wednesday --to tu@email.com --seller-id <uuid> --dry-run

# Friday - Test con seller específico
node scripts/sendTestEmail.js --template friday --to tu@email.com --seller-id <uuid> --dry-run

# Enviar real (sin --dry-run)
node scripts/sendTestEmail.js --template friday --to tu@email.com --seller-id <uuid>
```

## 🌐 Endpoints HTTP (curl)

### Health check
```bash
curl https://ciclo-market.onrender.com/api/cron/health
```

### Dry Run (preview sin enviar)

```bash
# Monday - Preview de destinatarios y HTML
curl -X POST https://ciclo-market.onrender.com/api/cron/monday-new-arrivals \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true,"limit":5}'

# Wednesday
curl -X POST https://ciclo-market.onrender.com/api/cron/wednesday-listing-update \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true,"limit":5}'

# Friday
curl -X POST https://ciclo-market.onrender.com/api/cron/friday-upgrade-offer \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true,"limit":5}'
```

### Ejecutar real (producción)

```bash
# Monday - Enviar emails reales (limit 50 por defecto)
curl -X POST https://ciclo-market.onrender.com/api/cron/monday-new-arrivals \
  -H "Authorization: Bearer $CRON_SECRET" \
  -d '{"dryRun":false}'

# Forzar envío ignorando cooldown (14 días)
curl -X POST https://ciclo-market.onrender.com/api/cron/friday-upgrade-offer \
  -H "Authorization: Bearer $CRON_SECRET" \
  -d '{"dryRun":false,"force":true}'
```

### Stats de envíos
```bash
curl "https://ciclo-market.onrender.com/api/cron/email-stats?days=30" \
  -H "Authorization: Bearer $CRON_SECRET"
```

## 📊 Respuesta de Dry Run

```json
{
  "ok": true,
  "automation": "monday_new_arrivals",
  "dryRun": true,
  "sent": 0,
  "recipientsCount": 128,
  "listingsCount": 8,
  "recipients": [
    {
      "userId": "uuid-1",
      "email": "user1@example.com",
      "subject": "Nuevos ingresos en CicloMarket (8 bicis)",
      "preview": "<!DOCTYPE html>..."
    }
  ],
  "preview": "<!DOCTYPE html>..."
}
```

## 🗄️ Base de Datos

### Tabla: `email_automation_logs`

Tracking de envíos para evitar spam y métricas.

```sql
-- Ejecutar: scripts/supabase_email_automations.sql

SELECT * FROM email_automation_logs 
WHERE automation_type = 'friday_upgrade' 
ORDER BY sent_at DESC 
LIMIT 10;
```

### Vista: `v_email_automation_stats`

Stats diarias para dashboard.

```sql
SELECT * FROM v_email_automation_stats 
WHERE date >= CURRENT_DATE - 7;
```

## 🛡️ Protecciones Anti-Spam

1. **Cooldown por usuario:** No se reenvía a mismo usuario en:
   - Monday: 7 días
   - Wednesday: 7 días  
   - Friday: 14 días

2. **Rate limiting:** 1 email cada 1.5 segundos (Resend)

3. **Unsubscribe:** Link automático firmado con HMAC

4. **List-Unsubscribe header:** Para clientes de email compatibles

## 📁 Estructura de Archivos

```
server/
├── src/
│   ├── jobs/
│   │   ├── mondayNewArrivals.js      # Lunes
│   │   ├── wednesdayListingUpdate.js # Miércoles
│   │   └── fridayUpgradeOffer.js     # Viernes
│   ├── emails/
│   │   └── emailBase.js              # Layout base + helpers
│   └── routes/
│       └── emailCron.js              # Endpoints HTTP
├── scripts/
│   └── sendTestEmail.js              # CLI universal
└── package.json                      # Scripts npm
```

## 🔍 Troubleshooting

### "Mail no configurado"
Verificá que `RESEND_API_KEY` esté seteada en Render.

### "No subscribers to email"
Para Monday: verificá que existan usuarios con `user_notification_settings.marketing_emails = true`.

### "No free plan sellers"
Para Friday: verificá que existan listings con `plan = 'free'` o `plan_code = 'free'`.

### Jobs no inician
Revisá los logs de Render:
```
[monday_new_arrivals] disabled (MONDAY_NEW_ARRIVALS_ENABLED != "true")
```

Seteá la variable en Render y redeployá.
