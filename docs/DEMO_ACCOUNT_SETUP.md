# Sistema de Cuentas Demo - Documentación

## Resumen

Sistema para crear contenido de demostración (publicaciones y tiendas) invisible a usuarios normales pero funcional para el demo user.

**Cuenta demo:** `admin@ciclomarket.ar` (ya existe como moderator)

---

## 🚀 Implementación Rápida

### Paso 1: Ejecutar SQL en Supabase

1. Ir a SQL Editor en Supabase Dashboard
2. Copiar contenido de `/scripts/supabase_demo_account.sql`
3. Ejecutar

### Paso 2: Verificar que admin@ciclomarket.ar sea demo

```sql
-- Verificar que está marcado como demo
SELECT email, is_demo_account 
FROM public.users 
WHERE email = 'admin@ciclomarket.ar';
-- Debe retornar: is_demo_account = true
```

### Paso 3: Probar flujo

1. Loguearse como `admin@ciclomarket.ar`
2. Crear una publicación
3. Verificar que aparece en "Mis Publicaciones"
4. Abrir navegador incógnito (sin sesión)
5. Buscar esa publicación → No debe aparecer

---

## 🏗️ Arquitectura Técnica

### Tablas Modificadas

| Tabla | Cambio | Descripción |
|-------|--------|-------------|
| `users` | +`is_demo_account` boolean | Marca usuario como cuenta demo |
| `listings` | +`is_demo_listing` boolean | Marca publicación como demo (auto) |

### Funciones SQL

| Función | Uso |
|---------|-----|
| `is_demo_user(uuid)` | Verificar si un user_id es demo |
| `is_current_user_demo()` | Verificar si el usuario logueado es demo |
| `is_store_visible(text)` | Verificar si una tienda es pública |
| `get_visible_listings(...)` | Obtener listings públicos (sin demos) |

### Políticas RLS

| Rol | Puede ver listings demo? |
|-----|-------------------------|
| `anon` (no logueado) | ❌ No |
| `authenticated` (usuario normal) | ❌ No |
| `authenticated` (el mismo demo user) | ✅ Sí |
| `moderator/admin` | ✅ Sí |

### Vista `public_stores`

Excluye automáticamente tiendas donde `is_demo_account = true`.

---

## 📱 Uso del Sistema

### Para crear demos de publicaciones:

1. **Login:** Entrar como `admin@ciclomarket.ar`
2. **Crear:** Usar el flujo normal de publicación
3. **Verificar:** Ir a "Mis Publicaciones" → Debe aparecer
4. **Test:** En incógnito, buscar la publicación → No debe aparecer

### Para crear demos de tiendas:

1. **Login:** Entrar como `admin@ciclomarket.ar`
2. **Activar tienda:** Ir a Perfil → Activar modo tienda
3. **Configurar:** Nombre, slug, banner, etc.
4. **Verificar:** El admin ve su tienda en `/store/[slug]`
5. **Test:** En incógnito, ir a `/store/[slug]` → 404 o redirección

### Para ver el modo demo desde el frontend:

```typescript
// Verificar si el usuario actual es demo
const { data: isDemo } = await supabase
  .rpc('is_current_user_demo');

if (isDemo) {
  // Mostrar badge "MODO DEMO" en el header
  // O permitir funciones especiales
}
```

---

## 🎨 UX Sugerida (Opcional)

### Badge en publicaciones demo

Para que el admin sepa qué publicaciones son demo vs reales:

```tsx
// En ListingCard o ListingDetail
const [isDemoListing, setIsDemoListing] = useState(false);

useEffect(() => {
  // Verificar si el listing es demo
  if (listing.sellerId) {
    supabase.rpc('is_demo_user', { p_user_id: listing.sellerId })
      .then(({ data }) => setIsDemoListing(data));
  }
}, [listing.sellerId]);

// En render:
{isDemoListing && (
  <span className="badge badge-demo">DEMO</span>
)}
```

### Banner para usuario demo

```tsx
// En el header o dashboard
const { data: isDemo } = await supabase.rpc('is_current_user_demo');

{isDemo && (
  <div className="demo-banner">
    🎭 MODO DEMO - Tu contenido es invisible al público
  </div>
)}
```

---

## 🔒 Seguridad

### Qué está protegido:

- ✅ Listings de demo no aparecen en búsquedas públicas
- ✅ Tiendas demo no aparecen en directorios
- ✅ Slugs de tienda demo no son accesibles
- ✅ APIs públicas filtran automáticamente

### Qué NO está protegido (por diseño):

- ⚠️ El demo user puede crear publicaciones "reales" si se desmarca `is_demo_account`
- ⚠️ Mods/Admins ven todo el contenido demo (necesario para moderación)

### Cambiar cuenta demo:

```sql
-- Quitar modo demo
UPDATE public.users 
SET is_demo_account = false 
WHERE email = 'admin@ciclomarket.ar';

-- O cambiar a otro email
UPDATE public.users 
SET is_demo_account = true 
WHERE email = 'otro@email.com';
```

---

## 🧪 Testing Checklist

- [ ] Ejecutar SQL sin errores
- [ ] Verificar `admin@ciclomarket.ar` tiene `is_demo_account = true`
- [ ] Crear listing como admin → Aparece en "Mis Publicaciones"
- [ ] En incógnito, listing no aparece en búsquedas
- [ ] En incógnito, listing no accesible por URL directa
- [ ] Activar tienda como admin → Tienda visible para admin
- [ ] En incógnito, tienda no accesible por slug
- [ ] Crear listing como usuario normal → Visible para todos
- [ ] Verificar que usuario normal no ve listings del admin demo

---

## 🛠️ Troubleshooting

### "Las publicaciones del admin aparecen públicas"

Verificar políticas RLS:
```sql
SELECT * FROM pg_policies WHERE tablename = 'listings';
-- Debe haber: listings_select_public y listings_select_auth
```

### "No puedo ver mis propias publicaciones como admin"

Verificar que `listings_select_auth` incluye:
```sql
or listings.seller_id = auth.uid()
```

### "La tienda demo es visible"

Verificar que se usa la vista `public_stores` y no `users` directamente en las queries de tiendas.

---

## 📚 Archivos Relacionados

- `/scripts/supabase_demo_account.sql` - SQL completo
- `src/services/listings.ts` - Queries de listings (usa políticas RLS)
- `src/services/stores.ts` - Queries de tiendas (debe usar `public_stores`)
