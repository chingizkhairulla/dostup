-- Prompt 3: Receipts, seller side

-- 1. Update simple_purchases status check constraint to include 'rejected'
ALTER TABLE public.simple_purchases DROP CONSTRAINT IF EXISTS simple_purchases_status_check;

ALTER TABLE public.simple_purchases 
ADD CONSTRAINT simple_purchases_status_check 
CHECK (status IN ('pending', 'completed', 'revoked', 'rejected'));

-- 2. Add confirmed_at, access_ends_at, seller_reminder_sent_at to simple_purchases
ALTER TABLE public.simple_purchases 
ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
ADD COLUMN IF NOT EXISTS access_ends_at timestamptz,
ADD COLUMN IF NOT EXISTS seller_reminder_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_simple_purchases_pending_reminders 
ON public.simple_purchases(created_at) 
WHERE status = 'pending' AND seller_reminder_sent_at IS NULL;

-- 3. Schedule 6-hour reminder cron job to check hourly
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'remind-pending-purchases') THEN
    PERFORM cron.unschedule('remind-pending-purchases');
  END IF;
  PERFORM cron.schedule(
    'remind-pending-purchases',
    '15 * * * *',
    'SELECT public.call_edge_function(''remind-pending-purchases'', ''{}''::jsonb)'
  );
END $$;
