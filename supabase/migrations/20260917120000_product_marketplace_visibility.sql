-- Marketplace visibility, separate from is_active (product exists) and
-- is_paused (sales stopped). New products start private; existing products
-- keep their current catalog visibility. Direct links (/p/:slug, checkout)
-- read products directly and are not affected by this flag.
-- Idempotent. Non-destructive.

-- Existing rows get true (they are already visible in the catalog today),
-- then the default flips to false for everything created from now on.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;

ALTER TABLE public.products
  ALTER COLUMN is_published SET DEFAULT false;

COMMENT ON COLUMN public.products.is_published IS
  'Shown in the marketplace catalog (public_products / search_catalog / storefront). Direct product links work regardless.';

CREATE INDEX IF NOT EXISTS products_published_idx
  ON public.products (is_published)
  WHERE is_published = true;

-- ---------------------------------------------------------------------------
-- public_products: same columns as 20260914120000_product_reviews, plus the
-- is_published filter. search_catalog, get_seller_storefront and
-- get_catalog_taxonomy all read from this view and inherit the filter.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_products
WITH (security_invoker = false, security_barrier = true) AS
SELECT
  p.id,
  p.slug,
  p.title,
  p.headline,
  p.image_url,
  p.price,
  p.has_schedule,
  p.created_at,
  p.category_id,
  c.slug AS category_slug,
  c.name_ru AS category_name_ru,
  c.name_kk AS category_name_kk,
  c.emoji AS category_emoji,
  p.subcategory_id,
  sc.slug AS subcategory_slug,
  sc.name_ru AS subcategory_name_ru,
  sc.name_kk AS subcategory_name_kk,
  p.lesson_format,
  p.event_starts_at,
  p.capacity,
  p.billing_period,
  pr.handle AS seller_handle,
  pr.display_name AS seller_display_name,
  pr.avatar_url AS seller_avatar_url,
  pr.type AS seller_type,
  coalesce(rat.avg_rating, 0)::numeric(3,2) AS avg_rating,
  coalesce(rat.review_count, 0)::int AS review_count
FROM public.products p
JOIN public.categories c ON c.id = p.category_id
JOIN public.subcategories sc ON sc.id = p.subcategory_id
JOIN public.creator_accounts ca ON ca.id = p.creator_account_id
JOIN public.profiles pr ON pr.id = ca.profile_id
LEFT JOIN LATERAL (
  SELECT avg(rv.rating)::numeric AS avg_rating, count(*)::int AS review_count
  FROM public.product_reviews rv
  WHERE rv.product_id = p.id
) rat ON true
WHERE p.is_active = true
  AND p.is_paused = false
  AND p.is_published = true
  AND COALESCE(ca.is_blocked, false) = false
  AND (
    c.slug <> 'events'
    OR (p.event_starts_at IS NOT NULL AND p.event_starts_at > now())
  );

REVOKE ALL ON public.public_products FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_products TO anon, authenticated;
GRANT ALL ON public.public_products TO service_role;

COMMENT ON VIEW public.public_products IS
  'Marketplace catalog: published, active, unpaused products. Includes is_demo rows and rating aggregates. Omits kaspi fields and past events.';

-- ---------------------------------------------------------------------------
-- Legacy seller profiles created by password login have auth_user_id NULL.
-- When their creator_accounts row is already linked to an auth identity,
-- attach the profile to the same identity so it shows up in the profile list
-- (otherwise such a user would be asked to pick a role on next login).
-- ---------------------------------------------------------------------------
UPDATE public.profiles p
SET auth_user_id = ca.auth_user_id
FROM public.creator_accounts ca
WHERE ca.profile_id = p.id
  AND p.auth_user_id IS NULL
  AND ca.auth_user_id IS NOT NULL;
