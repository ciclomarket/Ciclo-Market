# MundoBike · Mejoras SEO

Este repo incluye ajustes recientes de SEO on-site. Los cambios relevantes:

- Canonical normalizado hacia `https://www.ciclomarket.ar`.
- Metadatos dinámicos para categorías, tiendas y fichas de producto.
- Bloque informativo colapsable para evitar impacto en el layout.
- Middleware de servidor que fuerza HTTPS + `www` y remueve trailing slash.
- Script de auditoría rápida para validar páginas publicadas.

## scripts/seo-audit.ts

Herramienta CLI para chequear rápidamente un conjunto de URLs:

```bash
npx ts-node --esm scripts/seo-audit.ts https://www.ciclomarket.ar/ https://www.ciclomarket.ar/marketplace
```

También podés pasar un archivo con una URL por línea:

```bash
npx ts-node --esm scripts/seo-audit.ts --file urls.txt
```

Checks que ejecuta:

- Respuesta HTTP 200 sin cadenas de redirecciones.
- `<link rel="canonical">` apuntando a `www.ciclomarket.ar`.
- Meta description presente y ≤ 160 caracteres.
- JSON-LD válido (cada bloque `application/ld+json` se parsea).

La salida muestra ✅/❌ por URL e imprime las causas de fallo en cada caso.
