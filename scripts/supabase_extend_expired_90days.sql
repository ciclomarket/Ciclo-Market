-- Extender publicaciones vencidas por 90 días y reactivarlas
-- Uso: ejecutar en el SQL Editor de Supabase (rol owner) o por psql.
-- IMPORTANTE: revisá el SELECT previo antes de correr el UPDATE masivo.

-- 1) Previsualización: qué filas serían afectadas hoy
select id, title, seller_id, status, expires_at
from public.listings
where (status = 'expired' or (expires_at is not null and expires_at <= (now() at time zone 'utc')))
  and status <> 'deleted'
order by coalesce(expires_at, created_at) asc
limit 500;

-- 2) UPDATE masivo: sumar 90 días y activar
-- Nota: si querés que todas venzan exactamente en 90 días desde ahora,
-- usá expires_at = (now() at time zone 'utc') + interval '90 days'.
-- Abajo usamos base en mayor(fecha_vencida_actual, ahora) para robustez.
update public.listings
set
  expires_at = (
    case
      when expires_at is not null and expires_at > (now() at time zone 'utc')
        then expires_at + interval '90 days'
      else (now() at time zone 'utc') + interval '90 days'
    end
  ),
  status = 'active',
  updated_at = (now() at time zone 'utc')
where (status = 'expired' or (expires_at is not null and expires_at <= (now() at time zone 'utc')))
  and status <> 'deleted';

-- 3) Verificar resultado
select count(*) as reactivadas
from public.listings
where status = 'active' and expires_at > (now() at time zone 'utc');

