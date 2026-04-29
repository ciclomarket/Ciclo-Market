-- Run this once in the Supabase SQL editor to create the instagram-cards storage bucket
-- and allow public read access to generated PNGs.

-- 1. Create bucket (public = true so the returned URL is directly downloadable)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'instagram-cards',
  'instagram-cards',
  true,
  5242880,  -- 5 MB per file
  array['image/png']
)
on conflict (id) do nothing;

-- 2. Allow the service role (backend) to INSERT objects
create policy "service_role can upload instagram cards"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'instagram-cards');

-- 3. Allow public SELECT (anyone can download via the public URL)
create policy "public read instagram cards"
  on storage.objects for select
  to public
  using (bucket_id = 'instagram-cards');
