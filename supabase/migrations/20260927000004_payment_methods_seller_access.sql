-- Allow authenticated sellers to read and manage their own payment methods
-- Keep anonymous visitors and other users completely locked out

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_payment_methods TO authenticated;

-- Policies for payment_methods: owner-scoped to profile owned by auth user
DROP POLICY IF EXISTS "Sellers can manage their own payment methods" ON public.payment_methods;
CREATE POLICY "Sellers can manage their own payment methods"
  ON public.payment_methods
  FOR ALL
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
      UNION
      SELECT profile_id FROM public.creator_accounts WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    profile_id IN (
      SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
      UNION
      SELECT profile_id FROM public.creator_accounts WHERE auth_user_id = auth.uid()
    )
  );

-- Policies for product_payment_methods: owner-scoped via payment_methods
DROP POLICY IF EXISTS "Sellers can manage product payment methods" ON public.product_payment_methods;
CREATE POLICY "Sellers can manage product payment methods"
  ON public.product_payment_methods
  FOR ALL
  TO authenticated
  USING (
    payment_method_id IN (
      SELECT id FROM public.payment_methods WHERE profile_id IN (
        SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
        UNION
        SELECT profile_id FROM public.creator_accounts WHERE auth_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    payment_method_id IN (
      SELECT id FROM public.payment_methods WHERE profile_id IN (
        SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
        UNION
        SELECT profile_id FROM public.creator_accounts WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Anonymous visitors and other users cannot access payment_methods directly
REVOKE ALL ON public.payment_methods FROM anon;
REVOKE ALL ON public.product_payment_methods FROM anon;
