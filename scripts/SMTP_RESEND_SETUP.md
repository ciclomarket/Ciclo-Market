Resend setup (SMTP o API)

Environment variables (server):

Opción A: API (recomendada en PaaS)
- `RESEND_API_KEY=REPLACE_WITH_YOUR_RESEND_API_KEY`
- `SMTP_FROM="Ciclo Market <notificaciones@TU_DOMINIO_VERIFICADO>"`
- `SMTP_LOGGER=false` (opcional)

Opción B: SMTP (si tu PaaS habilita salida SMTP)
- `SMTP_ENABLED=true`
- `SMTP_HOST=smtp.resend.com`
- `SMTP_PORT=587`
- `SMTP_SECURE=false` (true solo si usás 465)
- `SMTP_USER=resend`
- `SMTP_PASSWORD=REPLACE_WITH_YOUR_RESEND_API_KEY`
- `SMTP_FROM="Ciclo Market <notificaciones@TU_DOMINIO_VERIFICADO>"`
- `SMTP_LOGGER=false` (opcional)

Notas:
- El dominio del remitente (`@TU_DOMINIO_VERIFICADO`) debe estar verificado en Resend.
- En muchos PaaS (Render, Vercel, etc.) la salida SMTP puede estar bloqueada o limitada. Si ves `ETIMEDOUT` en logs, usá la Opción A (API).
- El backend ya está listo: usará la API de Resend si `RESEND_API_KEY` está presente; de lo contrario intentará SMTP.

Prueba rápida local:
1) Exportá las variables anteriores (o agregalas al `.env` del servidor).
2) Dispará una notificación desde el front (publicá una consulta o una respuesta).
3) Revisá logs del servidor: si `SMTP_LOGGER=true` verás detalles del envío.
