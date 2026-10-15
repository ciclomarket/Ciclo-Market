-- Borradores precargados para outreach ("link mágico").
-- Un admin carga texto + fotos de una publicación externa (Marketplace, ML, etc.),
-- la IA extrae los datos y se genera un link /p/<token> para que el vendedor
-- revise y publique en 1 click. Nada se publica hasta que el vendedor confirma.

create table if not exists public.listing_prefills (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  data jsonb not null default '{}'::jsonb,
  images text[] not null default '{}',
  source_url text,
  source_text text,
  seller_name text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  first_opened_at timestamptz,
  open_count integer not null default 0,
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null
);

create index if not exists listing_prefills_created_at_idx on public.listing_prefills (created_at desc);

-- Solo el server (service role) accede; sin políticas = sin acceso desde el cliente.
alter table public.listing_prefills enable row level security;
