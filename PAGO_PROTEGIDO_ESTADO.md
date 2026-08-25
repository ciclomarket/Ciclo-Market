# Pago Protegido — Estado del desarrollo

Última actualización: 2026-08-25

Plan de negocio original: `ciclo-market-pago-protegido-plan.md` (raíz del repo).

## Resumen

Se construyó la estructura base de Pago Protegido en tres fases (A, B, y una sub-fase B.1–B.3), todo corriendo en **sandbox** de Mercado Pago (`MP_MARKETPLACE_LIVE_MODE=false`). El checkout con Split (`marketplace_fee`) está fallando en pruebas ("Algo salió mal") y quedó una prueba diagnóstica corriendo (comisión en 0% temporalmente) para aislar si el problema es el split en sí o la cuenta/tarjeta de test. **La sección de checklist se sacó del formulario de publicación por decisión del 2026-08-25** — el flujo de precompra se va a rediseñar (ver "Próximo diseño" más abajo) antes de reactivarla.

---

## Qué está hecho

### Fase A — Modelo de datos + OAuth de vendedor
- Tablas en Supabase: `seller_mp_accounts`, `protected_orders`, `protected_order_events`, `protected_order_disputes`, con RLS.
- Columnas en `listings`: `condition_checklist` (jsonb), `protected_payment_eligible` (bool).
- OAuth Mercado Pago Split: `server/src/services/sellerMpOauthService.js`, rutas `/api/mp/oauth/connect`, `/api/mp/oauth/callback`, `/api/mp/oauth/status`.
- Tokens de vendedor cifrados en reposo (AES-256-GCM) — `server/src/lib/crypto.js`.
- Se reusa la app de Mercado Pago existente ("Ciclo Market", id `2621966964658368`, la misma de las suscripciones) para el OAuth — la app dedicada nueva (`5933585814569182`) quedó creada pero sin activar (bug/bloqueo del lado de MP al activar credenciales de producción).
- Probado end-to-end: dos usuarios reales (`rodrigozalazarml@gmail.com`, `rodrigozalazarcoach@gmail.com`) conectaron su cuenta de MP en sandbox contra el vendedor de prueba `TESTUSER5006008853095280396`.

### Fase B.1 — Checkout, checklist, verificación, badge
- `server/src/services/protectedOrderService.js`: crea la orden (`protected_orders`), genera preferencia de Checkout Pro con el token OAuth del vendedor + `marketplace_fee`, procesa confirmación vía webhook (`paid_held`).
- Ruta `POST /api/protected-orders/checkout`.
- Webhook (`/api/mp/webhook`) distingue pagos de Pago Protegido vs pagos de planes por `metadata.type`.
- Gate de verificación de identidad (Didit / `users.verified`) exigido a **comprador y vendedor** antes de poder pagar — validado server-side en `createProtectedOrderCheckout` (defensa en profundidad, no solo en el cliente).
- Vista `listings_enriched` actualizada para exponer `condition_checklist` / `protected_payment_eligible` al frontend.
- Componente `src/components/listing/ConditionChecklist.tsx` (checklist de condición con foto por ítem: cuadro, transmisión, frenos, ruedas, rayones) — **ya no está enganchado en el formulario de publicación** (se sacó de `StepPhotos.tsx` / `CreateListing.tsx` el 2026-08-25), pero el componente sigue en el repo para reutilizar cuando se rediseñe el flujo.
- Badge "🛡️ Pago Protegido" en `ListingCard.tsx` quedó armado — solo aparece si `listing.protectedPaymentEligible` es `true` (hoy ningún listing nuevo lo tiene, salvo el listing de prueba ya existente).
- Botón "Comprar con Pago Protegido" en `ListingDetail.tsx` — sigue activo.

### Fase B.2 — Panel del vendedor + T&C
- Página `/panel/pago-protegido` (`src/pages/PagoProtegido/Panel.tsx`): estado de conexión con MP, checkbox de aceptación de T&C, botón conectar.
- Columna `seller_mp_accounts.tos_accepted_at` — se registra antes de redirigir a MP (`/api/mp/oauth/connect?acceptedTos=1`).
- Página de Términos y Condiciones `/pago-protegido/terminos` (`src/pages/PagoProtegido/Terms.tsx`) — **borrador**, basado en el plan de negocio, pendiente de revisión legal antes de producción real.

### Fase B.3 — Chat pre-conciliación (a rediseñar, ver abajo)
- Tablas `protected_chat_threads` / `protected_chat_messages` con RLS (comprador, vendedor, y admin/moderador vía `user_roles`).
- Servicio `src/services/protectedChat.ts` y modal `src/components/listing/ProtectedChatModal.tsx` (polling cada 4s, sin realtime).
- Hoy es un **popup en la ficha del listing** — el comprador ve "Preguntar antes de comprar" y el vendedor ve sus hilos abiertos dentro de su propia página de listing. **No hay un inbox centralizado en el dashboard.**

---

## Qué está roto / pendiente de resolver

### 🔴 Checkout con Split falla en sandbox
Al intentar pagar (tarjeta de test `4509 9535 6623 3704`, nombre `APRO`, DNI `12345678`) aparece "Algo salió mal" del lado de Mercado Pago, sin ningún error logueado en nuestro backend (la preferencia se crea bien). Hipótesis: los pagos con `marketplace_fee` (Split) combinados con cuentas de prueba en ambos lados (comprador y vendedor) son inestables en el sandbox de MP — problema reportado por otros developers, no necesariamente algo mal en nuestra integración.

**Prueba diagnóstica en curso**: `PROTECTED_PAYMENT_COMMISSION_PCT=0` está seteado en Render (comisión 0%, sin `marketplace_fee` en la preferencia — ver commit `860ed07`). Falta reintentar la compra en este estado para confirmar si el pago simple (sin split) se aprueba. Si se aprueba → el problema es específicamente el split en sandbox con test users (habría que evaluar si conviene certificar con MP support, o directamente probar el flujo completo recién en producción real con cuentas verdaderas). Si sigue fallando → el problema es otra cosa (cuenta, tarjeta, o algo en la preferencia).

**Recordatorio**: volver a poner `PROTECTED_PAYMENT_COMMISSION_PCT=3` en Render una vez terminada la prueba.

### 🟡 Rediseño del flujo de precompra (pendiente, no implementado)
El 2026-08-25 se discutió un cambio de fondo al flujo, todavía **sin definir del todo**:

1. **Mensajería centralizada**: el chat comprador-vendedor no debería vivir solo en un popup de la ficha del listing — tiene que aparecer en una sección "Mensajes" dentro del dashboard de cada usuario (inbox real, no modal). Esto implica construir una vista nueva en `DashboardUnified.tsx` (o una página aparte) que liste todos los hilos del usuario (como comprador y como vendedor) y no solo los de un listing puntual.

2. **Reserva paga en vez de chat gratis**: en lugar de (o además de) el chat gratuito actual, el comprador podría "reservar" la bicicleta pagando directamente el 3% (el marketplace fee) por adelantado — ej. bici de $10.000, reserva de $300. Esa reserva:
   - Habilita la mensajería con el vendedor (en vez de ser gratis para cualquiera).
   - Si la operación **se concreta**, Ciclo Market se queda con ese 3% ya cobrado (es la comisión definitiva, el comprador paga el resto del precio sin comisión adicional).
   - Si la operación **no prospera**, el comprador puede cancelar y pedir el reembolso total del 3% — es decir, ese dinero tiene que quedar **retenido** (no gastado/liquidado) hasta que se sepa el resultado, lo cual requiere un estado de orden nuevo tipo `reserved` (distinto de `paid_held`, que hoy asume que ya se pagó el precio completo de la bici) y lógica de reembolso vía la API de Mercado Pago (`/v1/payments/{id}/refunds`) usando el token OAuth del vendedor (porque el dinero está en su cuenta collector).
   - Quedó **sin definir**: si esto reemplaza por completo al chat gratuito o convive con él (el usuario dijo "dejemoslo acá por ahora" antes de definir ese punto).

3. Preguntas ya respondidas para cuando se retome el diseño:
   - El 3% de la reserva, si la venta se concreta, **se lo queda Ciclo Market como comisión definitiva** (no se cobra un 3% adicional después).
   - La cancelación/reembolso la dispara **el comprador**.

**Nada de esto está implementado todavía** — ni la tabla de "reservas", ni el endpoint de reembolso, ni el inbox de mensajes en el dashboard. Es el próximo bloque de trabajo, pendiente de que el usuario termine de definir el punto 1 (si reemplaza o convive con el chat gratis) y probablemente algunos detalles más (plazo máximo de una reserva antes de vencer automáticamente, qué pasa si el vendedor quiere cancelar, etc., como en las mitigaciones del plan de negocio original).

### 🟡 Otros pendientes menores
- Panel de disputas (Fase 3 del plan de negocio original) — no empezado.
- Flujo de tracking de envío + confirmación de recepción + liberación automática a las 48-72h — no empezado (es la Fase C / flujo post-venta).
- T&C (`/pago-protegido/terminos`) es un borrador, falta revisión de un abogado antes de exponerlo a usuarios reales.
- App dedicada de Mercado Pago (`5933585814569182`) quedó a medio crear — se puede reintentar activarla más adelante si se quiere separar el Split del OAuth de suscripciones, o simplemente eliminarla si se decide seguir usando la app compartida.

---

## Dónde está cada cosa (referencia rápida)

| Pieza | Archivo/tabla |
|---|---|
| OAuth vendedor | `server/src/services/sellerMpOauthService.js` |
| Checkout + webhook Split | `server/src/services/protectedOrderService.js`, `server/src/services/paymentService.js` |
| Cifrado de tokens | `server/src/lib/crypto.js` |
| Panel vendedor | `src/pages/PagoProtegido/Panel.tsx` |
| T&C (borrador) | `src/pages/PagoProtegido/Terms.tsx` |
| Checklist de condición (desenganchado) | `src/components/listing/ConditionChecklist.tsx` |
| Chat pre-compra (popup) | `src/components/listing/ProtectedChatModal.tsx`, `src/services/protectedChat.ts` |
| Botón de compra | `src/pages/ListingDetail.tsx` |
| Tablas Supabase | `seller_mp_accounts`, `protected_orders`, `protected_order_events`, `protected_order_disputes`, `protected_chat_threads`, `protected_chat_messages` |
| Migraciones (no versionadas en git, `supabase/` está en `.gitignore`) | `supabase/migrations/20260825_pago_protegido_*.sql` |

## Variables de entorno relevantes (Render + `.env` local)

```
MP_MARKETPLACE_CLIENT_ID=2621966964658368
MP_MARKETPLACE_CLIENT_SECRET=<ver Render>
MP_MARKETPLACE_REDIRECT_URI=https://ciclo-market.onrender.com/api/mp/oauth/callback
MP_MARKETPLACE_LIVE_MODE=false
MP_OAUTH_STATE_SECRET=<ver Render>
APP_ENCRYPTION_KEY=<ver Render — debe coincidir en local y producción>
PROTECTED_PAYMENT_COMMISSION_PCT=0   # ⚠️ temporalmente en 0 para diagnóstico, volver a 3 después
```
