-- Vista de pagos enriquecida con email del usuario y estado del crédito
-- Ejecutar en el editor SQL de Supabase (proyecto de producción)

drop view if exists public.admin_payments_enriched;

create or replace view public.admin_payments_enriched as
select
  p.id,
  p.created_at,
  p.user_id,
  u.email as user_email,
  p.listing_id,
  p.amount,
  p.currency,
  p.status as payment_status,
  p.applied,
  p.applied_at,
  p.provider,
  p.provider_ref,
  c.id as credit_id,
  c.status as credit_status,
  c.preference_id as credit_preference_id,
  c.plan_code as credit_plan_code,
  c.expires_at as credit_expires_at
from public.payments p
left join public.users u
  on u.id = p.user_id
left join lateral (
  select c2.*
  from public.publish_credits c2
  where c2.provider = p.provider
    and (
      (p.provider_ref is not null and c2.provider_ref = p.provider_ref)
      or (p.provider_ref is null and c2.user_id = p.user_id)
    )
  order by
    case when p.provider_ref is not null and c2.provider_ref = p.provider_ref then 0 else 1 end,
    abs(extract(epoch from (c2.created_at - p.created_at))) asc
  limit 1
) c on true
order by p.created_at desc;

-- Importante: que ejecute con privilegios del invocador (RLS-aware)
alter view public.admin_payments_enriched set (security_invoker = true);
