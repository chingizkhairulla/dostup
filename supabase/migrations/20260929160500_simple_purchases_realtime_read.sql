-- Enable Realtime events for simple_purchases by granting SELECT and adding read policy
GRANT SELECT ON public.simple_purchases TO anon, authenticated;

DROP POLICY IF EXISTS "simple_purchases_select_policy" ON public.simple_purchases;
CREATE POLICY "simple_purchases_select_policy"
  ON public.simple_purchases
  FOR SELECT
  TO anon, authenticated
  USING (true);
