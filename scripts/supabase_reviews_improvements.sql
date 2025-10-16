-- Mejoras al sistema de reseñas (idempotente)
-- Ejecutar en el editor SQL de Supabase.

-- 1) Asegurar columnas y constraints útiles en public.reviews
do $$
begin
  -- Columna de estado de visibilidad
  execute 'alter table public.reviews add column if not exists status text not null default ''published''';

  -- Respuesta opcional del vendedor
  execute 'alter table public.reviews add column if not exists seller_reply text null';
  execute 'alter table public.reviews add column if not exists seller_reply_at timestamptz null';

  -- Constraint de rango de rating (1..5)
  if not exists (
    select 1 from pg_constraint
    where conname = 'reviews_rating_range_chk'
      and conrelid = 'public.reviews'::regclass
  ) then
    alter table public.reviews
      add constraint reviews_rating_range_chk
      check (rating >= 1 and rating <= 5);
  end if;

  -- Índices para acceso por vendedor y orden temporal
  execute 'create index if not exists ix_reviews_seller_id on public.reviews (seller_id)';
  execute 'create index if not exists ix_reviews_seller_id_created_at on public.reviews (seller_id, created_at desc)';
end$$;

-- 2) Índices para acelerar can-review en public.contact_events
do $$
begin
  execute 'create index if not exists ix_contact_events_seller_buyer_created_at on public.contact_events (seller_id, buyer_id, created_at)';
end$$;

