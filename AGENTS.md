# AGENTS.md · Ciclo Market

Este documento describe la arquitectura, convenciones y flujos de desarrollo del proyecto Ciclo Market, un marketplace de bicicletas para Argentina.

> **Nota para agentes de código:** Este proyecto usa principalmente español en comentarios, documentación y contenido visible al usuario. El código (nombres de variables, funciones, archivos) usa inglés.

---

## Project Overview

Ciclo Market es una plataforma de clasificados especializada en bicicletas que conecta compradores y vendedores. Soporta:

- Publicaciones de bicicletas usadas y nuevas (gratis y planes pagos)
- Tiendas oficiales (perfiles de bicicleterías con catálogo ilimitado)
- Sistema de pagos integrado con MercadoPago
- Comparador de bicicletas
- Blog de contenidos
- Panel de administración para moderadores

URL de producción: `https://www.ciclomarket.ar`

---

## Technology Stack

### Frontend
- **Framework:** React 18.3+ con TypeScript 5.5+
- **Build Tool:** Vite 5.3+
- **Routing:** React Router DOM 6.26+
- **Styling:** Tailwind CSS 3.4+
- **UI Components:** Lucide React (íconos), componentes propios
- **Animation:** Framer Motion
- **SEO:** React Helmet Async, meta tags dinámicos, JSON-LD

### Backend
- **BaaS:** Supabase (PostgreSQL, Auth, Storage, Realtime)
- **Server:** Express.js 4.19+ (Node.js) desplegado en Render
- **Cron Jobs:** node-cron para tareas programadas (notificaciones, digest, limpieza)

### Infrastructure
- **Static Hosting:** Firebase Hosting
- **Serverless Functions:** Firebase Functions (Node.js 20) para:
  - Prerender de meta tags OG (Open Graph) para bots
  - Proxy de imágenes de Supabase Storage
  - Proxy de API para evitar CORS
- **Email:** Resend API (HTTP, no SMTP)
- **Payments:** MercadoPago
- **Analytics:** Google Analytics 4 + Meta Pixel
- **Maps:** Google Maps JavaScript API

---

## Project Structure

```
/Users/timon/MundoBike/
├── src/                      # Frontend principal (SPA)
│   ├── components/           # Componentes React reutilizables
│   │   ├── ui/              # Componentes base (input, select, etc.)
│   │   ├── wizard/          # Pasos del formulario de publicación
│   │   └── blog/            # Componentes del blog
│   ├── pages/               # Páginas/ rutas de la aplicación
│   │   ├── seo/             # Landing pages SEO específicas
│   │   ├── Auth/            # Login, registro, recuperación
│   │   ├── Publish/         # Flujo de publicación
│   │   └── Checkout/        # Estados de pago
│   ├── services/            # Clientes HTTP y lógica de API
│   ├── context/             # React Contexts (auth, notificaciones, etc.)
│   ├── hooks/               # Custom hooks
│   ├── utils/               # Funciones utilitarias
│   ├── types/               # Definiciones TypeScript
│   └── constants/           # Constantes (catálogo, ubicaciones)
│
├── admin/                    # Panel de administración (SPA separada)
│   ├── src/
│   │   ├── pages/           # Overview, Analytics, Listings, Stores
│   │   ├── components/      # Tablas, gráficos, layout
│   │   ├── services/        # APIs específicas del admin
│   │   └── context/         # AdminAuthContext
│   └── vite.config.ts       # Config separada (puerto 5273)
│
├── server/                   # Backend Express.js
│   ├── src/
│   │   ├── index.js         # Entry point, rutas principales
│   │   ├── routes/          # Routers Express (appApi, feeds, sitemaps)
│   │   ├── jobs/            # Cron jobs (notificaciones, digest)
│   │   ├── services/        # PaymentService, ScraperService
│   │   ├── lib/             # Supabase client, mail, listings
│   │   └── emails/          # Templates de emails
│   └── scripts/             # Scripts de campañas y utilidades
│
├── functions/                # Firebase Functions
│   └── index.js             # imageProxy, apiProxy, shareListing, etc.
│
├── scripts/                  # Scripts de utilidad y migraciones SQL
│   ├── optimize-public-images.mjs
│   ├── sync-admin-to-dist.mjs
│   └── supabase_*.sql       # Migraciones de base de datos
│
├── supabase/                 # Configuración adicional de Supabase
├── public/                   # Assets estáticos (favicon, imágenes)
├── dist/                     # Build del frontend (Firebase Hosting)
└── dist-admin/               # Build del admin (copiado a dist/admin)
```

---

## Build & Development Commands

### Development
```bash
# Frontend principal (http://localhost:5173)
npm run dev

# Panel de admin (http://localhost:5273)
npm run dev:admin

# Servidor backend (requiere server/.env configurado)
npm run server
```

### Build & Deploy
```bash
# Build completo (web + admin + sync)
npm run build

# Individual
npm run build:web       # Solo frontend
npm run build:admin     # Solo admin
npm run sync:admin      # Copia dist-admin a dist/admin

# Preview local del build
npm run preview
npm run preview:admin   # Puerto 5274
```

### Quality Checks
```bash
# Linting (ESLint + TypeScript)
npm run lint

# Type checking
npm run typecheck
```

### Utilidades
```bash
# Optimización de imágenes
npm run optimize:images

# Jobs manuales (ejecutar en Render/local con server/.env)
npm run review-reminder:once
npm run saved-search:digest:once
npm run review-reminder:test-email
```

---

## Environment Variables

### Frontend (`.env` o variables de entorno del hosting)
```bash
# Supabase (requerido)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# API Backend
VITE_API_BASE_URL=https://your-api.render.com

# Analytics (opcional)
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_META_PIXEL_ID=XXXXXXXXXX

# Google Maps (opcional)
VITE_GOOGLE_MAPS_KEY=your-api-key
```

### Server (`server/.env`)
```bash
# Supabase (requerido)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# CORS
FRONTEND_URL=https://www.ciclomarket.ar,https://ciclomarket.ar

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxx
SMTP_FROM="Ciclo Market <notificaciones@ciclomarket.ar>"

# Pagos
MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxxxxxxx

# Jobs (opcional)
REVIEW_REMINDER_ENABLED=true
NEWSLETTER_DIGEST_ENABLED=true
```

### Firebase Functions
Configurar secrets en Firebase:
```bash
firebase functions:secrets:set SUPABASE_URL
firebase functions:secrets:set SUPABASE_SERVICE_ROLE_KEY
firebase functions:secrets:set RESEND_API_KEY
```

---

## Database Architecture (Supabase)

### Tablas Principales
- `listings` - Publicaciones de bicicletas
- `users` - Perfiles de usuario (extiende auth.users)
- `stores` / `user_roles` - Tiendas y permisos de admin
- `plans`, `publish_credits` - Sistema de planes y créditos
- `payments`, `gift_redemptions` - Pagos y códigos de regalo
- `events` - Analytics (page views, clicks)
- `saved_searches` - Búsquedas guardadas por usuarios
- `reviews` - Sistema de reseñas
- `notifications` - Notificaciones in-app
- `blog_posts` - Contenido del blog

### Políticas RLS (Row Level Security)
Todas las tablas tienen RLS habilitado. Las políticas clave:
- `listings`: owners pueden editar sus filas, admins pueden todo
- `users`: usuarios pueden leer perfiles públicos, editar solo el propio
- `events`: solo insert desde frontend autenticado

### Vistas y Funciones
- `admin_*` - Vistas para el panel de admin (engagement, métricas)
- `mark_notifications_read` - RPC para marcar notificaciones leídas

Ver migraciones SQL en `/scripts/supabase_*.sql`

---

## Code Style Guidelines

### TypeScript
- Modo estricto habilitado
- Tipos explícitos en exports públicos
- `any` permitido en casos justificados (ESLint: `@typescript-eslint/no-explicit-any: off`)

### React
- Componentes funcionales con hooks
- Lazy loading para páginas secundarias (usar `lazyWithRetry`)
- Contexts para estado global (auth, notificaciones, moneda)
- `React.memo` en componentes de lista pesados

### Naming Conventions
- **Archivos:** PascalCase para componentes (`ListingCard.tsx`), camelCase para utilidades (`formatPrice.ts`)
- **Componentes:** PascalCase
- **Hooks:** prefijo `use` (ej: `useMyListings`)
- **Variables/funciones:** camelCase
- **Constantes:** UPPER_SNAKE_CASE para valores hardcodeados

### Imports
```typescript
// Orden recomendado:
1. React / librerías externas
2. Alias del proyecto (@/components, @/services)
3. Importaciones relativas (./types, ./utils)
```

### Styling (Tailwind)
- Usar clases de Tailwind primero
- Evitar estilos inline excepto para valores dinámicos
- Colores del tema: `bg-mb-bg`, `text-mb-ink`, `text-mb-primary`

---

## Testing Strategy

**Estado actual:** No hay suite de tests automatizados.

Para validar cambios:
1. Type checking: `npm run typecheck`
2. Lint: `npm run lint`
3. Build local: `npm run build`
4. Manual testing en dev server

**Pruebas recomendadas para cambios críticos:**
- Flujo de publicación (crear, editar, destacar)
- Checkout de pago (MercadoPago)
- Autenticación (registro, login, recuperación)
- Compartir en redes (meta tags OG)

---

## Security Considerations

### Autenticación
- Supabase Auth con JWT
- Tokens refresh automáticos
- Persistencia configurable (localStorage/sessionStorage)

### Autorización
- RLS en todas las tablas de Supabase
- Admin routes protegidas con `ProtectedRoute`
- API endpoints verifican JWT en el server

### Datos sensibles
- Nunca exponer `SUPABASE_SERVICE_ROLE_KEY` en frontend
- API keys de terceros (Maps, Analytics) solo en variables de entorno
- Webhooks de pagos verifican firma cuando es posible

### Protección contra abuso
- Rate limiting implícito por Cloudflare/Firebase
- Moderación automática de contenido (teléfonos en títulos)
- Límites de tamaño en uploads de imágenes

---

## Deployment Process

### Render (Backend)
1. Push a main activa auto-deploy
2. Build command: `npm install --production=false && npm run build`
3. Start command: `npm run server`
4. Variables de entorno configuradas en dashboard de Render

### Firebase (Frontend)
```bash
# Deploy manual
firebase deploy --only hosting

# Deploy functions
firebase deploy --only functions
```

### Flujo completo de release
1. Desarrollo local con `npm run dev`
2. PR/Merge a main
3. Auto-deploy a Render (backend)
4. Build local y deploy a Firebase (frontend):
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

---

## Common Issues & Solutions

### Supabase Auth en Safari
Safari con "Bloquear todas las cookies" impide localStorage/sessionStorage. El código tiene fallback a memory storage (ver `src/services/supabase.ts`).

### CORS en desarrollo
El proxy de Vite (`vite.config.ts`) redirige `/api` al backend de Render en dev.

### OG Images no aparecen en WhatsApp/Facebook
Las Firebase Functions `shareListing`, `shareStore`, `shareBlog` generan HTML con meta tags para bots. Si fallan, verificar:
- Secrets de Supabase configurados en Firebase
- La URL tiene el formato correcto (`/listing/slug`)

### Imágenes no cargan
- Bucket "listings" y "avatars" existen en Supabase Storage
- Políticas de storage permiten lectura pública
- CORS configurado en Supabase para el dominio de producción

---

## Key File References

| Propósito | Archivo |
|-----------|---------|
| Entry point frontend | `src/main.tsx` |
| Router y SEO | `src/App.tsx` |
| Supabase client | `src/services/supabase.ts` |
| Auth context | `src/context/AuthContext.tsx` |
| Server entry | `server/src/index.js` |
| Supabase client server | `server/src/lib/supabaseClient.js` |
| Firebase functions | `functions/index.js` |
| Tailwind config | `tailwind.config.js` |
| TypeScript paths | `tsconfig.json` |

---

## Contact & Resources

- **Producción:** https://www.ciclomarket.ar
- **Supabase Dashboard:** https://app.supabase.com (acceso requerido)
- **Render Dashboard:** https://dashboard.render.com (acceso requerido)
- **Firebase Console:** https://console.firebase.google.com (acceso requerido)
