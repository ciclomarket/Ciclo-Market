# Sistema de Tiendas - Contexto Completo

> **Última actualización:** Marzo 2026
> **Propósito:** Documento de referencia para entender completamente cómo funcionan las tiendas en Ciclo Market y evitar errores de implementación.

---

## 📋 Índice

1. [Arquitectura General](#arquitectura-general)
2. [Rutas y URLs](#rutas-y-urls)
3. [Base de Datos](#base-de-datos)
4. [Frontend](#frontend)
5. [Servicios](#servicios)
6. [Firebase Functions](#firebase-functions)
7. [Políticas RLS](#políticas-rls)
8. [Campos de Tienda Disponibles](#campos-de-tienda-disponibles)
9. [Flujo de Datos](#flujo-de-datos)
10. [UX/UI Mejoras Propuestas](#uxui-mejoras-propuestas)

---

## 🏗️ Arquitectura General

Las tiendas en Ciclo Market son **perfiles de usuario extendidos**. No hay una tabla separada `stores`, todo está en la tabla `users` con campos `store_*`.

```
┌─────────────────────────────────────────────────────────────┐
│                         USUARIO                            │
│                    (tabla: users)                          │
├─────────────────────────────────────────────────────────────┤
│ Campos base: id, email, full_name, city, province...       │
├─────────────────────────────────────────────────────────────┤
│ Campos tienda (opcional):                                  │
│ - store_enabled (bool) - Activa/desactiva modo tienda      │
│ - store_name (text) - Nombre comercial                     │
│ - store_slug (text) - URL amigable: /tienda/{slug}         │
│ - store_address (text) - Dirección física                  │
│ - store_phone (text) - Teléfono fijo                       │
│ - store_instagram (text) - IG de la tienda                 │
│ - store_facebook (text) - FB de la tienda                  │
│ - store_website (text) - Sitio web                         │
│ - store_banner_url (text) - Imagen de portada              │
│ - store_avatar_url (text) - Logo de tienda                 │
│ - store_hours (text) - Horarios de atención                │
│ - store_lat/store_lon (float) - Coordenadas GPS            │
│ - store_banner_position_y (numeric) - Posición del banner  │
└─────────────────────────────────────────────────────────────┘
```

### Diferencia clave:
- **Usuario normal:** Tiene `store_enabled = false` o `null`
- **Tienda:** Tiene `store_enabled = true` + `store_slug` definido

---

## 🌐 Rutas y URLs

### URLs de Frontend (React Router)

| Ruta | Componente | Descripción |
|------|------------|-------------|
| `/tiendas` | `Tiendas.tsx` | Directorio de todas las tiendas |
| `/tienda/:slug` | `Store.tsx` | Perfil público de una tienda |
| `/tiendas-oficiales` | `StoresLanding.tsx` | Landing de conversión para tiendas |
| `/tienda-oficial` | `OfficialStore.tsx` | Tienda oficial de Ciclo Market |
| `/vender/tiendas` | `ForStores.tsx` | Info para sumar tiendas |
| `/vender/tiendas/guia` | `StoresGuide.tsx` | Guía de tiendas |

> ⚠️ **IMPORTANTE:** NO existe `/store`. Usar SIEMPRE `/tienda/*`

### URLs de Backend (Firebase Functions)

| Function | URL Pattern | Propósito |
|----------|-------------|-----------|
| `shareStore` | `/tienda/:slug` | Render OG tags para bots |

---

## 🗄️ Base de Datos

### Tabla: `users`

```sql
CREATE TABLE public.users (
    id uuid NOT NULL PRIMARY KEY,
    email text NOT NULL,
    full_name text,
    
    -- Ubicación (usada también para tiendas)
    city text,
    province text,
    
    -- Campos de tienda
    store_enabled boolean DEFAULT false,
    store_name text,
    store_slug text UNIQUE,  -- lowercase obligatorio
    store_address text,
    store_phone text,
    store_instagram text,
    store_facebook text,
    store_website text,
    store_banner_url text,
    store_avatar_url text,
    store_hours text,
    store_lat double precision,
    store_lon double precision,
    store_banner_position_y numeric DEFAULT 50,
    
    -- Constraint: slug siempre minúsculas
    CONSTRAINT users_store_slug_lower_chk 
      CHECK (((store_slug IS NULL) OR (store_slug = lower(store_slug))))
);
```

### Índices relevantes

```sql
-- Índice único para búsqueda por slug
CREATE UNIQUE INDEX ux_users_store_slug 
  ON public.users (store_slug) 
  WHERE store_slug IS NOT NULL;

-- Índice para listar tiendas activas
CREATE INDEX ix_users_store_enabled 
  ON public.users (store_enabled) 
  WHERE store_enabled = true;

-- Índice para cuentas demo (ocultas)
CREATE INDEX ix_users_is_demo_account 
  ON public.users (is_demo_account) 
  WHERE is_demo_account = true;
```

### Columnas que NO existen (errores comunes)

❌ `store_city` - NO existe (usar `city`)
❌ `store_province` - NO existe (usar `province`)
❌ `store_whatsapp` - NO existe (usar `whatsapp_number`)
❌ `business_hours` - NO existe (usar `store_hours`)

---

## ⚛️ Frontend

### Páginas principales

#### 1. `/tiendas` (Tiendas.tsx)
- **Propósito:** Directorio público de todas las tiendas
- **Datos que muestra:**
  - Logo, nombre, ubicación
  - Cantidad de publicaciones activas
  - Filtros por provincia/categoría
- **Query:** `fetchStores()` → filtra `store_enabled = true` + `is_demo_account = false`

#### 2. `/tienda/:slug` (Store.tsx)
- **Propósito:** Perfil público de una tienda específica
- **Datos que muestra:**
  - Banner + Logo
  - Información de contacto
  - Listado de publicaciones de esa tienda
  - Filtros por categoría
- **Query:** `fetchStoreProfileBySlug(slug)`

#### 3. Dashboard Configuración (DashboardUnified.tsx)
- **Tab "Tienda":** Formulario completo de configuración
- **Campos editables:** Todos los `store_*`

### Servicios clave (`src/services/users.ts`)

```typescript
// Obtener lista de tiendas públicas
fetchStores(): Promise<StoreSummary[]>

// Obtener perfil de tienda por slug
fetchStoreProfileBySlug(slug: string): Promise<UserProfileRecord | null>

// Tipos de StoreSummary
interface StoreSummary {
  id: string
  store_slug: string
  store_name: string | null
  store_avatar_url: string | null
  store_banner_url: string | null
  city: string | null
  province: string | null
  store_address: string | null
  store_lat: number | null
  store_lon: number | null
  store_phone: string | null
  store_website: string | null
}
```

---

## 🔥 Firebase Functions

### `shareStore` (functions/index.js)

**Propósito:** Generar meta tags OG para compartir tiendas en redes sociales.

**URL:** `https://ciclomarket.ar/tienda/{slug}`

**Lógica:**
1. Detecta si es un bot (User-Agent)
2. Si es humano → sirve SPA (index.html)
3. Si es bot → consulta Supabase y genera HTML con meta tags

**Campos que usa:**
```javascript
const { data: row } = await supabase
  .from('users')
  .select('id, store_slug, store_name, store_avatar_url, bio, store_enabled, city, province')
  .eq('store_slug', slugLower)
  .maybeSingle()
```

**Meta tags generados:**
- `og:title`: `{store_name} – Ciclo Market`
- `og:description`: Bio o ubicación
- `og:image`: `store_avatar_url` o fallback
- `og:url`: `https://www.ciclomarket.ar/tienda/{slug}`

---

## 🔒 Políticas RLS

### Tabla `users`

```sql
-- Usuarios pueden leer/actualizar solo su propio perfil
CREATE POLICY "Users read own profile" 
  ON public.users FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users update own profile" 
  ON public.users FOR UPDATE 
  USING (auth.uid() = id);

-- Servicio (backend) tiene acceso total
CREATE POLICY users_all_service 
  ON public.users TO service_role 
  USING (true) WITH CHECK (true);

-- Usuarios autenticados pueden ver nombres públicos
CREATE POLICY users_public_names 
  ON public.users FOR SELECT TO authenticated 
  USING (true);

-- Público (anon) puede ver perfiles de tiendas
CREATE POLICY users_select_public 
  ON public.users FOR SELECT TO authenticated, anon 
  USING (true);
```

### Demo Accounts (Sistema de cuentas ocultas)

Las tiendas de usuarios demo (`is_demo_account = true`) están ocultas del público:

```sql
-- Vista que excluye tiendas demo
CREATE VIEW public.public_stores AS
SELECT * FROM public.users
WHERE store_enabled = true 
  AND store_slug IS NOT NULL
  AND is_demo_account = false;  -- <-- Excluye demos
```

---

## 📝 Campos de Tienda Disponibles

### Lectura/Escritura (en Dashboard)

| Campo | Tipo | Descripción | Visible en Público |
|-------|------|-------------|-------------------|
| `store_name` | text | Nombre comercial | ✅ Sí |
| `store_slug` | text | URL: /tienda/{slug} | ✅ Sí |
| `store_phone` | text | Teléfono fijo | ✅ Sí |
| `store_address` | text | Dirección física | ✅ Sí |
| `store_website` | text | Sitio web | ✅ Sí |
| `store_instagram` | text | Instagram | ✅ Sí |
| `store_facebook` | text | Facebook | ✅ Sí |
| `store_hours` | text | Horarios | ✅ Sí |
| `store_avatar_url` | text | Logo | ✅ Sí |
| `store_banner_url` | text | Banner | ✅ Sí |

### Campos heredados del perfil

| Campo | Ubicación real | Uso en tienda |
|-------|---------------|---------------|
| Ciudad | `users.city` | Ubicación tienda |
| Provincia | `users.province` | Ubicación tienda |
| WhatsApp | `users.whatsapp_number` | Contacto |

---

## 🔄 Flujo de Datos

### Crear una tienda (Usuario)

1. Usuario va a Dashboard → Configuración → Tab "Tienda"
2. Activa "Modo tienda" (`store_enabled = true`)
3. Completa campos: `store_name`, `store_slug`, etc.
4. Guarda → `update users set ... where id = auth.uid()`

### Ver tienda (Público)

1. Navega a `/tiendas` → Lista todas las tiendas
2. Click en tienda → Navega a `/tienda/{slug}`
3. Store.tsx carga:
   - `fetchStoreProfileBySlug(slug)` → Datos tienda
   - `fetchListingsBySeller(userId)` → Publicaciones

### Compartir tienda (Redes)

1. Bot comparte `https://ciclomarket.ar/tienda/{slug}`
2. Firebase Function `shareStore` intercepta
3. Genera HTML con meta tags OG
4. Redes sociales leen meta tags

---

## 🎨 UX/UI Mejoras Propuestas

### 1. Preview en tiempo real
Mostrar cómo se verá la tienda pública mientras se configura.

### 2. Validación de slug
- Verificar disponibilidad en tiempo real
- Sugerir slugs basados en el nombre
- Evitar caracteres especiales

### 3. Crop de imágenes
- Editor simple para banner (1200x400 recomendado)
- Editor para logo (1:1)

### 4. Estadísticas de tienda
- Vistas al perfil
- Clicks en contacto
- Publicaciones más vistas

### 5. Plantillas de horarios
Botones rápidos: "Lun-Vie 9-18", "Lun-Sáb 10-20", etc.

### 6. Link directo "Ver mi tienda"
Botón prominente en el dashboard que abra `/tienda/{slug}`.

### 7. Wizard de onboarding
Para nuevas tiendas, paso a paso:
1. Nombre y slug
2. Logo y banner
3. Contacto
4. Primera publicación

---

## ❌ Errores Comunes a Evitar

### 1. URLs incorrectas
```typescript
// ❌ MAL
<a href={`/store/${slug}`}>

// ✅ BIEN
<a href={`/tienda/${slug}`}>
```

### 2. Columnas inexistentes
```typescript
// ❌ MAL
.update({ store_city: city })

// ✅ BIEN
.update({ city: city })
```

### 3. Buckets de storage incorrectos
```typescript
// ❌ MAL (bucket 'banners' no existe)
supabase.storage.from('banners').upload(...)

// ✅ BIEN (usar 'avatars' para todo)
supabase.storage.from('avatars').upload('store-banner-...', ...)
```

### 4. Olvidar filtrar demos
```typescript
// ❌ MAL (muestra tiendas demo)
fetchStores() {
  return supabase.from('users').select('*')
}

// ✅ BIEN
fetchStores() {
  return supabase.from('users')
    .select('*')
    .eq('is_demo_account', false)  // Excluir demos
}
```

---

## 📚 Archivos Relacionados

### Frontend
- `src/pages/Tiendas.tsx` - Directorio de tiendas
- `src/pages/Store.tsx` - Perfil de tienda pública
- `src/pages/DashboardUnified.tsx` - Configuración de tienda
- `src/services/users.ts` - Servicios de tienda

### Backend
- `functions/index.js` - `shareStore` function
- `scripts/supabase_stores.sql` - Migraciones de tienda
- `scripts/supabase_demo_account.sql` - Sistema demo

### Database
- `schema.sql` - Tabla `users` con campos `store_*`

---

## 🔗 Links Útiles

- Producción: https://www.ciclomarket.ar/tiendas
- Ejemplo tienda: https://www.ciclomarket.ar/tienda/{slug}
- Supabase: https://app.supabase.com/project/jmtsgywgeysagnfgdovr
- Firebase Console: https://console.firebase.google.com/project/ciclo-market
