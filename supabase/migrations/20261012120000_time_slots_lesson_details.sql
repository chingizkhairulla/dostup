-- The slot wizard saves lesson details per slot (title, description, cover, offline address).
-- Without these columns PostgREST rejects the whole insert:
-- "Could not find the 'description' column of 'time_slots' in the schema cache".
ALTER TABLE public.time_slots
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS location text;

NOTIFY pgrst, 'reload schema';
