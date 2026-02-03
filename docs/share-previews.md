# Checklist para evitar 403 a scrapers (Open Graph / Link Previews)

Objetivo: garantizar que Facebook, WhatsApp, LinkedIn, Twitter/X, Slack, Discord, Telegram y otros scrapers siempre reciban HTTP 200 con metadatos OG/Twitter válidos para `/blog/:slug` y `/listing/:slug`.

Funciones server-side ya implementadas: `shareBlog` y `shareListing` (Firebase Functions v2). Estas devuelven HTML estático con `<meta og:*>`, `<meta name="twitter:*">`, `<link rel="canonical">` y nunca responden 5xx a bots.

Este checklist cubre configuración EXTERNA (robots.txt, Cloudflare/WAF) para evitar 403/bloqueos.

## 1) robots.txt recomendado

Sirve desde la raíz del dominio (`/robots.txt`). Es permisivo con bots sociales y Google. Ajustá los sitemaps si corresponde.

```
# Permitir todo por defecto
User-agent: *
Allow: /

# Facebook (link preview y crawler)
User-agent: facebookexternalhit
Allow: /
User-agent: Facebot
Allow: /

# WhatsApp (link fetcher)
User-agent: WhatsApp
Allow: /

# Twitter/X
User-agent: Twitterbot
Allow: /

# LinkedIn
User-agent: LinkedInBot
Allow: /

# Slack / Discord / Telegram / Pinterest
User-agent: Slackbot
Allow: /
User-agent: Discordbot
Allow: /
User-agent: TelegramBot
Allow: /
User-agent: Pinterest
Allow: /

# Google
User-agent: Googlebot
Allow: /

# Sitemaps (ajustar URLs si cambian)
Sitemap: https://www.ciclomarket.ar/sitemap.xml
Sitemap: https://www.ciclomarket.ar/sitemap-blog.xml
```

Notas:
- No todos los scrapers respetan robots.txt, pero es una señal de permisos.
- Si tenés un `Disallow: /` global, sobreescribilo con las entradas específicas de cada User-Agent.

## 2) Cloudflare / WAF checklist

Si usás Cloudflare (u otro WAF/CDN), asegurate de no desafiar/bloquear bots verificados en las rutas de previews.

Recomendado en Cloudflare Dashboard:

- Bots → Super Bot Fight Mode: desactivar o crear regla de bypass para bots conocidos.
- Security → WAF → Custom Rules (ejemplo de Allow + Skip):

  Expresión (ejemplo 1 — por User-Agent y rutas):
  ```
  (http.user_agent contains "facebookexternalhit" or
   http.user_agent contains "Facebot" or
   http.user_agent contains "WhatsApp" or
   http.user_agent contains "Twitterbot" or
   http.user_agent contains "LinkedInBot" or
   http.user_agent contains "Slackbot" or
   http.user_agent contains "Discordbot" or
   http.user_agent contains "TelegramBot" or
   http.user_agent contains "Pinterest" or
   http.user_agent contains "Googlebot")
  and (
    starts_with(http.request.uri.path, "/blog/") or
    starts_with(http.request.uri.path, "/listing/")
  )
  ```
  Acciones (en orden):
  - Skip: Managed Challenge / JS Challenge / Super Bot Fight Mode / Browser Integrity Check
  - Allow

  Expresión (ejemplo 2 — más simple usando el flag de Cloudflare):
  ```
  (cf.client.bot and (
     starts_with(http.request.uri.path, "/blog/") or
     starts_with(http.request.uri.path, "/listing/")
  ))
  ```
  Acciones: Skip protections + Allow.

- Security → Settings:
  - Security Level: dejarlo en "Medium" o menor. Para `/blog/*` y `/listing/*` preferible bajar a "Essentially Off" mediante una Custom Rule de Skip.
  - Browser Integrity Check: desactivar para las rutas `/blog/*` y `/listing/*` (vía Skip en la misma Custom Rule).

- Opcional (si seguís viendo bloqueos):
  - Crear Allow Rules por ASN de los bots (ej.: Facebook AS32934), sabiendo que cambia con el tiempo.
  - Validar en Analytics → Security Events que no haya bloqueos a los User-Agent listados.

## 3) Validación con curl (simular User-Agent)

Pruebas rápidas desde terminal. Reemplazá `<slug>` por uno real.

Head + código de estado (Facebook):
```
curl -I -A 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' \
  https://www.ciclomarket.ar/blog/<slug>

curl -I -A 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' \
  https://www.ciclomarket.ar/listing/<slug>
```

Esperado: `HTTP/2 200`, `content-type: text/html; charset=utf-8`, `x-robots-tag: all`.

Contenido HTML con `<meta>` OG/Twitter (Twitterbot):
```
curl -s -A 'Twitterbot/1.0' https://www.ciclomarket.ar/blog/<slug> | sed -n '1,200p'
```
Verificar presencia de:
- `<meta property="og:type" content="article" />` (blog) o `product` (listing)
- `<meta property="og:url" ...>` y `<link rel="canonical" ...>` apuntando a la URL del recurso
- `<meta property="og:title" ...>`, `<meta property="og:description" ...>`
- `<meta property="og:image" ...>` y `<meta property="og:image:secure_url" ...>`
- `<meta name="twitter:card" content="summary_large_image" />`

Otras UAs a probar:
```
curl -I -A 'LinkedInBot/1.0' https://www.ciclomarket.ar/blog/<slug>
curl -I -A 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' https://www.ciclomarket.ar/blog/<slug>
curl -I -A 'WhatsApp/2.23.10 i' https://www.ciclomarket.ar/listing/<slug>
```

## 4) Confirmaciones adicionales

- Las funciones de previews no requieren cookies ni ejecución de JavaScript para exponer metadatos OG/Twitter.
- Para bots: nunca hay redirects 301/302 (responden 200 con HTML). Los usuarios reales sí son redirigidos a la SPA (302) cuando corresponde.
- Respuestas incluyen cabeceras defensivas: `Vary: User-Agent`, `Cache-Control`, `X-Robots-Tag: all`, `Access-Control-Allow-Origin: *`, `X-Content-Type-Options: nosniff`.

## 5) Troubleshooting

- Si ves 403 en scrapers:
  - Revisá Cloudflare → Security Events para confirmar si una regla bloquea al User-Agent.
  - Añadí/ajustá la WAF Custom Rule de Allow/Skip como arriba.
  - Confirmá que `shareBlog` / `shareListing` están desplegadas y activas en Firebase (Hosting rewrites a funciones).
  - Validá que Firebase Hosting aplica el fallback SPA: en `firebase.json` el orden debe ser:
    1) `/blog/**` → function `shareBlog`
    2) `/listing/**` → function `shareListing`
    3) `**` → `/index.html`

- Si ves 5xx desde Functions para bots:
  - Las funciones robustas devuelven fallback 200 incluso si falla Supabase; revisá logs solo para diagnóstico.
  - Si el 5xx viene de Hosting/CDN, verificá que la request haya llegado a la Function (logs de Cloud Functions).

- Cache/CDN:
  - Purga de caché en Cloudflare si se sirvió contenido viejo.

## 6) Cómo validar que no hay 403 (scripts)

Comandos de validación (sustituí `<slug>` por uno real o usá `TEST_BLOG_SLUG` / `TEST_LISTING_SLUG` como variables):

```
# Usuario normal (no bot) — debe ser 200 (SPA) o 200 vía función (según config), nunca 403
curl -I "https://www.ciclomarket.ar/listing/${TEST_LISTING_SLUG:-test}"
curl -I "https://www.ciclomarket.ar/blog/${TEST_BLOG_SLUG:-test}"

# Facebook — debe ser 200 (Function)
curl -I -A 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' \
  "https://www.ciclomarket.ar/listing/${TEST_LISTING_SLUG:-test}"
curl -I -A 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' \
  "https://www.ciclomarket.ar/blog/${TEST_BLOG_SLUG:-test}"
```

Si la respuesta es 403, revisá primero Cloudflare/WAF. Si es 404 con HTML de la SPA, el fallback está funcionando; si es 404 de Function, confirmá que `shareBlog`/`shareListing` están desplegadas y que las rewrites apuntan a esas funciones.
