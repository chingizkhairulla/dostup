# Creative Phase: Seller Storefront Metrics Scope

Type: **Data semantics** · Spec refs: §9.5, §9.6, §12 · AC 25-29, 38

## Question
Should the seller's rating / review count / sales count aggregate over **all** their products, or only over products currently visible in the marketplace?

## Relevant facts
- `product_reviews.product_id` → `products(id) ON DELETE CASCADE`: deleting a product deletes its reviews.
- `purchases.product_id` → `products(id) ON DELETE SET NULL`: deleting a product keeps the purchase row but orphans it, so it drops out of any seller join. Relevant to the later fake-product cleanup (§16).
- `public_products` already filters `is_active AND NOT is_paused AND NOT blocked`, so the **product list** on the storefront is correctly scoped for free.
- A "completed" purchase is `purchases.status = 'completed'` (`_shared/purchase.ts` sets it, with `confirmed_at`).

## Options

### Option A — Aggregate over all of the seller's products ← **SELECTED**
- ✅ Matches the spec's wording directly: "среднее значение отзывов по **ВСЕМ** продуктам продавца" (§9.6) and "реальных подтверждённых покупок" (§9.5).
- ✅ Rating and sales read as seller **reputation and history**. A buyer seeing "152 продажи" reasonably expects lifetime sales, not "sales of things currently listed".
- ✅ Closes an integrity hole: under the alternative, a seller could unpublish a badly-reviewed product to inflate their rating, and republish afterwards.
- ⚠️ A buyer can see a rating derived partly from products they cannot currently buy. Acceptable — this is how marketplace seller ratings conventionally work.

### Option B — Aggregate only over currently-public products
- ✅ Everything shown is verifiable against the visible product list.
- ❌ Contradicts §9.6's "по ВСЕМ продуктам".
- ❌ Creates the rating-gaming incentive above.
- ❌ Makes the numbers jump around whenever a seller pauses a course between cohorts — which, given the pause feature exists exactly for cohort gaps, would be frequent and confusing.

## Decision
**Option A** — aggregate reviews and completed purchases across all of the seller's products; list only public products (AC 28-29).

## Implementation guidelines
1. Extend `get_seller_storefront` (single query, LATERAL subqueries — no N+1, §12/AC 38) to return:
   - `created_at` — raw timestamp; the **year is derived in the UI**, never stored separately (§9.3).
   - `avg_rating numeric` — `avg(rv.rating)` over all `product_reviews` rows joined to the seller's products. This is an average over **individual reviews**, explicitly *not* an average of per-product averages (§9.6).
   - `review_count int` — `count(*)` of those same rows.
   - `sales_count int` — `count(*)` of `purchases` where `status = 'completed'` on the seller's products.
2. Keep `SECURITY DEFINER` and return only public columns — no email, phone, `auth_user_id`, or payment data (§11, AC 30).
3. UI in `StorefrontPage.tsx`:
   - `★ 4.8 · 243 отзыва` when `review_count > 0`; plain **"Нет отзывов"** when zero — never `0.0` (§9.6).
   - `152 продажи` with correct Russian plural forms (продажа / продажи / продаж).
   - "На платформе с {year} года", year derived from `created_at`.
4. Update the `SellerStorefront` type in `src/lib/catalog.ts` and the mapper in `src/hooks/useSellerStorefront.ts` in the same change, or the new fields are silently dropped by the existing explicit field mapping.
5. Leave `public_products` and `search_catalog` untouched — only `get_seller_storefront` is redefined, which bounds the regression surface to the storefront page.
