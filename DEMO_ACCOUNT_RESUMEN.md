# ✅ Sistema de Cuentas Demo - Implementación Completa

## 📋 Resumen Ejecutivo

Se implementó un sistema completo para que `admin@ciclomarket.ar` pueda crear publicaciones y tiendas **funcionales pero invisibles** al público general.

---

## 🗂️ Archivos Creados/Modificados

### 1. SQL - Base de datos
**Archivo:** `scripts/supabase_demo_account.sql`

Agrega:
- Columna `is_demo_account` en `users`
- Columna `is_demo_listing` en `listings`
- Trigger auto-marking de listings como demo
- Funciones auxiliares (`is_demo_user`, `is_current_user_demo`, `is_store_visible`)
- Políticas RLS actualizadas
- Vista `public_stores` (excluye tiendas demo)

### 2. Frontend - Servicios
**Archivo:** `src/services/users.ts`

Modifica:
- `fetchStores()` → usa `public_stores` (no ve tiendas demo)
- `fetchStoreProfileBySlug()` → usa `public_stores` (404 para tiendas demo)

### 3. Documentación
**Archivos:**
- `docs/DEMO_ACCOUNT_SETUP.md` - Guía completa
- `DEMO_ACCOUNT_RESUMEN.md` - Este resumen

---

## 🚀 Pasos para Activar (URGENTE)

### Paso 1: Ejecutar SQL en Supabase (1 minuto)
```bash
# Ir a Supabase Dashboard → SQL Editor
# Copiar contenido de: scripts/supabase_demo_account.sql
# Ejecutar
```

### Paso 2: Verificar instalación
```sql
-- Test 1: Verificar columna
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'is_demo_account';

-- Test 2: Verificar que admin es demo
SELECT email, is_demo_account 
FROM public.users 
WHERE email = 'admin@ciclomarket.ar';
-- Debe retornar: is_demo_account = true

-- Test 3: Verificar vista
SELECT * FROM public.public_stores LIMIT 1;
```

### Paso 3: Deploy del frontend
```bash
git add src/services/users.ts
git commit -m "Update store queries to exclude demo accounts"
git push
# Esperar deploy automático
```

---

## 🎯 Cómo Usar el Modo Demo

### Crear publicación demo:
1. Loguearse como `admin@ciclomarket.ar`
2. Crear publicación normalmente
3. Ver en "Mis Publicaciones" ✅
4. En incógnito: No aparece ✅

### Crear tienda demo:
1. Loguearse como `admin@ciclomarket.ar`
2. Ir a Perfil → Activar modo tienda
3. Configurar nombre, slug, banner
4. Admin ve: `/store/[slug]` ✅
5. Público ve: 404 o redirect ✅

---

## 🔒 Seguridad Implementada

| Escenario | Usuario Anónimo | Usuario Normal | Admin Demo | Mod/Admin |
|-----------|----------------|----------------|------------|-----------|
| Ver listing demo | ❌ No | ❌ No | ✅ Sí (suyo) | ✅ Sí |
| Ver tienda demo | ❌ No | ❌ No | ✅ Sí (suya) | ✅ Sí |
| Buscar listings | Filtrado | Filtrado | Todo | Todo |
| Directorio tiendas | Filtrado | Filtrado | Todo | Todo |

---

## 🧪 Testing Checklist

- [ ] Ejecutar SQL sin errores
- [ ] `admin@ciclomarket.ar` tiene `is_demo_account = true`
- [ ] Crear listing como admin → Aparece en "Mis Publicaciones"
- [ ] En incógnito, listing NO aparece en búsquedas
- [ ] Activar tienda como admin → Tienda visible para admin
- [ ] En incógnito, tienda NO aparece en `/tiendas`
- [ ] En incógnito, URL directa `/store/[slug-demo]` da 404
- [ ] Crear listing como usuario normal → Visible para todos

---

## 🛠️ Troubleshooting

### "Las publicaciones del admin aparecen públicas"
```sql
-- Verificar políticas
SELECT policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'listings';

-- Debe haber políticas listings_select_public y listings_select_auth
-- que filtren por is_demo_account
```

### "La tienda demo es visible en el directorio"
```sql
-- Verificar que se usa public_stores
SELECT * FROM public.public_stores 
WHERE store_slug = 'slug-de-tienda-demo';
-- Debe retornar 0 rows
```

### "El admin no ve sus propias publicaciones"
Verificar que la política `listings_select_auth` incluye:
```sql
or listings.seller_id = auth.uid()
```

---

## 📝 Notas Técnicas

### Auto-marking
Todo listing creado por un usuario demo se marca automáticamente como `is_demo_listing = true` via trigger.

### Políticas RLS
- `listings_select_public`: Anónimos no ven nada de demos
- `listings_select_auth`: Usuarios logueados no ven demos de OTROS, pero sí los suyos

### Vista public_stores
Es una view que filtra `users` donde `is_demo_account = false`.

---

## 🎨 Mejoras Futuras (Opcional)

### Badge "MODO DEMO" en header
```tsx
const { data: isDemo } = await supabase.rpc('is_current_user_demo');
{isDemo && <Banner>🎭 Modo Demo - Contenido invisible al público</Banner>}
```

### Badge en cards de listing demo
```tsx
const { data: isDemoListing } = await supabase
  .rpc('is_demo_user', { p_user_id: listing.sellerId });
{isDemoListing && <Badge>DEMO</Badge>}
```

### Toggle modo demo en admin panel
Permitir activar/desactivar modo demo sin SQL.

---

## 📞 Soporte

Si algo falla:
1. Revisar `docs/DEMO_ACCOUNT_SETUP.md`
2. Verificar políticas RLS en Supabase
3. Chequear que el SQL se ejecutó completo

---

**Estado:** ✅ Implementado y listo para deploy
**Prioridad:** Ejecutar SQL en producción ASAP
