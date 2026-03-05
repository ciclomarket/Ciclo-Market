# Stack Técnico - Ciclo Market

Resumen completo de tecnologías usadas por feature.

---

## 1. Frontend Principal (Web App)

| Aspecto | Tecnología |
|---------|------------|
| **Framework** | React 18.3+ |
| **Lenguaje** | TypeScript 5.5+ |
| **Build Tool** | Vite 5.3+ |
| **Routing** | React Router DOM 6.26+ |
| **Estilos** | Tailwind CSS 3.4+ |
| **UI Icons** | Lucide React |
| **Animaciones** | Framer Motion |
| **SEO** | react-helmet-async |
| **Editor Blog** | TipTap (StarterKit, Image, Link, Table, YouTube) |
| **Mapas** | Google Maps JavaScript API |
| **Estado Global** | React Context (Auth, Toast, Currency, Notifications) |
| **HTTP Client** | Supabase Client + Fetch |

### Estructura de carpetas:
```
src/
├── components/       # Componentes reutilizables
├── pages/           # Rutas/Páginas
├── services/        # APIs y clientes HTTP
├── hooks/           # Custom hooks
├── context/         # React Contexts
├── utils/           # Funciones utilitarias
├── types/           # Definiciones TypeScript
└── constants/       # Constantes
```

---

## 2. Panel de Administración (/admin)

| Aspecto | Tecnología |
|---------|------------|
| **Framework** | React 18 (SPA separada) |
| **Build Tool** | Vite (puerto 5273) |
| **Estilos** | CSS nativo (styles.css) - NO Tailwind |
| **Rutas** | React Router DOM |
| **Base** | Se sirve desde `/admin` en Firebase Hosting |
| **Puerto Dev** | 5273 |
| **Output** | `dist-admin/` |

### Features del Admin:
- Dashboard (métricas)
- CRM Vendedores (Seller Ops)
- Analytics
- Engagement
- Listings (moderación)
- Tiendas (stores)
- Pricing
- **Blog** (gestión de posts)

---

## 3. Blog

| Aspecto | Tecnología |
|---------|------------|
| **Editor WYSIWYG** | TipTap |
| **Extensiones** | StarterKit, Image, Link, Table, YouTube |
| **Shortcodes** | `[listing:slug]` → React components |
| **Renderer** | BlogContentRenderer (client-side) |
| **Imágenes** | Supabase Storage |
| **SEO Posts** | React Helmet + JSON-LD |

### Componentes clave:
- `BlogEditor.tsx` - Editor con TipTap
- `BlogContentRenderer.tsx` - Renderiza HTML + shortcodes
- `SeoHead.tsx` - Meta tags dinámicos

---

## 4. Backend (Server)

| Aspecto | Tecnología |
|---------|------------|
| **Runtime** | Node.js |
| **Framework** | Express.js 4.19+ |
| **Base de datos** | Supabase (PostgreSQL) |
| **Email** | Resend API (HTTP) |
| **Deploy** | Render |
| **Cron Jobs** | node-cron |

### Rutas principales:
- `/api/*` - API REST
- `/sitemap*.xml` - Sitemaps dinámicos
- Webhooks de pagos

### Jobs programados:
- `review-reminder` - Recordatorios de reseñas
- `saved-search:digest` - Alertas de búsquedas guardadas

---

## 5. Firebase Functions (Serverless)

| Función | Propósito |
|---------|-----------|
| `imageProxy` | Proxy de imágenes de Supabase Storage |
| `apiProxy` | Proxy de API para evitar CORS |
| `shareListing` | Prerender OG para bots (listings) |
| `shareStore` | Prerender OG para bots (tiendas) |
| `shareBlog` | Prerender OG para bots (blog) |

### Stack:
- Firebase Functions v2 (HTTPS)
- Node.js 20
- Region: `us-central1`

---

## 6. Base de Datos (Supabase)

| Aspecto | Tecnología |
|---------|------------|
| **Motor** | PostgreSQL |
| **Auth** | Supabase Auth (JWT) |
| **Storage** | Supabase Storage (imágenes) |
| **RLS** | Row Level Security habilitado |
| **Realtime** | Disponible (no usado en frontend) |

### Tablas principales:
- `listings` - Publicaciones de bicicletas
- `users` - Perfiles de usuario
- `stores` - Tiendas oficiales
- `blog_posts` - Artículos del blog
- `payments` - Pagos MercadoPago
- `events` - Analytics (page views, clicks)
- `saved_searches` - Búsquedas guardadas
- `reviews` - Sistema de reseñas

---

## 7. Autenticación

| Aspecto | Tecnología |
|---------|------------|
| **Proveedor** | Supabase Auth |
| **Métodos** | Email/Password, Magic Link |
| **Tokens** | JWT con refresh automático |
| **Persistencia** | localStorage/sessionStorage/memory (fallback) |
| **Roles** | Moderadores (`is_moderator`) |

### Contextos:
- `AuthContext` (frontend principal)
- `AdminAuthContext` (panel admin)

---

## 8. Almacenamiento de Imágenes

| Aspecto | Tecnología |
|---------|------------|
| **Storage** | Supabase Storage |
| **Buckets** | `listings`, `avatars` |
| **Optimización** | ImgProxy (via Cloudflare/CDN) |
| **Transform** | `_optimized` query params |
| **Proxy** | Firebase Function `imageProxy` |

### Utilidades:
- `buildCardImageUrlSafe()` - URLs seguras para cards
- `buildImageSource()` - SrcSet responsive

---

## 9. Email

| Aspecto | Tecnología |
|---------|------------|
| **Proveedor** | Resend |
| **Método** | HTTP API (no SMTP) |
| **Templates** | HTML inline en functions |
| **From** | `notificaciones@ciclomarket.ar` |

### Tipos de emails:
- Upgrade de plan
- Recordatorio de reseñas
- Digest de búsquedas guardadas
- Notificaciones de leads

---

## 10. Analytics & Tracking

| Aspecto | Tecnología |
|---------|------------|
| **Web Analytics** | Google Analytics 4 |
| **Pixel** | Meta Pixel |
| **Event Tracking** | Supabase `events` table |
| **User Tracking** | PostHog |
| **Metrics** | Eventos custom (page_view, wa_click, etc) |

### Tabla `events`:
- `listing_view`
- `wa_click`
- `contact_event`
- `listing_status_event`

---

## 11. SEO

| Aspecto | Tecnología |
|---------|------------|
| **Meta Tags** | react-helmet-async |
| **OG/Twitter** | Open Graph + Twitter Cards |
| **JSON-LD** | Schema.org (JsonLd component) |
| **Canonical** | URLs normalizadas |
| **Prerender** | Firebase Functions (para bots) |

### Componentes:
- `SEO.tsx` - Meta tags dinámicos
- `JsonLd.tsx` - Schema.org markup
- `SeoHead.tsx` - Combinación de ambos

---

## 12. Sitemaps

| Aspecto | Tecnología |
|---------|------------|
| **Generación** | Server Express (dinámico) |
| **Index** | `/sitemap.xml` |
| **Estáticos** | `/sitemap-static.xml` |
| **Blog** | `/sitemap-blog.xml` |
| **Listings** | `/sitemap-listings-{page}.xml` (paginado) |
| **Tiendas** | `/sitemap-stores.xml` |

### Rutas server:
- Implementado en `server/src/routes/sitemaps.js`

---

## 13. CRM / Seller Ops

| Aspecto | Tecnología |
|---------|------------|
| **Kanban** | React DnD (drag & drop) |
| **Tablas** | Custom (estilo admin) |
| **Automations** | Reglas en base de datos |
| **Email** | Resend API |
| **Metrics** | Vistas de tienda, contactos, conversiones |

### Features:
- Kanban de leads
- Automations rules
- Email templates
- Impact dashboard

---

## 14. Pagos

| Aspecto | Tecnología |
|---------|------------|
| **Gateway** | MercadoPago |
| **SDK** | MercadoPago JS SDK |
| **Backend** | Webhooks en server Express |
| **Planes** | Free, Basic, Pro, Premium |
| **Créditos** | Sistema de `publish_credits` |

### Tablas:
- `payments`
- `publish_credits`
- `gift_redemptions`

---

## 15. Deploy & Hosting

| Servicio | Uso |
|----------|-----|
| **Firebase Hosting** | Frontend principal (SPA) |
| **Firebase Functions** | Serverless (OG prerender, proxies) |
| **Render** | Backend Express + Cron jobs |
| **Supabase** | Base de datos + Storage + Auth |

### URLs:
- **Producción**: `https://www.ciclomarket.ar`
- **Admin**: `https://www.ciclomarket.ar/admin`
- **API**: `https://ciclo-market.onrender.com`

---

## 16. Herramientas de Desarrollo

| Herramienta | Uso |
|-------------|-----|
| **ESLint** | Linting |
| **TypeScript** | Type checking |
| **Vite** | Dev server + Build |
| **npm** | Package manager |

### Scripts importantes:
```bash
npm run dev          # Frontend (localhost:5173)
npm run dev:admin    # Admin (localhost:5273)
npm run build        # Build completo
npm run server       # Backend local
```

---

## Resumen por Feature

| Feature | Stack Principal |
|---------|-----------------|
| **Web App** | React + Vite + Tailwind + Supabase |
| **Admin Panel** | React + Vite + CSS nativo |
| **Blog** | TipTap + React + Supabase |
| **Database** | PostgreSQL (Supabase) |
| **Auth** | Supabase Auth |
| **Storage** | Supabase Storage |
| **Email** | Resend API |
| **SEO** | React Helmet + Firebase Functions |
| **Sitemaps** | Express + XML dinámico |
| **Pagos** | MercadoPago |
| **Deploy** | Firebase + Render |
