-- RLS policies for the "verifications" storage bucket
-- Allows authenticated users to upload their own DNI photos

-- INSERT: user can upload files containing their own user_id in the filename
INSERT INTO storage.buckets (id, name, public)
VALUES ('verifications', 'verifications', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing policies if any
DROP POLICY IF EXISTS "verifications_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "verifications_select_own" ON storage.objects;
DROP POLICY IF EXISTS "verifications_select_admins" ON storage.objects;
DROP POLICY IF EXISTS "verifications_update_own" ON storage.objects;
DROP POLICY IF EXISTS "verifications_delete_own" ON storage.objects;

-- Authenticated users can upload files whose name contains their own user id
CREATE POLICY "verifications_insert_own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'verifications'
  AND name LIKE '%' || auth.uid()::text || '%'
);

-- Authenticated users can read their own files
CREATE POLICY "verifications_select_own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'verifications'
  AND name LIKE '%' || auth.uid()::text || '%'
);

-- Admins can read all verification files
CREATE POLICY "verifications_select_admins"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'verifications'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Users can update (upsert) their own files
CREATE POLICY "verifications_update_own"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'verifications'
  AND name LIKE '%' || auth.uid()::text || '%'
);

-- Users can delete their own files
CREATE POLICY "verifications_delete_own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'verifications'
  AND name LIKE '%' || auth.uid()::text || '%'
);
