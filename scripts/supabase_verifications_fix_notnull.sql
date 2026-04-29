-- Fix: allow uploading front and back DNI photos independently.
-- The original table was created with NOT NULL on the URL columns, but users
-- upload each photo separately so both must be nullable.
ALTER TABLE public.account_verifications ALTER COLUMN dni_front_url DROP NOT NULL;
ALTER TABLE public.account_verifications ALTER COLUMN dni_back_url DROP NOT NULL;
