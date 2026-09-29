-- Drop legacy foreign key constraints pointing to the empty/deprecated simple_users table.
-- Buyers now live in public.profiles (referenced by buyer_profile_id),
-- and teachers live in public.product_teachers.

ALTER TABLE public.simple_purchases
  DROP CONSTRAINT IF EXISTS simple_purchases_simple_user_id_fkey,
  DROP CONSTRAINT IF EXISTS simple_purchases_assigned_teacher_id_fkey;
