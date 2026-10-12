-- The language the server writes in for each recipient (RU / KK / EN).
--
-- Until now every push notification and email was Russian, whatever language
-- the person used the app in. Two places need to know the language:
--
--   push_tokens.language  - per device. Push notifications are addressed to
--                           device tokens, not to profiles, and the app's
--                           language is itself a per-device setting. Written by
--                           manage-push-token on every registration; the app
--                           registers again when the language is switched.
--   profiles.language     - per person, for email. Written by manage-profile
--                           (action set_language) after sign-in and on every
--                           language switch.
--
-- Additive only: two columns with a safe default, so existing rows read as
-- Russian (today's behaviour) and every statement can be re-run.
-- Apply this BEFORE deploying the edge functions that read these columns.

-- ---------------------------------------------------------------------------
-- 1. profiles.language
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'ru';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_language_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_language_check
      CHECK (language IN ('ru', 'kk', 'en'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.language IS
  'Language for emails to this person: ru | kk | en. Mirrors the app language they last chose.';

-- ---------------------------------------------------------------------------
-- 2. push_tokens.language
-- ---------------------------------------------------------------------------
ALTER TABLE public.push_tokens
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'ru';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'push_tokens_language_check'
      AND conrelid = 'public.push_tokens'::regclass
  ) THEN
    ALTER TABLE public.push_tokens
      ADD CONSTRAINT push_tokens_language_check
      CHECK (language IN ('ru', 'kk', 'en'));
  END IF;
END $$;

COMMENT ON COLUMN public.push_tokens.language IS
  'Language for push notifications to this device: ru | kk | en. Set when the device registers.';
