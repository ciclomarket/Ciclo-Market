-- Payment abandon traceability hardening (safe / idempotent)
-- Ensures pending payments can always be mapped to listing + plan for campaign rendering.

alter table if exists public.payments
  add column if not exists plan_code text null;

alter table if exists public.payments
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table if exists public.payments
  add column if not exists seller_id uuid null references public.users(id) on delete set null;

alter table if exists public.payments
  add column if not exists email text null;

create index if not exists idx_payments_pending_window
  on public.payments (status, created_at desc);

create index if not exists idx_payments_listing_pending
  on public.payments (listing_id, status, created_at desc);

create index if not exists idx_payments_plan_code
  on public.payments (plan_code);

comment on column public.payments.plan_code is 'Plan intent captured at checkout (premium|pro|basic)';
comment on column public.payments.metadata is 'Checkout metadata payload (listingId, planCode, campaign, etc.)';
comment on column public.payments.seller_id is 'Seller owner for marketing/payment reconciliation';
comment on column public.payments.email is 'Snapshot email used by payment intent';

-- Backfill best effort from metadata where available.
update public.payments
set
  listing_id = coalesce(
    listing_id,
    nullif(metadata->>'listingId', '')::uuid
  ),
  plan_code = coalesce(
    plan_code,
    nullif(lower(metadata->>'planCode'), '')
  ),
  seller_id = coalesce(
    seller_id,
    nullif(metadata->>'sellerId', '')::uuid,
    nullif(metadata->>'userId', '')::uuid,
    user_id
  )
where status = 'pending';
