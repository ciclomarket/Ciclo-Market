-- Enforce 15-day expiry for free plan listings
-- Usage: run this script in Supabase SQL editor (or psql) on your project.

create or replace function public.enforce_free_listing_expiry()
returns trigger
language plpgsql
as $$
declare
  v_code text;
begin
  -- Skip for hard-deleted or archived states
  if new.status is not null and lower(trim(new.status::text)) in ('deleted','archived') then
    return new;
  end if;

  -- Resolve plan code in priority order
  v_code := coalesce(lower(trim(new.plan_code)), lower(trim(new.plan)), lower(trim(new.seller_plan)));

  if v_code = 'free' then
    if new.expires_at is null then
      -- Set 15 days from now (UTC) if missing
      new.expires_at := (now() at time zone 'utc') + interval '15 days';
    end if;
  end if;

  return new;
end;
$$;

-- Recreate trigger safely
drop trigger if exists trg_enforce_free_listing_expiry on public.listings;
create trigger trg_enforce_free_listing_expiry
before insert or update on public.listings
for each row execute function public.enforce_free_listing_expiry();

-- Optional one-off backfill for existing rows (safe to run multiple times)
update public.listings
set expires_at = (now() at time zone 'utc') + interval '15 days'
where expires_at is null
  and coalesce(lower(trim(plan_code)), lower(trim(plan)), lower(trim(seller_plan))) = 'free'
  and (status is null or lower(trim(status)) not in ('deleted','archived'));

