-- Personal chats between a seller (creator account) and a buyer who bought one of their
-- products. One thread per seller/buyer pair. Only the direct-messages edge function (service
-- role) reads or writes these tables; files live in a private bucket or, for videos, in S3.

CREATE TABLE IF NOT EXISTS public.direct_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_account_id uuid NOT NULL REFERENCES public.creator_accounts(id) ON DELETE CASCADE,
  buyer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  last_message_preview text,
  unread_for_creator integer NOT NULL DEFAULT 0,
  unread_for_buyer integer NOT NULL DEFAULT 0,
  CONSTRAINT direct_threads_pair_key UNIQUE (creator_account_id, buyer_profile_id)
);

CREATE INDEX IF NOT EXISTS direct_threads_buyer_profile_id_idx
  ON public.direct_threads (buyer_profile_id);

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.direct_threads(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('creator', 'buyer')),
  text text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS direct_messages_thread_created_idx
  ON public.direct_messages (thread_id, created_at);

ALTER TABLE public.direct_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.direct_threads FROM anon, authenticated;
REVOKE ALL ON TABLE public.direct_messages FROM anon, authenticated;
GRANT ALL ON TABLE public.direct_threads TO service_role;
GRANT ALL ON TABLE public.direct_messages TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'direct-attachments',
  'direct-attachments',
  false,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/zip'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No client-side policies: only the service role (edge functions) touches this bucket.
