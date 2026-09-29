-- 1. Create payment_methods table
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('link', 'phone', 'card')),
  bank TEXT CHECK (bank IN ('kaspi', 'halyk', 'freedom', 'other')),
  bank_name TEXT,
  value TEXT NOT NULL,
  recipient_name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_methods_bank_type_check CHECK (
    (type = 'link' AND bank IS NULL) OR
    (type IN ('phone', 'card') AND bank IS NOT NULL)
  ),
  CONSTRAINT payment_methods_other_bank_name_check CHECK (
    (bank != 'other') OR
    (bank = 'other' AND bank_name IS NOT NULL AND trim(bank_name) <> '')
  )
);

-- Indexes for payment_methods
CREATE INDEX IF NOT EXISTS idx_payment_methods_profile_id ON public.payment_methods(profile_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_profile_sort ON public.payment_methods(profile_id, sort_order);

-- 2. Create junction product_payment_methods
CREATE TABLE IF NOT EXISTS public.product_payment_methods (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  payment_method_id UUID NOT NULL REFERENCES public.payment_methods(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, payment_method_id)
);

CREATE INDEX IF NOT EXISTS idx_ppm_product_id ON public.product_payment_methods(product_id);
CREATE INDEX IF NOT EXISTS idx_ppm_payment_method_id ON public.product_payment_methods(payment_method_id);

-- 3. Lock down access: anon and authenticated cannot access payment_methods directly
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_payment_methods ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.payment_methods FROM anon, authenticated;
REVOKE ALL ON public.product_payment_methods FROM anon, authenticated;

-- 4. Data migration: migrate existing kaspi_link and kaspi_phone
DO $$
DECLARE
  p RECORD;
  prof_id UUID;
  pm_id UUID;
  rec_name TEXT;
BEGIN
  FOR p IN 
    SELECT pr.id, pr.creator_account_id, pr.kaspi_link, pr.kaspi_phone, ca.profile_id, ca.display_name as creator_name, prof.display_name as profile_name
    FROM products pr
    LEFT JOIN creator_accounts ca ON ca.id = pr.creator_account_id
    LEFT JOIN profiles prof ON prof.id = ca.profile_id
    WHERE pr.kaspi_link IS NOT NULL OR pr.kaspi_phone IS NOT NULL
  LOOP
    prof_id := COALESCE(p.profile_id, (SELECT id FROM profiles WHERE type IN ('creator', 'school') LIMIT 1));
    rec_name := COALESCE(p.profile_name, p.creator_name, 'Kaspi');
    
    IF p.kaspi_phone IS NOT NULL AND trim(p.kaspi_phone) <> '' THEN
      SELECT id INTO pm_id FROM payment_methods 
      WHERE profile_id = prof_id AND type = 'phone' AND bank = 'kaspi' AND value = trim(p.kaspi_phone) LIMIT 1;
      
      IF pm_id IS NULL THEN
        INSERT INTO payment_methods (profile_id, type, bank, bank_name, value, recipient_name, sort_order)
        VALUES (prof_id, 'phone', 'kaspi', NULL, trim(p.kaspi_phone), rec_name, 0)
        RETURNING id INTO pm_id;
      END IF;
      
      INSERT INTO product_payment_methods (product_id, payment_method_id)
      VALUES (p.id, pm_id)
      ON CONFLICT (product_id, payment_method_id) DO NOTHING;
    END IF;

    IF p.kaspi_link IS NOT NULL AND trim(p.kaspi_link) <> '' THEN
      SELECT id INTO pm_id FROM payment_methods 
      WHERE profile_id = prof_id AND type = 'link' AND value = trim(p.kaspi_link) LIMIT 1;
      
      IF pm_id IS NULL THEN
        INSERT INTO payment_methods (profile_id, type, bank, bank_name, value, recipient_name, sort_order)
        VALUES (prof_id, 'link', NULL, NULL, trim(p.kaspi_link), NULL, 1)
        RETURNING id INTO pm_id;
      END IF;
      
      INSERT INTO product_payment_methods (product_id, payment_method_id)
      VALUES (p.id, pm_id)
      ON CONFLICT (product_id, payment_method_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;
