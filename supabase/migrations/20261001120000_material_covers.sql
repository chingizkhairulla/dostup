ALTER TABLE public.materials
ADD COLUMN IF NOT EXISTS cover_url text;

COMMENT ON COLUMN public.materials.cover_url IS
  'Optional S3 or legacy Supabase Storage image used as the material cover.';
