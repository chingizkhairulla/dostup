# Creative: category/taxonomy names in English (C2)

**Date:** 2026-09-22 · **Task:** English language (RU/KK/EN) · **Type:** Architecture / data semantics

## 1. Requirements and constraints discovered in the code

### Requirements
- R1. Category and subcategory names display in English for EN users.
- R2. Catalog filtering, search and counts must not break.
- R3. Production safety: `supabase/config.toml` points at the live `trydostup.online` project.
- R4. Must not create divergent data (two rows meaning the same thing in different languages).

### Constraints measured (not assumed)
| Fact | Evidence |
|---|---|
| **Categories/subcategories are seed-only config** — no runtime INSERT exists anywhere in `src/` or `supabase/functions/` | repo-wide grep for inserts into those tables: zero hits |
| Only **5 categories** and ~35 subcategories, seeded with `ON CONFLICT DO UPDATE` | `20260825100000_category_taxonomy.sql:40-97` |
| **Search never matches category names.** `p_query` is compared only against `title`, `headline`, `seller_display_name` | `20260914120000_product_reviews.sql:233-239` |
| **Filtering is by slug, not name** — `pp.category_slug = cat_slug`, `pp.subcategory_slug = sub_slug` | same file, `:224-225` |
| `get_catalog_taxonomy` hand-builds JSON with explicit `name_ru`/`name_kk` keys | `20260826210000_demo_in_public_catalog.sql:267+` |
| **7 migrations** redefine the same views/functions; the latest definition of each is scattered across them | `public_products` latest in `…product_reviews.sql:49`; `products_catalog` latest in `…add_media_to_products.sql:3`; `get_catalog_taxonomy` latest in `…demo_in_public_catalog.sql:267` |
| A migration from the previous task is **still unapplied** and already recreates `get_seller_storefront` | `20260917120000_private_products_and_seller_metrics.sql:52` |
| No edge function ever reads category names | grep for `name_kk` in `supabase/functions/`: zero hits |
| `products.topic` is **free text**, and `topics` has an "Anyone can insert" RLS policy with `created_by` | `20260904183000_product_topics_and_taxonomy.sql:3-32` |

### The fact that decides it
Category names are **display-only**. Nothing filters, searches, sorts or joins on them — everything keys off `slug`. So putting English names in the database buys no functional capability; it would only move 40 constant strings to a place that costs 7 object recreations on a production database.

## 2. Options

### Option A — `name_en` column + recreate every affected view/RPC
- ➕ Symmetric with `name_ru`/`name_kk`; one source of truth; available server-side if ever needed.
- ➖ Requires reconstructing 4 views + 3 functions from their *latest* definitions scattered over 7 migrations, and stacking that on top of an **already-pending unapplied migration**, against production, for 40 strings that never change at runtime. `CREATE OR REPLACE VIEW` cannot reorder or drop columns, so an ordering mistake is a failed deploy. Cannot be rehearsed without production-like access.

### Option B — Client-side `slug → English name` map
40 typed entries in one file; `categoryLabel()` resolves `en` from the map with `name_ru` as fallback.
- ➕ Zero production DB risk (R3); fully unit-testable today; slugs are already the stable key the whole catalog filters on; no deploy coupling and no interaction with the pending migration.
- ➖ Names then live in two places (ru/kk in the DB, en in the client). If a category is ever added by a future migration without updating the map, EN silently falls back to Russian — a soft failure, and one a test can catch.

### Option C — Move all three languages into a client map, ignore DB names for display
- ➕ Fully symmetric, one place for all names.
- ➖ Rewrites working code (`categoryLabel`, `productCategoryLabel`, `subcategoryLabel` and the RPC JSON consumers) for no present benefit; throws away the DB as the source for the two languages that already work.

### Option D — Option B now, `name_en` later if a server-side need appears
Same as B plus a written upgrade trigger.

## 3. Decision — Option B, with a guard test (Option D as the documented upgrade path)

**This reverses the plan's Phase 5a default**, which assumed a `name_en` migration. What changed: the audit established (i) search and filtering never touch category names — only slugs (`…product_reviews.sql:224-239`), (ii) the tables are seed-only config with no runtime writer, and (iii) a previous migration is still unapplied, so a second one compounds the pending production change. With no functional requirement pulling the names into the database, the migration is pure risk against R3.

**Upgrade trigger (when to switch to A):** the moment any server-generated text (email, push, receipt) needs a category name, or categories become editable at runtime. Neither is true today — no edge function reads these columns.

### Design
```ts
// src/lib/taxonomyEn.ts
export const CATEGORY_NAMES_EN: Record<string, string> = {
  courses: "Courses",
  "online-lessons": "Online lessons",
  subscriptions: "Subscriptions",
  materials: "Materials",
  events: "Events",
};
export const SUBCATEGORY_NAMES_EN: Record<string, string> = {
  "video-courses": "Video courses",
  "mini-courses": "Mini courses",
  professions: "Professions",
  "education-programs": "Education programs",
  practicums: "Practicums",
  // …one entry per seeded subcategory slug
};
```
`catalog.ts` label helpers widen from `"ru" | "kk"` to `Language` and resolve:
```
en → CATEGORY_NAMES_EN[slug] ?? name_ru      // never name_kk
kk → name_kk
ru → name_ru
```
Falling back to **Russian** rather than Kazakh matches the C1 rule: an unfinished English string shows the language the user base actually reads.

### Product topics — deliberately NOT translated (R4)
`products.topic` stores the **chosen label itself** as free text (`CreatorProductsTab.tsx:442,2750`; `normalizeTopic.ts` strips emoji and lowercases it for the `topics` unique index). If the preset list in `taxonomyData.ts` were translated, an English seller would store `"Mathematics"` while a Russian seller stores `"🔢 Математика"` — two rows in `topics`, two filter values, and `aiCategory.ts`'s Russian keyword matching broken for half the catalog. Preset topics are **data values, not UI labels**, so they stay Russian, alongside the already-agreed exclusion of user-authored content. Worth telling the user plainly: topic chips will read Russian even in the English UI, and fixing that properly means a topic *id* with per-language labels — a separate task, not a translation pass.

## 4. Implementation guidelines
1. Add `src/lib/taxonomyEn.ts` with both maps, keyed by slug, derived from the seed rows in `20260825100000_category_taxonomy.sql:42-97`.
2. Widen `categoryLabel`, `productCategoryLabel`, `subcategoryLabel` (`catalog.ts:123-139`) from `"ru" | "kk"` to `Language`; add the `en` branch above.
3. Leave `get_catalog_taxonomy`, `search_catalog`, `public_products` and every other DB object **untouched**.
4. Leave `taxonomyData.ts` preset topics untouched; document the exclusion in `tasks.md`.
5. Keep the `profiles.language` column (Phase 5b) — it is a single additive `ALTER TABLE … ADD COLUMN`, a far smaller risk surface than recreating seven objects, and it fixes an existing gap where Kazakh users already receive Russian notifications.

### Tests
- Every category/subcategory slug seeded in `20260825100000_category_taxonomy.sql` has an entry in the EN maps — this is the guard against the "new category added by migration, map forgotten" drift, and it reads the migration file directly (the existing `translations.test.ts` already reads repo files this way).
- `categoryLabel(cat, "en")` returns the English name; an unknown slug falls back to `name_ru`, never `name_kk`.
- No EN map value contains Cyrillic (same invariant as C1).
- `taxonomyData.ts` still contains its Russian preset topics (a regression test for the deliberate exclusion, so a later well-meaning pass does not "finish" the translation and fragment the data).

## 5. Verification against requirements
| Req | Met? | How |
|---|---|---|
| R1 EN category names | ✅ | Slug-keyed map + `en` branch in the three label helpers |
| R2 filtering/search intact | ✅ | No DB object changes; filtering already keys on slug, search never reads names |
| R3 production safety | ✅ | Zero new migrations for taxonomy; the only DB change in the task stays a single additive column |
| R4 no divergent data | ✅ | Preset topics stay Russian, so `topics` rows and `aiCategory` matching stay single-valued |

🎨🎨🎨 EXITING CREATIVE PHASE — decision: **client-side slug→EN map, no taxonomy migration** (reverses the plan's Phase 5a); preset topics explicitly excluded.
