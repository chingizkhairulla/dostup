-- Prompt 2: Receipts, buyer side & manual verification
-- 1. Add payment_method_id to simple_purchases to record which method the buyer selected
ALTER TABLE public.simple_purchases 
ADD COLUMN IF NOT EXISTS payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_simple_purchases_payment_method_id ON public.simple_purchases(payment_method_id);

-- 2. Create function to delete receipt submissions and files older than 12 months (Privacy Policy compliance)
CREATE OR REPLACE FUNCTION public.cleanup_expired_payment_receipts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete storage objects for receipts older than 12 months
  DELETE FROM storage.objects
  WHERE bucket_id = 'payment-receipts'
    AND created_at < now() - interval '12 months';

  -- Delete payment submissions older than 12 months
  DELETE FROM public.payment_submissions
  WHERE created_at < now() - interval '12 months';
END;
$$;

-- 3. Schedule cron job to run daily at 04:00 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-receipts') THEN
    PERFORM cron.unschedule('cleanup-expired-receipts');
  END IF;
  PERFORM cron.schedule(
    'cleanup-expired-receipts',
    '0 4 * * *',
    'SELECT public.cleanup_expired_payment_receipts();'
  );
END $$;
