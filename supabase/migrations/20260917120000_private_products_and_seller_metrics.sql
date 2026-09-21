-- Private-by-default products + public seller storefront metrics.
--
-- 1. New products are created hidden so a seller can add materials, schedule
--    and check the preview before anything reaches the marketplace.
-- 2. get_seller_storefront also returns the seller's joined date, rating,
--    review count and sales count, still in a single query (no N+1).
-- 3. profiles.bio gets a length cap now that sellers can edit it themselves.

-- ---------------------------------------------------------------------------
-- 1. products: private by default (new rows only, existing rows untouched)
-- ---------------------------------------------------------------------------
ALTER TABLE public.products ALTER COLUMN is_active SET DEFAULT false;

COMMENT ON COLUMN public.products.is_active IS
  'Published to the marketplace. New products default to false (private draft); is_paused is a separate state that keeps the link alive with a message.';

-- ---------------------------------------------------------------------------
-- 2. profiles.bio: public seller description, capped at 500 characters
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_bio_length_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_bio_length_check
      CHECK (bio IS NULL OR char_length(bio) <= 500);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Indexes supporting the storefront aggregates
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS purchases_product_idx
  ON public.purchases (product_id);

CREATE INDEX IF NOT EXISTS products_creator_account_idx
  ON public.products (creator_account_id);

-- ---------------------------------------------------------------------------
-- 4. get_seller_storefront: add joined date + rating / review / sales metrics
-- ---------------------------------------------------------------------------
-- Metrics aggregate over ALL of the seller's products, not just the publicly
-- listed ones: rating and sales are seller history, and scoping them to the
-- current listing would let a seller raise their rating by hiding a product.
-- The product list itself still comes from public_products, so private and
-- paused products are never exposed.
DROP FUNCTION IF EXISTS public.get_seller_storefront(text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.get_seller_storefront(
  p_handle text,
  p_category_slug text DEFAULT NULL,
  p_subcategory_slug text DEFAULT NULL,
  p_lesson_format text DEFAULT NULL,
  p_billing_period text DEFAULT NULL
)
RETURNS TABLE (
  handle text,
  display_name text,
  avatar_url text,
  type text,
  bio text,
  created_at timestamptz,
  avg_rating numeric,
  review_count int,
  sales_count int,
  products jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  h text := lower(btrim(coalesce(p_handle, '')));
  cat_slug text := nullif(btrim(coalesce(p_category_slug, '')), '');
  sub_slug text := nullif(btrim(coalesce(p_subcategory_slug, '')), '');
  lesson_fmt text := CASE
    WHEN p_lesson_format IN ('individual', 'group') THEN p_lesson_format
    ELSE NULL
  END;
  billing text := CASE
    WHEN p_billing_period IN ('month', 'quarter', 'year') THEN p_billing_period
    ELSE NULL
  END;
BEGIN
  IF h = '' OR public.is_reserved_handle(h) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pr.handle,
    pr.display_name,
    pr.avatar_url,
    pr.type,
    pr.bio,
    pr.created_at,
    -- Average over every individual review of every product this seller owns,
    -- never an average of per-product averages.
    coalesce(round(rat.avg_rating, 2), 0)::numeric(3,2) AS avg_rating,
    coalesce(rat.review_count, 0)::int AS review_count,
    coalesce(sal.sales_count, 0)::int AS sales_count,
    coalesce((
      SELECT jsonb_agg(to_jsonb(pp) ORDER BY pp.created_at DESC, pp.id)
      FROM public.public_products pp
      WHERE pp.seller_handle = pr.handle
        AND (cat_slug IS NULL OR pp.category_slug = cat_slug)
        AND (sub_slug IS NULL OR pp.subcategory_slug = sub_slug)
        AND (lesson_fmt IS NULL OR pp.lesson_format = lesson_fmt)
        AND (billing IS NULL OR pp.billing_period = billing)
    ), '[]'::jsonb) AS products
  FROM public.profiles pr
  LEFT JOIN LATERAL (
    SELECT
      avg(rv.rating)::numeric AS avg_rating,
      count(*)::int AS review_count
    FROM public.product_reviews rv
    JOIN public.products p ON p.id = rv.product_id
    JOIN public.creator_accounts ca ON ca.id = p.creator_account_id
    WHERE ca.profile_id = pr.id
  ) rat ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS sales_count
    FROM public.purchases pu
    JOIN public.products p ON p.id = pu.product_id
    JOIN public.creator_accounts ca ON ca.id = p.creator_account_id
    WHERE ca.profile_id = pr.id
      AND pu.status = 'completed'
  ) sal ON true
  WHERE pr.handle = h
    AND pr.type IN ('creator', 'school');
END;
$$;

REVOKE ALL ON FUNCTION public.get_seller_storefront(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_seller_storefront(text, text, text, text, text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_seller_storefront(text, text, text, text, text) IS
  'Public seller storefront: profile basics, lifetime rating/review/sales metrics and the publicly listed products, in one query. Exposes no private contact or payment data.';
