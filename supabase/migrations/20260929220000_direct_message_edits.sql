-- Personal chat messages can be edited by their sender; the chat marks them "edited".
-- Idempotent. Non-destructive.

ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

COMMENT ON COLUMN public.direct_messages.edited_at IS
  'Last time the sender changed the text; NULL for messages never edited.';
