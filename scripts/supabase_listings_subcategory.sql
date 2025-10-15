-- Añade subcategoría a listings para filtros precisos en tiendas/marketplace

alter table public.listings
  add column if not exists subcategory text null;

-- Índice para filtrar por subcategoría
create index if not exists ix_listings_subcategory on public.listings (subcategory);

