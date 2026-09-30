-- Catalog rails driven by real sales: "popular" (bought most in the last 30 days) and
-- "trending" (selling faster this week than last). Both read completed simple_purchases;
-- a product with no sales simply never enters these sorts, so the rails stay empty — and
-- the homepage hides them — until the marketplace has enough activity to mean something.

-- Narrow index for the 30-day window the stats CTE scans.
CREATE INDEX IF NOT EXISTS idx_simple_purchases_completed_product
  ON public.simple_purchases (product_id, confirmed_at, created_at)
  WHERE status = 'completed';

CREATE OR REPLACE FUNCTION public.search_catalog(
  q text DEFAULT NULL,
  p_category_slug text DEFAULT NULL,
  p_subcategory_slug text DEFAULT NULL,
  p_lesson_format text DEFAULT NULL,
  p_billing_period text DEFAULT NULL,
  p_min numeric DEFAULT NULL,
  p_max numeric DEFAULT NULL,
  p_sort text DEFAULT 'newest',
  p_limit int DEFAULT 24,
  p_offset int DEFAULT 0,
  p_only_new boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  headline text,
  image_url text,
  price numeric,
  has_schedule boolean,
  created_at timestamptz,
  category_id uuid,
  category_slug text,
  category_name_ru text,
  category_name_kk text,
  category_emoji text,
  subcategory_id uuid,
  subcategory_slug text,
  subcategory_name_ru text,
  subcategory_name_kk text,
  lesson_format text,
  event_starts_at timestamptz,
  capacity int,
  billing_period text,
  seller_handle text,
  seller_display_name text,
  seller_avatar_url text,
  seller_type text,
  avg_rating numeric,
  review_count int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  q_norm text;
  cat_slug text;
  sub_slug text;
  lesson_fmt text;
  billing text;
  sort_key text;
  lim int;
  off int;
  only_new boolean;
  needs_sales boolean;
BEGIN
  q_norm := public.immutable_unaccent(lower(btrim(coalesce(q, ''))));
  cat_slug := nullif(btrim(coalesce(p_category_slug, '')), '');
  sub_slug := nullif(btrim(coalesce(p_subcategory_slug, '')), '');
  lesson_fmt := CASE
    WHEN p_lesson_format IN ('individual', 'group') THEN p_lesson_format
    ELSE NULL
  END;
  billing := CASE
    WHEN p_billing_period IN ('month', 'quarter', 'year') THEN p_billing_period
    ELSE NULL
  END;
  sort_key := CASE lower(coalesce(p_sort, 'newest'))
    WHEN 'price_asc' THEN 'price_asc'
    WHEN 'price_ascending' THEN 'price_asc'
    WHEN 'price' THEN 'price_asc'
    WHEN 'price_desc' THEN 'price_desc'
    WHEN 'price_descending' THEN 'price_desc'
    WHEN 'rating' THEN 'rating'
    WHEN 'popular' THEN 'popular'
    WHEN 'trending' THEN 'trending'
    WHEN 'newest' THEN 'newest'
    ELSE 'newest'
  END;
  lim := least(greatest(coalesce(p_limit, 24), 1), 48);
  off := least(greatest(coalesce(p_offset, 0), 0), 10000);
  only_new := coalesce(p_only_new, false);
  -- Every other sort skips the purchase scan entirely: the CTE filters on a constant.
  needs_sales := sort_key IN ('popular', 'trending');

  RETURN QUERY
  WITH sales AS (
    SELECT
      s.product_id,
      count(*) FILTER (WHERE s.ts >= now() - interval '30 days') AS sales_30d,
      count(*) FILTER (WHERE s.ts >= now() - interval '7 days') AS sales_7d,
      count(*) FILTER (
        WHERE s.ts >= now() - interval '14 days' AND s.ts < now() - interval '7 days'
      ) AS sales_prev_7d
    FROM (
      SELECT sp.product_id, coalesce(sp.confirmed_at, sp.created_at) AS ts
      FROM public.simple_purchases sp
      WHERE needs_sales
        AND sp.status = 'completed'
        AND sp.product_id IS NOT NULL
        AND coalesce(sp.confirmed_at, sp.created_at) >= now() - interval '30 days'
    ) s
    GROUP BY s.product_id
  )
  SELECT
    pp.id,
    pp.slug,
    pp.title,
    pp.headline,
    pp.image_url,
    pp.price,
    pp.has_schedule,
    pp.created_at,
    pp.category_id,
    pp.category_slug,
    pp.category_name_ru,
    pp.category_name_kk,
    pp.category_emoji,
    pp.subcategory_id,
    pp.subcategory_slug,
    pp.subcategory_name_ru,
    pp.subcategory_name_kk,
    pp.lesson_format,
    pp.event_starts_at,
    pp.capacity,
    pp.billing_period,
    pp.seller_handle,
    pp.seller_display_name,
    pp.seller_avatar_url,
    pp.seller_type,
    pp.avg_rating,
    pp.review_count
  FROM public.public_products pp
  LEFT JOIN sales st ON st.product_id = pp.id
  WHERE (cat_slug IS NULL OR pp.category_slug = cat_slug)
    AND (sub_slug IS NULL OR pp.subcategory_slug = sub_slug)
    AND (lesson_fmt IS NULL OR pp.lesson_format = lesson_fmt)
    AND (billing IS NULL OR pp.billing_period = billing)
    AND (p_min IS NULL OR pp.price >= p_min)
    AND (p_max IS NULL OR pp.price <= p_max)
    AND (NOT only_new OR pp.created_at >= now() - interval '30 days')
    AND (sort_key <> 'rating' OR (pp.avg_rating >= 4.5 AND pp.review_count >= 3))
    AND (sort_key <> 'popular' OR coalesce(st.sales_30d, 0) > 0)
    -- Trending means growth, not volume: this week has to beat the one before it.
    AND (
      sort_key <> 'trending'
      OR (coalesce(st.sales_7d, 0) > 0 AND st.sales_7d > coalesce(st.sales_prev_7d, 0))
    )
    AND (
      q_norm = ''
      OR public.immutable_unaccent(lower(pp.title)) ILIKE '%' || q_norm || '%'
      OR public.immutable_unaccent(lower(coalesce(pp.headline, ''))) ILIKE '%' || q_norm || '%'
      OR public.immutable_unaccent(lower(coalesce(pp.seller_display_name, ''))) ILIKE '%' || q_norm || '%'
      OR similarity(public.immutable_unaccent(lower(pp.title)), q_norm) >= 0.15
      OR similarity(public.immutable_unaccent(lower(coalesce(pp.headline, ''))), q_norm) >= 0.15
      OR similarity(public.immutable_unaccent(lower(coalesce(pp.seller_display_name, ''))), q_norm) >= 0.15
    )
  ORDER BY
    CASE WHEN sort_key = 'newest' THEN pp.created_at END DESC NULLS LAST,
    CASE WHEN sort_key = 'price_asc' THEN pp.price END ASC NULLS LAST,
    CASE WHEN sort_key = 'price_desc' THEN pp.price END DESC NULLS LAST,
    CASE WHEN sort_key = 'rating' THEN pp.avg_rating END DESC NULLS LAST,
    CASE WHEN sort_key = 'rating' THEN pp.review_count END DESC NULLS LAST,
    CASE WHEN sort_key = 'popular' THEN st.sales_30d END DESC NULLS LAST,
    CASE WHEN sort_key = 'popular' THEN pp.avg_rating END DESC NULLS LAST,
    CASE WHEN sort_key = 'trending' THEN st.sales_7d - coalesce(st.sales_prev_7d, 0) END DESC NULLS LAST,
    CASE WHEN sort_key = 'trending' THEN st.sales_7d END DESC NULLS LAST,
    pp.id ASC
  LIMIT lim
  OFFSET off;
END;
$$;

REVOKE ALL ON FUNCTION public.search_catalog(
  text, text, text, text, text, numeric, numeric, text, integer, integer, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_catalog(
  text, text, text, text, text, numeric, numeric, text, integer, integer, boolean
) TO anon, authenticated, service_role;
