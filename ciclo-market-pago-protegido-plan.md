# Ciclo Market — Pago Protegido
## Plan de implementación: tercera vía de monetización mediante intermediación segura de pagos

---

## 1. Resumen ejecutivo

Ciclo Market suma un tercer modelo de ingresos a los ya existentes (suscripciones Pro/Premium y cuentas de Tienda): un servicio de **pago protegido** para transacciones entre comprador y vendedor, similar al mecanismo de MercadoLibre. El comprador paga, el dinero queda retenido por el procesador de pagos hasta que confirma la recepción de la bicicleta en condiciones aceptables, y recién ahí se libera al vendedor. Ciclo Market cobra una comisión de intermediación sobre cada operación protegida.

**Principio rector del diseño:** Ciclo Market nunca custodia dinero de terceros. Toda la plata pasa por un Proveedor de Servicios de Pago (PSP) ya registrado ante el BCRA —Mercado Pago, vía su producto Split de Pagos— que retiene y distribuye los fondos por API. Ciclo Market solo controla, mediante lógica de negocio, *cuándo* se autoriza la liberación. Esto evita que la plataforma deba registrarse como PSP, evita exposición fiscal por fondos de terceros circulando por su cuenta, y evita quedar bajo el radar de controles antilavado por manejar efectivo/transferencias ajenas.

---

## 2. Estructura del negocio

### 2.1 Modelo de ingresos

| Línea de negocio | Estado | Mecanismo de cobro |
|---|---|---|
| Suscripciones Pro / Premium | Activo | Mercado Pago Suscripciones |
| Cuentas de Tienda | Estancado, en pausa | — |
| **Pago Protegido (nuevo)** | A implementar | Split de Pagos MP — comisión facturada directo a Ciclo Market |

La comisión de Pago Protegido es independiente de los planes de publicación: un listing Pro o Premium puede o no ofrecer la opción de pago protegido en el checkout, según decida el vendedor.

### 2.2 Comisión propuesta

- **Rango objetivo: 3% a 5% del valor de la bicicleta**, a cargo del comprador (es quien solicita la garantía; no le resta margen al vendedor, que ya paga su plan de publicación).
- **Lanzamiento: arrancar en 3%** para incentivar adopción temprana y juntar datos reales de siniestralidad antes de ajustar el número hacia arriba.
- Costo de procesamiento de Mercado Pago (2,99%–5,99% + IVA según plazo de acreditación) es adicional y lo absorbe/traslada el vendedor según su configuración, tal como ya ocurre hoy.
- La comisión de Ciclo Market se descuenta automáticamente en la misma transacción vía el parámetro `marketplace_fee` (Checkout Pro) o `application_fee` (Checkout API) de Mercado Pago, y se acredita directo en la cuenta de Ciclo Market — separada del monto que recibe el vendedor. Esto permite facturarla limpiamente como ingreso propio, sin que la plata de la venta haya tocado la cuenta de la plataforma.

### 2.3 A quién se le cobra

- Comprador: comisión de pago protegido (3-5%).
- Vendedor: nada adicional al plan de publicación que ya tenga.

---

## 3. Arquitectura técnica

### 3.1 Componentes

- **Mercado Pago Split de Pagos (Checkout Pro o Checkout API)** — retiene el pago del comprador, calcula el split, libera al vendedor con `access_token` obtenido vía OAuth por cada vendedor.
- **Backend de Ciclo Market** — dispara la liberación vía API cuando se cumple la condición de negocio (confirmación del comprador o vencimiento del plazo sin reclamo).
- **Panel de disputas** — sobre el stack existente (Supabase + n8n), para carga de evidencia y resolución de reclamos.
- **Tracking de envío obligatorio** — integración con couriers (Andreani, Correo Argentino, OCA) o carga manual de número de seguimiento como condición para habilitar el pago protegido en ese envío.

### 3.2 Flujo de la transacción

1. Comprador elige "Comprar con Pago Protegido" en el checkout.
2. Pago se procesa vía Split de Pagos; fondos quedan retenidos en Mercado Pago (no en Ciclo Market).
3. Vendedor despacha con tracking; sube número de seguimiento en la plataforma.
4. Comprador recibe la bicicleta. Tiene una ventana de tiempo definida para:
   - Confirmar recepción conforme → liberación inmediata, o
   - Abrir un reclamo con evidencia → pasa a disputa.
5. Si no hay acción del comprador dentro de la ventana → **liberación automática**.
6. Split ejecuta la distribución: comisión a Ciclo Market, resto al vendedor.

### 3.3 Costo de desarrollo estimado

- Integración de Split de Pagos: referencia de mercado USD 2.000–4.000 si se terceriza; menor si se desarrolla internamente con el stack ya disponible (Claude Code, n8n).
- Panel de disputas y checklist de condición: desarrollo interno, a estimar según sprint.

---

## 4. Marco legal y regulatorio

### 4.1 Encuadre PSP/BCRA — confirmado por investigación

El BCRA define a un PSP como quien cumple al menos una función dentro de un esquema de pago minorista (ofrecer cuentas de pago, custodiar fondos de clientes, etc.), con registro obligatorio ante la SEFyC. Ciclo Market, al operar exclusivamente vía Split de Pagos de Mercado Pago —sin custodiar fondos propios en ningún momento—, no encaja en esa definición: quien está registrado como PSP es Mercado Pago, no Ciclo Market. **Igual conviene confirmarlo formalmente con un abogado fintech antes del lanzamiento**, en particular si en el futuro se suma algún flujo alternativo de cobro que sí implique retener plata en una cuenta propia.

### 4.2 Botón de arrepentimiento (Ley 24.240, art. 34) — corrección importante respecto del supuesto inicial

**El supuesto de que las operaciones C2C (particular a particular) quedarían automáticamente fuera de esta norma es incorrecto.** Desde la reforma de 2008 a la Ley 24.240, la calidad de "proveedor" ya no requiere habitualidad: un particular que vende una bici usada, aunque sea una sola vez, puede ser considerado proveedor en esa transacción puntual, y el comprador consumidor. Como la venta se concreta a distancia (online), cae dentro del supuesto del art. 34, que otorga al comprador 10 días corridos para revocar la aceptación sin dar motivo — un derecho que **no puede dispensarse ni renunciarse por contrato**.

**Cómo lo resuelven los marketplaces existentes** (en vez de intentar excluirse de la ley):
- No reemplazan el derecho legal por contrato — arman un programa comercial propio, adicional, con sus propias reglas de plazos y causales.
- MercadoLibre, con su programa "Compra Protegida", da 30 días para productos nuevos pero solo **5 días** para productos usados o reacondicionados — más corto que los 10 días legales.
- ML se posiciona explícitamente como "operador de la plataforma", no como vendedor, y aclara que su programa no está por encima de la Ley de Defensa del Consumidor: si un usuario no está conforme con la resolución interna, puede escalar por Defensa del Consumidor o COPREC.

**Implicancia para Ciclo Market**: la ventana de 48-72h que se definió en la Fase de disputas no es "la ley" — es la política operativa de cuándo se libera el pago dentro del servicio de Pago Protegido. El derecho de arrepentimiento legal de 10 días sigue existiendo en paralelo, como relación directa entre comprador y vendedor, y Ciclo Market no puede extinguirlo por contrato. La solución (igual que hace ML) es separar ambas cosas con claridad en los Términos y Condiciones: el Pago Protegido es un beneficio comercial adicional, y no impide que el comprador ejerza sus derechos legales por otra vía si no está conforme con la resolución de la plataforma.

### 4.3 Facturación

La comisión de Ciclo Market se factura como servicio de intermediación (mismo tratamiento impositivo que las suscripciones Pro/Premium — IIBB, retenciones de ARCA vía agente de retención de Mercado Pago).

### 4.4 Términos y condiciones

Redactar cláusula específica del servicio de Pago Protegido: causales de disputa, plazos de liberación (operativos, no legales), rol de Ciclo Market como intermediario tecnológico (no como parte de la compraventa ni garante de la condición mecánica del producto), y aclaración explícita de que el usuario conserva sus derechos bajo la Ley 24.240 por fuera del programa.

---

## 5. Comparación con otros marketplaces argentinos

| Plataforma | Pago protegido | Comisión | Modelo |
|---|---|---|---|
| **MercadoLibre** | Sí — "Compra Protegida" | ~13-27% (incluye exposición del listing) | Mediación propia + reembolso; 30 días nuevo / 5 días usado |
| **Bicify** (competidor directo, mismo rubro) | Sí — "Pago Seguro Bicify", opcional | 10% vendedor + 5% comprador ("reserva"), o plan sin comisión por publicación paga fija | Encuentro presencial coordinado en "punto seguro" CABA/GBA + verificación visual + escrow propio (Bicify custodia el dinero directamente en su cuenta) |
| **Alamaula / OLX Argentina** | No | 0% (clasificados puros) | Pago y encuentro 100% fuera de la plataforma |
| **Facebook Marketplace** | No (en Argentina) | 0% | Contacto directo, sin intermediación |

**Hallazgos relevantes de Bicify** (mismo nicho, ya operando):
- Su comisión de referencia (10% vendedor + 5% comprador) es más alta que el 3-5% propuesto para Ciclo Market — señal de que el mercado podría tolerar una comisión mayor, o que Bicify aún no compite en precio. Conviene validarlo con datos del propio piloto antes de fijar el número definitivo.
- Bicify **sí custodia el dinero directamente en una cuenta propia** ("gestionamos el dinero de la operación en una cuenta en orden Bicify") — exactamente el modelo que Ciclo Market descartó por el riesgo fiscal y regulatorio de custodiar fondos de terceros. Es una decisión de negocio de Bicify, con un riesgo asumido que la arquitectura de Split de Pagos de Mercado Pago evita.
- Tienen una **cláusula anti-elusión**: si la venta se concreta con un contacto generado en la plataforma dentro de los 30 días siguientes, la comisión aplica igual aunque las partes acuerden pagar por fuera de la plataforma. Recomendado sumar una cláusula equivalente a los Términos y Condiciones de Ciclo Market.
- Limitan expresamente su responsabilidad: la verificación que ofrecen es solo visual y "no reemplaza un service profesional ni detecta vicios ocultos" — buen modelo de cómo acotar la responsabilidad de la plataforma sin prometer una garantía mecánica que no se puede sostener operativamente.

### 5.1 Referencia internacional: buycycle (Alemania/Europa/EE.UU.)

buycycle es el marketplace de bicis usadas premium más grande de Europa y EE.UU., y opera una estructura equivalente a la que se está diseñando para Ciclo Market, con algunos elementos adicionales a evaluar:

- **Motor de pagos**: usa Adyen (PSP europeo, rol equivalente a Mercado Pago) para cobrar el precio completo al comprador y retenerlo hasta que el vendedor despacha y el comprador confirma conformidad — mismo principio de no custodiar fondos directamente.
- **Comisión dividida entre ambos lados** (a diferencia del esquema "solo comprador" propuesto para Ciclo Market):
  - Seller Protection Fee: ~4-7% según mercado (EE.UU. 3,95%, Europa hasta 6,95% en bicis), descontada del pago al vendedor.
  - Buyer Protection Fee: ~2,5%, sumada automáticamente en cada compra.
  - Vender repuestos y accesorios es gratis (0% comisión); solo cobran por bicis.
  - **A evaluar**: dividir la comisión de Pago Protegido entre comprador y vendedor en vez de cargarla solo al comprador, una vez que haya datos del piloto.
- **Ventana de reclamo de 48 horas** desde la entrega — coincide con la definida para Ciclo Market. Regla adicional: el comprador debe aceptar la entrega aunque el paquete se vea dañado, para poder reclamar después.
- **SLA de mediación explícito**: primero negociación directa por chat (con ofertas de compensación); si no hay acuerdo, interviene un mediador de la plataforma con objetivo de resolución en 14 días hábiles (hasta 30 en casos complejos). **A sumar al panel de disputas de Ciclo Market**: un plazo objetivo de resolución declarado, no indefinido.
- **Causales cerrados**: "no hay devoluciones generales en ventas entre particulares — solo se cubre si el producto no coincide con la publicación o el desgaste excede lo normal" — coincide con la lista cerrada definida en la sección 6.
- **Estructura legal en dos contratos separados**: "contrato de compra" (comprador-vendedor) y "contrato de correduría/mediación" (comprador-buycycle). El derecho de desistimiento de 14 días que exige la normativa europea aplica solo al servicio de mediación de buycycle, no a la compra en sí, y se extingue una vez que el servicio ya se ejecutó (bici despachada). Es una forma más prolija de separar "lo que la ley exige" de "lo que la plataforma promete" — un modelo a proponerle al abogado como referencia para redactar los T&C de Ciclo Market, aunque el mecanismo legal argentino (art. 34, Ley 24.240) se ata a la venta en sí y no admite el mismo esquema de forma directa.
- **Fee de cancelación** para la parte que cancela una venta ya confirmada — desincentiva bajas de último momento después de reservado el envío. **A sumar** como cláusula en los T&C de Ciclo Market.
- **Logística 100% gestionada por la plataforma** (envían el packaging gratis, coordinan el retiro a domicilio, aseguran el transporte) — más pesado que el "tracking obligatorio" planteado para el piloto de Ciclo Market; queda como visión a futuro, no para la Fase 0.

---

## 6. Política de disputas y devoluciones

**Principio de diseño:** el default es la liberación del pago. La devolución es la excepción, con causales cerradas y carga de la prueba definida — no un criterio abierto que invite a la "avivada" típica del mercado argentino ("llegó con una rayita, me arrepentí").

### 5.1 Plazos

- Ventana de reclamo: **48–72 horas** desde la confirmación de entrega del courier. Esto rige la liberación del pago dentro del Pago Protegido — no reemplaza ni acorta el derecho legal de arrepentimiento de 10 días (ver punto 4.2), que sigue vigente como relación directa entre comprador y vendedor.
- Botón de confirmación activa disponible desde el momento de la entrega — acelera la liberación antes de que venza la ventana.
- Sin acción del comprador al vencer el plazo → liberación automática.

### 5.2 Requisito para poder reclamar

- Video o fotos de unboxing tomadas al momento de abrir el paquete, mostrando el estado general y el packaging. Sin esta evidencia, el reclamo entra con la carga de la prueba en contra del comprador.

### 5.3 Causales válidos de disputa (lista cerrada)

1. La bicicleta no coincide sustancialmente con la publicación (modelo, año o componentes distintos).
2. Daño estructural o de seguridad no declarado (cuadro rajado, frenos inoperativos, etc.).
3. No llegó, o llegó incompleta respecto de lo publicado.
4. Evidencia de que la bicicleta enviada no es la de las fotos del listing (indicio de fraude).

### 5.4 Causales explícitamente excluidos

- Rayones, desgaste o detalles estéticos ya visibles en las fotos del listing al momento de publicar.
- Arrepentimiento sin sustento objetivo ("no me gustó", "esperaba otra cosa").
- Diferencias de gusto, color o talle ya especificadas correctamente en la publicación.

### 5.5 Rol del checklist de publicación

- Al publicar, el vendedor completa un checklist estructurado (no texto libre) con fotos por ítem: cuadro, drivetrain, frenos, ruedas, golpes o rayones visibles.
- Ese checklist es la línea de base contractual: si el defecto reclamado ya estaba documentado ahí, el reclamo se rechaza automáticamente sin intervención manual.
- Esto traslada el incentivo de honestidad al vendedor (mejor documentación = menos riesgo de disputa) y le da a Ciclo Market un criterio objetivo de arbitraje en lugar de decidir a ojo.

### 5.6 Objetivo de distribución de reclamos

- Meta: ~90% de las operaciones cierran por confirmación (activa o por vencimiento de plazo) sin reclamo.
- ~10% restante limitado a causales graves (1 a 4 de la lista cerrada), con evidencia obligatoria.
- Este ratio se mide desde el piloto (Fase 0) y ajusta la política si se desvía significativamente.

---

## 7. Plan de implementación por fases

| Fase | Contenido | Duración estimada |
|---|---|---|
| **Fase 0 — Piloto cerrado** | Grupo chico de vendedores con buen historial; tope de monto bajo (~$2-3M ARS); resolución de disputas manual para calibrar causales reales | 1–2 meses |
| **Fase 1 — Estructura del listing** | Checklist de condición obligatorio con fotos por ítem; botón "Comprar con Pago Protegido" como opción adicional al checkout actual | En paralelo a Fase 0 |
| **Fase 2 — Flujo transaccional** | Integración completa de Split de Pagos; tracking obligatorio; liberación automática por plazo | Post-piloto |
| **Fase 3 — Panel de disputas** | Sistema propio en Supabase/n8n con carga de evidencia y resolución según causales tasados | Post-piloto |
| **Fase 4 — Escalar** | Subir tope de monto, abrir a todos los vendedores, ajustar comisión con datos reales de siniestralidad | Una vez validado el ratio 90/10 |

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Fraude del vendedor (bici no coincide) | Checklist obligatorio + evidencia de unboxing + causal cerrado |
| "Avivada" del comprador (arrepentimiento disfrazado de reclamo) | Causales excluidos explícitos + checklist como prueba a favor del vendedor |
| Choque con derecho de arrepentimiento legal (10 días, aplica también a vendedores particulares ocasionales) | Separar claramente el Pago Protegido (política operativa) del derecho legal en los T&C; no presentarlo como reemplazo del art. 34 |
| Exposición como PSP no registrado | Arquitectura sin custodia propia de fondos (Split de Pagos) |
| Daño en tránsito / logística | Tracking obligatorio; definir quién cubre el seguro de envío |
| Baja adopción inicial | Comisión de lanzamiento baja (3%) para incentivar prueba del servicio |

---

## 9. Próximos pasos inmediatos

1. Confirmar con abogado el texto exacto de los Términos y Condiciones que separa el Pago Protegido (política operativa) del derecho de arrepentimiento legal (punto 4.2) — no para excluirlo, sino para no contradecirlo.
2. Habilitar cuenta de Mercado Pago para Split de Pagos / Marketplace y completar registro de vendedores vía OAuth.
3. Diseñar el checklist estructurado de publicación con fotos por ítem.
4. Definir lista corta de vendedores para el piloto (Fase 0).
5. Redactar los Términos y Condiciones del servicio de Pago Protegido, incluyendo cláusula anti-elusión (referencia: Bicify) y aclaración de que el usuario conserva sus derechos bajo la Ley 24.240.
