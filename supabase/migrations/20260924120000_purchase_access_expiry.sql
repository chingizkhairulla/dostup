-- A seller can set how long each buyer keeps access: forever (NULL), until a date, or close it
-- (status 'revoked'). Subscriptions keep using subscriptions.current_period_end.

ALTER TABLE public.simple_purchases
  ADD COLUMN IF NOT EXISTS access_expires_at timestamptz;

COMMENT ON COLUMN public.simple_purchases.access_expires_at IS
  'End of access for a one-time purchase set by the seller; NULL means no end.';

CREATE INDEX IF NOT EXISTS simple_purchases_access_expires_at_idx
  ON public.simple_purchases (access_expires_at)
  WHERE access_expires_at IS NOT NULL;
