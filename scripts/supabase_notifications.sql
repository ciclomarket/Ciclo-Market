-- Idempotent setup for notifications feed and helpers
-- Run this in Supabase SQL editor

-- Extensions
create extension if not exists pgcrypto;

-- Table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  type text not null check (type in ('marketing','question','offer','system')),
  title text not null,
  body text not null,
  metadata jsonb null,
  cta_url text null,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_created
  on public.notifications(user_id, created_at desc);

-- RLS
alter table public.notifications enable row level security;

-- Allow authenticated users to read their notifications and public ones (user_id is null)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_select_auth'
  ) then
    create policy notifications_select_auth
      on public.notifications
      for select
      to authenticated
      using (user_id is null or user_id = auth.uid());
  end if;
end$$;

-- Allow users to update read_at only on their own rows via direct update (optional; RPC also provided)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_update_read_auth'
  ) then
    create policy notifications_update_read_auth
      on public.notifications
      for update
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end$$;

-- RPC to mark notifications as read (runs as owner)
create or replace function public.mark_notifications_read(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
  set read_at = now()
  where id = any(p_ids)
    and user_id = auth.uid();
end;
$$;

-- Realtime publication
alter publication supabase_realtime add table public.notifications;

