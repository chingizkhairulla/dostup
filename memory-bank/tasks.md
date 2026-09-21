# Tasks

## NEW TASK (VAN'd 2026-09-21) — Dark theme ("Подсветка") + English language + settings renames + white-on-orange
Source: the user's `/van` message (verbatim requirements below). The task below this block ("Previous task") is still open (Phase 8 acceptance + Phase 10 cleanup, plus deploy handoff) and is NOT superseded.

### Requirements (verbatim intent, in the user's order)
1. **Dark theme**, selectable by *any* user (buyer or seller) in Settings, in a **separate section named "Подсветка"** with a **sun / moon icon**. Main colour **black**, text **white**.
2. **Prototype first, mandatory.** Build a trial section / sample and **show the user before anything else**. Only after the user approves the look do we (a) write the theme rules and (b) roll it out to the whole platform. → Rollout is GATED on user sign-off.
3. **Rename settings sections**: "Приложение" (`appSettings`, the download/install section) → **"Скачать приложение"**; "Настройки уведомлений" (`notificationSettings`) → **"Уведомления"**. (KK/EN equivalents needed.)
4. **English language**: add EN to Settings → language section **after Kazakh**; the **entire platform** must be translatable to English (not just the settings screen), alongside RU and KK.
5. **Logged-out header toggle** (`PublicLocaleToggle`, currently `RU / KK` top-right): add **`EN`** that switches to English.
6. **White text on orange**: everywhere a button (and other elements) has an orange background, text must be white, black looks bad on orange. Applies in **every theme**. (The user's sentence is garbled — "когда пользователи начнут оставаться"; interpreted as "once the rest is done / as a final sweep". Confirm if that's wrong.)

### Complexity: **Level 4**
Not a bug fix. Three cross-cutting concerns, each touching dozens of files, plus a gated design-review step.

### Audit findings (from VAN exploration)
**Theme**
- Tailwind is `darkMode: ["class"]`; `src/index.css` already defines a complete `.dark` token block — but its base is navy (`220 20% 8%`), NOT black, and **nothing ever toggles the `dark` class**. `next-themes ^0.3.0` is installed and `ui/sonner.tsx` calls `useTheme()`, yet there is **no `ThemeProvider`** mounted (so sonner always sees the default).
- Only ~10 files carry `dark:` variants. **131 hardcoded colour usages across 31 files** (`bg-white`, `text-[#1F2328]`, `text-[#6B7280]`, `bg-[#F6F7F8]`, `border-[#…]`, `text-gray-*`…) will NOT respond to the token swap — e.g. `CategoryMenu`, `CatalogFilterRow`, `LoginModal`, `AddSellerProfileDialog`, `PublicLocaleToggle`. These are what make a naive "just add the class" dark mode look broken. Full rollout = convert them to semantic tokens.
- Brand orange is used both as tokens (`bg-primary`, `bg-accent`, `--primary-foreground: 0 0% 100%` → already white) and as raw `#FF6B00` in ~10 places (`AuthEntryScreen`, `PasswordLoginScreen`, `InstallBanner`, nav rail markers…). Two spots use `bg-accent text-white` explicitly. `GoogleSignInButton` is intentionally white (brand rules) — must stay exempt.
- Prior edits already made `Button` variants use `text-primary-foreground` (white). The white-on-orange sweep is therefore mostly about *non-Button* orange surfaces and raw-hex classes — needs a grep-driven audit, not a rewrite.
- Settings shell: `src/components/account/AccountSettingsView.tsx` builds its section list in one `useMemo` (`profile`, `language`, `notifications`, `app`) with icons from lucide → adding a `theme` section (Sun/Moon) is a small, well-localised change. `ModeratorSettingsDialog.tsx` has a parallel list and also uses `notificationSettings`.

**i18n (the big one)**
- `Language = "ru" | "kk"` (`src/lib/translations.ts:1`); `translations` has two ~600-line objects; `t()` in `LanguageContext` falls back `translations[lang][key] → translations.ru[key] → key`. `TranslationKey = keyof translations.ru`. Adding `en` to the type is cheap and typed — **but**:
- **~800 inline binary ternaries** `language === "ru" ? <RU> : <KK>` across **42 files** (heaviest: `CreatorScheduleTab` 151, `TeacherScheduleTab` 149, `CreatorMaterialsTab` 94, `TeacherMaterialsManager` 60, notification hooks…). With a third language every one of these silently renders **Kazakh for English users**. They must be migrated to a 3-way helper or moved into `translations`.
- **77 files contain Cyrillic literals** outside `translations.ts` (biggest: `aiCategory.ts` 277, `CreatorProductsTab` 194, `ModeratorDashboard` 163, `taxonomyData.ts` 116, `SlotCreationWizard` 72, `normalizeTopic.ts` 21…). Some are RU-only strings never translated to KK either.
- Hard-typed `"ru" | "kk"` in ~12 places (`catalog.ts` label helpers, `SlotCreationWizard`, both schedule tabs, `ErrorBoundary`) — will fail typecheck or mis-narrow once `Language` widens.
- **Data-driven content**: categories carry `name_ru` / `name_kk` (`catalog.ts categoryLabel`) — no `name_en` column exists → needs a DB migration (or an EN fallback strategy). Billing-period and event-date formatters take `"ru"|"kk"`; 18 `toLocaleDateString / Intl` call sites hard-code locales.
- **Server-side text**: edge functions (push / notify-* / emails) compose user-facing strings; EN users would get RU/KK notifications unless language is passed/stored. Scope decision needed.
- `PublicLocaleToggle` and `LanguageSwitcher` are hand-written two-button components; `ErrorBoundary` reads `localStorage.language` directly and casts.
- `localStorage.language` is trusted without validation — an unknown/legacy value must not crash `translations[language]`.

**Settings renames** — trivial: two translation keys × RU/KK/EN. `notificationSettings` is shared with `ModeratorSettingsDialog`, so that dialog's label changes too (acceptable; noted). Check `translations.test.ts` for assertions on the old strings.

### Decisions the user must make (surface in `/plan`, do NOT guess)
1. **Prototype form** for the dark theme — recommended: a temporary preview inside the new "Подсветка" section (toggle applies `dark` live) + screenshots of 3–4 representative screens (catalog, product page, settings, seller dashboard) via headless Chrome/tunnel, WITHOUT committing to platform-wide token conversion yet.
2. **"Black" = pure `#000`/near-black `0 0% 4%` (OLED style) vs. the existing navy-black**. User said "черный" → default to near-black neutral greys, no blue tint. Confirm at prototype review.
3. **Theme options**: Light / Dark only (user asked sun/moon) vs. also "System". Recommended: Light / Dark, default Light, persisted in `localStorage` (+ optionally on profile for cross-device).
4. **English scope**: (a) UI strings only, (b) + category names (needs migration), (c) + server push/email text. Recommended phasing: (a) first, (b)/(c) as follow-ups — confirm.
5. **Untranslated RU-only strings**: do we machine-translate to EN + KK now, or ship EN with RU fallback for the long tail (schedule/materials/moderator screens) first?

### Delivery order (proposed — refine in `/plan`)
- **Stage A – quick wins (Level 1-sized, can land first):** rename the two settings labels; white-on-orange audit for raw-hex orange surfaces.
- **Stage B – Theme prototype (GATE):** mount `ThemeProvider`, add "Подсветка" section (Sun/Moon), tune `.dark` tokens to black, prototype a few screens, **show the user, stop and wait for approval.** Nothing platform-wide before this.
- **Stage C – Theme rollout (after approval):** codify theme rules (token table + "no raw hex colours" rule), convert the 31 files of hardcoded colours, dark-mode pass on every screen.
- **Stage D – English:** widen `Language`, `pick(lang, {ru,kk,en})` helper + migrate the ternaries file-by-file (start with the most visible: catalog, product, auth, checkout, settings; schedule/materials/moderator last), EN in Settings language section (after KK) and in `PublicLocaleToggle` (RU / KK / EN), validate stored language.
- **Stage E – verification:** tests for each stage per project rule (see below), build + `tsc --noEmit`, headless-Chrome checks in light and dark, contrast check (WCAG) for white-on-orange and dark surfaces.

### Constraints carried from project rules / memory
- **Tests are required** for every stage (vitest + jsdom + testing-library are already set up; ~310 tests exist). E.g. theme persistence + `dark` class toggling, settings section renders Sun/Moon and switches, `t()` fallback + completeness (every RU key has KK and EN), `pick()` helper, `PublicLocaleToggle` three-way, renamed labels, no-Cyrillic-fallback-for-EN guard. jsdom cannot judge visual result → visual checks need real headless Chrome, and phone-width checks (a prior layout bug shipped exactly because only jsdom was used).
- No deploy / push / commit unless asked. Migrations (e.g. `name_en`) are written but applied only by the user.
- Design: keep "white text on solid orange", pale-orange hovers on secondary buttons, no bottom Cancel/Save in new windows (from the earlier customer requirements).

### Status
VAN complete → **routing to `/plan`** (Level 4; `/creative` will be needed for: dark palette + prototype review flow, and the i18n migration strategy).

---

## Previous task (still open) — Product Preview / Storefront
Source spec: `.claude/dostup_claude_code_prompt.md` — **always the reference for every stage of this task** (audit → plan → creative → build → reflect → archive).

Scope: fix Product Preview isolation, add Phone/Desktop preview, move Preview into the Product Editor as a live pane, remove Preview from the product management card, enforce private-by-default on new products, build out the Seller Storefront (ratings/sales/joined-year/description), add seller description to settings, keep it all N+1-safe, and (as a separate, confirmation-gated step) prepare fake-product cleanup. No deploy, no git push/commit, no destructive DB actions without explicit sign-off.

## Complexity
**Level 4** (complex, multi-area: frontend architecture change + new DB/RPC surface + cross-cutting UX behavior + security-sensitive public data exposure + perf constraint). Routing to `/plan`.

## Audit Findings (answers to the 13 audit questions from the spec, §14)

1. **Current Preview impl**: `src/components/creator/CreatorProductsTab.tsx` — button at ~L3143-3151 (Eye icon, opens `previewProduct` state), Dialog at ~L3224-3257. It renders an `<iframe src="/p/:slug">` (or `/p/:id`) at a fixed `min(390px, 100%)` width inside a `Dialog`. No desktop mode, no isolation — it's literally the live production route in an iframe.
2. **Product Page components used inside Preview**: none directly — the iframe loads the *entire* live `ProductPage` route (`src/pages/ProductPage.tsx`, 889 lines), not a purpose-built preview component.
3. **Why global nav is reachable in Preview**: because the iframe points at the real `/p/:slug` URL, and `ProductPage.tsx` always renders `<MarketplaceHeader />` (L368/380/544) plus its own "← Назад" link to `/` (L546-552). `MarketplaceHeader` (`src/components/marketplace/MarketplaceHeader.tsx`) renders `HeaderChatsButton` (Messages), `HeaderNotificationsButton`, `HeaderAccountControl` for signed-in users — all fully functional inside the iframe, so the seller can navigate the whole app without leaving "Preview".
4. **Product Editor location**: same file, `ProductForm` component (`CreatorProductsTab.tsx` ~L237-2440), opened in a `Dialog` (`max-w-lg`, single column, no split layout) for both create (`handleCreate`) and edit (`handleEdit`/`handleUpdate`). Already has 3 collapsible sections via a `SectionHeader` helper: **Детали** (L1183), **Классификация** (L1578, = category), **Оплата** (L1974) — matches the spec's Details/Category/Payment grouping exactly.
5. **Product Card location**: two distinct cards, do not conflate them:
   - Creator's own management card — inline JSX in `CreatorProductsTab.tsx` (~L3078-3200). Buttons today: Share, **Предпросмотр** (Eye), Edit, Pause/Resume (`is_paused`), Delete.
   - Public marketplace card — `src/components/marketplace/ProductCard.tsx` (buyer-facing, used in `CatalogGrid`/Marketplace/Storefront). Has a seller avatar+name row (L190-198) that is **not yet clickable**.
6. **How publication currently works**: `products.is_active boolean NOT NULL DEFAULT true` (base schema, `20260112075323_...sql:40`). Both the edge function `manage-products` (`create` action: `is_active: product.is_active ?? true`) **and** the frontend `handleCreate` (`CreatorProductsTab.tsx:2642`, explicitly sends `is_active: true`) force every new product public immediately. There is **no UI toggle for `is_active` anywhere** — only the unrelated `is_paused` ("Приостановить", temporary link disable) is exposed. Private-by-default is **not implemented**, this is a real gap, not something to just verify.
7. **Seller/creator profile storage**: unified `public.profiles` (rebuilt in `20260818162000_profiles_multi_identity.sql`, extended in `20260822154500_marketplace_catalog.sql`): `id, auth_user_id, type ('buyer'|'creator'|'school'), display_name, handle, avatar_url, bio, created_at`. Sellers additionally have a row in `creator_accounts` (`account_type: 'course_creator'|'online_school'`) linked via `profile_id`.
8. **Do description/avatar/created_at already exist**: yes, all three columns exist on `profiles` (`bio`, `avatar_url`, `created_at`). But: (a) **no settings UI writes `bio` anywhere** — it's only ever read (`StorefrontPage.tsx`, `catalog.ts` types) — needs to be built from scratch; (b) the existing "member since" display in creator settings (`CreatorAccountTab.tsx` L19-28) is **fake** — it reads/writes a client-only `localStorage['creator_created_at']` timestamp instead of the real `profiles.created_at`. Fix this as part of the work so Settings and the new Storefront show the same real date.
9. **Reviews location**: `public.product_reviews` + `product_reviews_public` view (`20260914120000_product_reviews.sql`). Per-product `avg_rating`/`review_count` are already folded into the `public_products` view → `search_catalog` → `get_seller_storefront`'s per-product JSON. There is **no seller-level aggregate** yet (average across all of a seller's individual reviews, not average-of-averages) — the storefront RPC needs to compute this.
10. **How a "successful purchase" is determined**: `public.purchases.status`, default `'completed'` (base schema L85). Canonical helper already lives in `supabase/functions/_shared/purchase.ts` and is reused by `unlock-materials`, `checkout`, `manage-schedules`, etc. — reuse this definition for the seller's sales count rather than inventing a second one.
11. **Creator ↔ products**: `products.creator_account_id → creator_accounts.id`, `creator_accounts.profile_id → profiles.id`.
12. **Online School ↔ products**: **identical mechanism** — `creator_accounts.account_type = 'online_school'` uses the same `creator_account_id` FK on products as individual creators. `profiles.type` is just derived from `account_type`. No separate school-product table exists and none should be added — storefront/settings code should be one path for both, not two.
13. **What needs to change**:
    - Frontend: `CreatorProductsTab.tsx` (Preview dialog, `ProductForm`, card buttons, create/update payload), `StorefrontPage.tsx` + `useSellerStorefront.ts` (rating/reviews/sales/joined-year), `ProductPage.tsx` (preview-isolation support), `ProductCard.tsx` (clickable seller row), creator + school account settings (bio textarea, real `created_at`). Likely need a new shared preview-chrome/phone-desktop-toggle component, and to reuse `ProductPage` itself for preview rather than forking it, so the live editor preview and the real `/p/:slug` route don't diverge into two maintained versions (explicit requirement, §2.2/§3).
    - Backend: `get_seller_storefront` RPC (add seller-level `avg_rating`, `review_count`, `sales_count`, `joined_year` — stay at one query), `manage-profile` edge function (new `set_bio` action, mirrors existing `set_display_name`), `manage-products`/frontend defaults (`is_active` → default `false` on create), new Supabase migration for the above.
    - Routing: `/s/:handle` (`StorefrontPage`) already exists and should be reused as-is — no new seller route needed.

### Architecture decision to flag before/in `/plan`
Preview isolation can be done two ways: (a) keep the iframe-of-live-route but suppress chrome via a query flag the route reads, or (b) extract `ProductPage`'s content into a reusable, chrome-less component driven by data (fetched product OR editor draft state), rendered directly (no iframe) inside both the Preview dialog/pane and the Editor's live-preview pane, with the real `/p/:slug` route wrapping that same component with `MarketplaceHeader`. Recommend (b): it satisfies "don't keep two maintained Product Page versions" (§2.2) and "live preview must reflect form state without saving to DB" (§3.1) more directly than iframes (which can't easily preview unsaved draft data without excessive `postMessage` plumbing). Surface this in `/plan`.

## Production data note
`supabase/config.toml` site_url = `https://trydostup.online` and `.env.example` points at a live project ref — **this is production**, not local/dev. Fake-product cleanup (spec §6/§16) must stay strictly read-only/report-only until the user explicitly says "Да, удаляй fake products." Do this step separately, after the main feature work, per the spec's own ordering.

## Audit corrections found during planning
- **AC #19 is already satisfied**: the seller name/avatar block on the product page is already a `Link` to `/s/:handle` (`src/pages/ProductPage.tsx:436-451`). Only the *marketplace* `ProductCard` seller row still needs to become clickable. Verify, don't rebuild.
- **Unpublishing is safe for existing buyers**: `unlock-materials` and `supabase/functions/_shared/purchase.ts` contain no `is_active` filter, and `manage-products`'s `list` action doesn't filter it either — so a private product still appears in the seller's dashboard and existing buyers keep material access. This de-risks the private-by-default change (AC #36).
- **`npm run build` does not typecheck** (`"build": "vite build"`, no `tsc -b`). There is no `typecheck` or `test` script. TypeScript errors must be caught with a separate `npx tsc --noEmit`.

---

# Implementation Plan (Level 4)

## Technology validation
No new dependencies. Everything needed is already in the stack: React 18 + Vite, Tailwind, shadcn/ui (`Dialog`, `Tabs`/`ToggleGroup`, `Card`, `Textarea`, `Avatar`), lucide icons, TanStack Query, Supabase JS. Changes are confined to existing patterns. DB changes go into one new timestamped migration file; edge-function and migration *deployment* stays with the user (spec: no deploy).

## Ordering and dependencies
Phase 1 → Phase 2 (the editor embeds the preview component built in Phase 1) → Phase 3 (card cleanup only makes sense once preview lives in the editor). Phase 4 pairs with Phase 3 (the freed button slot becomes visibility). Phases 5-7 are independent of 1-4 and of each other. Phase 8-9 are verification. Phase 10 is separate and gated on explicit user confirmation.

## Phase 0 — Baseline
Run `npm run build` and `npx tsc --noEmit` *before* touching anything, so any pre-existing failure isn't misattributed to this work.

## Phase 1 — Preview isolation + Phone/Desktop (spec §1, §2 | AC 1-9)
**Approach — REVISED in `/creative`** (see `memory-bank/creative/creative-preview-architecture.md`). The plan originally proposed dropping the iframe and rendering `ProductPage` inline. **That is wrong** and was reversed: `ProductPage.tsx:829` renders the mobile buy bar as `position: fixed` (it would escape a 390px inline container), and the page's `lg:` breakpoints resolve against the *browser* window, so an inline 390px "phone" preview on a desktop would render the **desktop** layout — violating §2.1's demand for the real responsive mobile version. Keep the iframe; the bug was never the iframe, it was pointing it at the fully-chromed public route.

- New route `/preview/product` (public, outside `RequireProfile`, deliberately not under `/p/` so it bypasses the `middleware.ts` matcher). Renders `ProductPage` in preview mode. Verified viable: no `X-Frame-Options`/CSP anywhere.
- `src/pages/ProductPage.tsx` gains `isPreview?` / `previewProduct?`: skip `MarketplaceHeader` (L368/380/544), the "← Назад" link (L546-552) and `PublicFooter` (L827); gate every query with `enabled: !isPreview`; skip `touchRecentProduct`; keep buy/trial/review/report controls visible but inert.
- Draft data reaches the iframe via `postMessage` (ready-handshake + debounced updates, origin-checked both ways). Blob URLs from unsaved media work because the iframe is same-origin.
- New `src/components/creator/ProductPreviewPane.tsx`: iframe + `[📱 Телефон] [🖥 Компьютер]` toggle. Phone = iframe at 390px; Desktop = iframe at 1280px CSS-`transform: scale()`d to fit. **Always defaults to phone**, no device sniffing.
- `CreatorProductsTab.tsx`: remove the old preview Dialog (L3224-3257) and its `previewLoading` state.
- Explicit "Закрыть предпросмотр" / X returning to the origin.

## Phase 2 — Live preview inside the editor (spec §3 | AC 10-14)
- Widen the create and edit `Dialog`s (currently `max-w-lg`, L3027 and the create dialog above it) into a desktop two-column layout: `ProductForm` left (its existing Детали / Классификация / Оплата sections untouched), sticky `ProductPreviewPane` right.
- New pure mapper `draftToPreviewProduct(formData, seller, categories)` → the product shape `ProductPage` expects (`title`, `headline`, `description`, `media`, `price`, `pricing_options`, `category_slug`, `author_name`, `seller_handle`, `seller_avatar_url`, …). No DB write for preview, ever.
- Light debounce (~200ms) on the draft→preview mapping so typing doesn't thrash re-renders.
- Mobile: no side-by-side. Preview becomes a toggle/sheet (exact pattern → `/creative`).
- Preview defaults to phone here too.

## Phase 3 — Remove Preview from the product card (spec §4 | AC 15)
- Remove the Eye/"Предпросмотр" button (`CreatorProductsTab.tsx:3143-3151`).
- That slot becomes the visibility control (Phase 4). Keep Share/Edit/Delete. The existing Pause/Resume (`is_paused`) is a *different* concept from publish/unpublish (`is_active`) — UI copy must distinguish them so we don't ship two competing visibility systems (§4).

## Phase 4 — Private by default (spec §5 | AC 16-17, 36)
- `CreatorProductsTab.tsx:2642`: `is_active: true` → `false`.
- `supabase/functions/manage-products/index.ts:77`: `product.is_active ?? true` → `?? false`.
- Migration: `ALTER TABLE public.products ALTER COLUMN is_active SET DEFAULT false;` (new products only — existing rows untouched).
- Add a "Видимость" toggle on the card calling the existing update path with `is_active`.
- Post-create hint: product is private, publish when ready.
- Regression watch: existing buyers must keep access (verified safe above) and private products must stay visible in the seller's own dashboard.

## Phase 5 — Seller Storefront metrics (spec §7-§9, §11, §12 | AC 18, 21-30, 38)
- New migration redefining `get_seller_storefront` to additionally return `created_at` (year derived in UI, not stored separately — §9.3), `avg_rating`, `review_count`, `sales_count`. All of it in **one** query via LATERAL subqueries over the seller's products — no N+1 (§12).
- Rating = `avg(rating)` over **all individual `product_reviews` rows** of the seller's products, never average-of-averages (§9.6).
- Sales = `count(*)` over `purchases` where `status = 'completed'` — the canonical definition already used by `_shared/purchase.ts` (§9.5).
- Stays `SECURITY DEFINER` and returns only public columns — no email/phone/auth id (§11, AC 30).
- Update `SellerStorefront` type in `src/lib/catalog.ts`, `useSellerStorefront.ts`, and `StorefrontPage.tsx` UI (joined year, `★ 4.8 · 243 отзыва`, "Нет отзывов" instead of `0.0`, sales count).
- Product listing already filters through `public_products`, so private products are excluded for free (AC 29) — verify, don't re-implement.
- **Open decision for `/creative`:** do metrics aggregate over *all* the seller's products or only currently-public ones? Recommendation: aggregate reviews/sales over all products (real history), list only public ones.

## Phase 6 — Seller description in settings (spec §10 | AC 31-33)
- `manage-profile`: new `set_bio` action mirroring the existing `set_display_name` (L175-211) — trim, validate, 500-char cap.
- Migration: `CHECK (char_length(bio) <= 500)` on `profiles.bio`.
- New `src/components/account/BioSettingsCard.tsx` modeled on `HandleSettingsCard.tsx`: `Textarea`, live `0 / 500` counter, helper text "Это описание будет видно покупателям на вашей публичной странице."
- Wire into `AccountSettingsView` for seller roles. Because `CreatorAccountTab` **and** `SchoolDashboard` both already render `AccountSettingsView`, one implementation covers creator *and* online school with no duplication (AC 33).
- Replace the fake `localStorage['creator_created_at']` date in `CreatorAccountTab.tsx:19-28` with the real profile `created_at`.

## Phase 7 — Seller link on marketplace cards (spec §8 | AC 19-20)
- `ProductPage` seller block: already a link — verify only.
- `ProductCard.tsx`: make **only** the seller row navigate to `/s/:handle`, not the whole card (§8.2). **Constraint:** the entire card is already wrapped in an outer `<Link>` (L56-58), and nesting an `<a>` inside an `<a>` is invalid HTML and breaks routing. Needs a restructure (overlay-link pattern, or `onClick` + `stopPropagation` + `navigate`) → `/creative`.

## Phase 8 — Responsive + acceptance pass (spec Этап 10, §15)
Walk all 39 acceptance criteria on desktop and mobile widths. Preview isolation is the highest-risk area (AC 1-5) — verify Notifications/Messages/Account/back are genuinely unreachable.

## Phase 9 — Build & typecheck (spec Этап 11 | AC 34)
`npm run build`, `npx tsc --noEmit`, `npm run lint`. Fix only errors caused by these changes. (No `typecheck`/`test` scripts exist.)

## Phase 10 — Fake product cleanup (spec §6, §16 | AC 39) — SEPARATE, GATED
Production DB (`trydostup.online`). Report-only: counts of products and every FK-related table (purchases, payments, materials, schedules, bookings, reviews, product_teachers, media/storage). Produce safe SQL, then **stop** and wait for the literal confirmation "Да, удаляй fake products." No automatic DELETE.

## Creative phase — COMPLETE
All five flagged decisions are settled. Full rationale in `memory-bank/creative/`.

| # | Decision | Outcome | Doc |
| --- | --- | --- | --- |
| 1 | Preview isolation | **Keep the iframe**, point it at a new chrome-less `/preview/product` route, feed drafts via `postMessage`. Reverses the plan's inline-rendering proposal — inline breaks responsive fidelity (`fixed` buy bar + viewport-scoped `lg:` breakpoints). | `creative-preview-architecture.md` |
| 2 | Editor layout | Widen the existing Dialog to near-full-screen two-column (`w-[96vw] max-w-[1600px] h-[92vh]`); mobile gets a **[Редактор] [Предпросмотр]** segmented toggle. Keeps existing dialog lifecycle wiring. | `creative-editor-layout.md` |
| 3 | ProductCard seller link | **Overlay-link pattern**: card root becomes a `div`, title link stretches via `after:absolute after:inset-0`, seller link sits at `relative z-10`. Valid HTML, two tab stops, and it removes the existing `preventDefault` hacks on the carousel controls. | `creative-productcard-seller-link.md` |
| 4 | Visibility vs Pause | **One "Видимость" dropdown with three states** (Приватный / Опубликован / Приостановлен) over the existing two flags. Verified the flags are genuinely distinct: private kills the link, paused keeps it alive with the author's message. No new column. | `creative-visibility-control.md` |
| 5 | Metrics scope | **Aggregate over all the seller's products** (matches §9.6's "по ВСЕМ продуктам" and closes a rating-gaming hole), while listing only public products. | `creative-storefront-metrics.md` |

## Risks
| Risk | Mitigation |
| --- | --- |
| `ProductPage` is 889 lines with interleaved auth/purchase/trial logic; preview mode could break the live page | Additive optional props, default behavior unchanged; gate queries via `enabled`; verify the real `/p/:slug` route after every change |
| `CreatorProductsTab.tsx` is a 3329-line monolith holding form + card + dialogs | Touch only the identified line ranges; no opportunistic refactor |
| Private-by-default could hide existing products or break buyer access | Change default for *new* rows only; verified no `is_active` gate in materials/purchase paths |
| Storefront RPC change could regress the marketplace | `public_products`/`search_catalog` stay untouched; only `get_seller_storefront` is redefined |
| Migration + edge function need deployment | I only write files; user deploys. Call this out at handoff |

---

# Build Log

## Testing

**Superseded correction.** An earlier version of this log recorded that the `/build` TDD gate could not be honored because the repo had no test infrastructure, and substituted a typecheck/build/lint gate. The user rejected that decision and asked for the infrastructure to be built and the tests to be run. It has been, and they were.

That earlier audit was also **wrong on the facts**: the repo did contain three test files — `src/lib/authErrors.test.ts`, `src/lib/profileOrder.test.ts`, `src/lib/translations.test.ts` — written against `node:test`. They were missed because the audit checked `package.json` for test dependencies but never globbed for `*.test.ts`. Since there was no `test` script, nothing ever ran them; they were dead weight in the repo.

**Infrastructure added:** vitest 2 + jsdom + @testing-library/react + jest-dom + user-event. Config in `vitest.config.ts` (kept separate from `vite.config.ts` so tests don't pull in the PWA plugin), setup in `src/test/setup.ts` (jest-dom matchers, cleanup, `matchMedia` and `ResizeObserver` stubs). Scripts added: `test`, `test:watch`, and `typecheck`.

The three legacy `node:test` files were converted to vitest so a single `npm test` runs everything, with their assertions preserved one-for-one. One needed a real fix: they used `new URL(..., import.meta.url)` with `readFileSync`, which throws under jsdom because `import.meta.url` is an http url there — now resolved from the repo root.

**Suite: 110 tests across 12 files, all passing.**
| File | Covers |
| --- | --- |
| `lib/productDraftPreview.test.ts` (24) | draft → preview mapping: trial presets, recurring intervals → access days/billing period, blob-url media, faq filtering, free products, editing an existing product |
| `lib/catalog.test.ts` (25) | Russian plural agreement for review and sales counts, including the teens exception |
| `lib/productPreview.test.ts` (5) | postMessage contract, origin rejection, preview route kept outside `/p/` |
| `components/creator/ProductVisibilityMenu.test.ts` (5) | the two flags → three visibility states, including private winning over paused |
| `components/marketplace/ProductCard.test.tsx` (7) | AC 20: seller links to the storefront, **no anchor nested in an anchor**, card root is not a link, handle encoding, fallbacks |
| `pages/ProductPage.preview.test.tsx` (9) | **AC 1-5**: zero links, no header, no footer, no back control, seller not linked, no network calls — plus a contrast case proving the same component still renders all of that chrome in normal mode |
| `pages/ProductPreviewRoute.test.tsx` (5) | ready handshake, draft rendering on message, cross-origin rejection, internal link clicks swallowed, external links left alone |
| `pages/StorefrontPage.test.tsx` (9) | AC 23/25/26/27: joined year from `created_at`, rating with pluralised review count, sales count, "Нет отзывов" instead of `0.0`, empty states |
| `test/backendContracts.test.ts` (14) | the SQL and edge-function changes that cannot execute here: private-by-default in all three places, completed-purchase sales definition, average over individual reviews, public-view product listing, two lateral joins, no private columns exposed, `set_bio` with its 500-char cap |
| `lib/{authErrors,profileOrder,translations}.test.ts` (7) | pre-existing suites, revived |

**The tests were verified to actually catch regressions.** Removing the `!isPreview` guard on `MarketplaceHeader` fails exactly two preview-isolation tests; restoring it makes them pass. The backend-contract suite also caught a genuinely over-broad assertion of mine (it forbade `is_active: true` anywhere in the file, which would have banned the legitimate publish transition) — narrowed to the create call, with a separate test for publishing.

**Other gates:** `npm run build` passes; `npx tsc -p tsconfig.app.json --noEmit` diffs clean against the recorded baseline of 22 pre-existing errors; lint is clean on all new files. Note `npx tsc --noEmit` alone fails on this repo's project-references setup — use `-p tsconfig.app.json`, which is what the new `typecheck` script does.

### Second pass — remaining gaps closed
The gaps listed above were filled in a follow-up round, bringing the suite to **151 tests across 19 files**:

| File | Covers |
| --- | --- |
| `components/creator/ProductPreviewPane.test.tsx` (5) | AC 6-8: frame points at the isolated route not `/p/`, opens on the 390px phone viewport, switches to a real 1280px desktop viewport and back, switch hidden in phone-only mode |
| `components/creator/ProductEditorLayout.test.tsx` (8) | AC 10-14: desktop shows form and preview together with no tabs; mobile shows the form first behind tabs, keeps the form mounted while previewing so edits survive, offers no desktop viewport on a phone; preview steps aside for the cover cropper |
| `components/creator/ProductVisibilityMenu.interaction.test.tsx` (7) | AC 15-17: three states in one menu, each transition fires correctly, re-selecting the current state fires nothing, private explains itself |
| `components/account/BioSettingsCard.test.tsx` (7) | AC 31-32: public-visibility hint, load, 500-char cap enforced on paste, save via `set_bio`, button disabled until changed, failure surfaced |
| `components/account/AccountSettingsView.seller.test.tsx` (4) | AC 33: the description card is offered to creator **and** school, and to neither buyer nor teacher |
| `components/creator/CreatorAccountTab.test.tsx` (4) | the join date now comes from the profile record, writes no fabricated `localStorage` value, degrades gracefully |
| `hooks/useSellerStorefront.test.tsx` (6) | single RPC call, numeric coercion of Postgres string numerics, zero defaults instead of NaN, null for unknown handle, no query without a handle |

Radix required `hasPointerCapture`/`scrollIntoView` stubs in `src/test/setup.ts`, which jsdom does not implement.

**Still not covered by tests:** anything requiring a live database. The migration SQL has never been executed — it is guarded only by contract tests asserting on its text.

## Phase status
- [x] **Phase 0 — Baseline.** Build passed; 22 pre-existing type errors recorded (incl. 2 in `ProductPage.tsx`); no test infra.
- [x] **Phase 1 — Preview isolation + Phone/Desktop.** New `/preview/product` route (`ProductPreviewRoute.tsx`) rendering `ProductPage` with new `isPreview`/`previewProduct` props; chrome (header/back link/footer) suppressed; queries gated with `enabled: !isPreview`; buy/trial/review handlers inert; seller block rendered as non-link in preview (it was a live escape hatch to the storefront); capture-phase click interceptor as defence in depth. `ProductPreviewPane.tsx` provides the iframe + phone/desktop toggle, always defaulting to phone. Transport contract in `lib/productPreview.ts` (origin-checked both ways).
- [x] **Phase 2 — Live preview in the editor.** `ProductEditorLayout.tsx` (desktop two-pane, mobile [Редактор]/[Предпросмотр] tabs); both create and edit dialogs widened to `lg:h-[92vh] lg:w-[96vw] lg:max-w-[1600px]`; `lib/productDraftPreview.ts` maps unsaved form state to the product shape; 200ms debounce; no DB write.
- [x] **Phase 3 — Preview removed from the product card.** Old iframe dialog and its `previewLoading` state deleted; Eye/PauseCircle/PlayCircle imports cleaned up.
- [x] **Phase 4 — Private by default.** Frontend `is_active: false` on create; `manage-products` create default flipped to `?? false`; migration sets the column default; status badge on the card; post-create toast explains the product is private.
- [x] **Phase 5 — Seller storefront metrics.** Migration extends `get_seller_storefront` with `created_at`, `avg_rating`, `review_count`, `sales_count` via LATERAL subqueries (one query). `SellerStorefront` type, hook mapper and `StorefrontPage` UI updated, with Russian plural helpers and a "Нет отзывов" empty state.
- [x] **Phase 6 — Seller description + real joined date.** New `set_bio` action in `manage-profile` (500-char cap); `bio` added to `PROFILE_COLUMNS`/`ProfileRow`; `get_handle` now also returns `bio` and `createdAt`; new `BioSettingsCard.tsx` wired into `AccountSettingsView` behind `isSeller`, so creator **and** school share one implementation; the fake `localStorage['creator_created_at']` date in `CreatorAccountTab` replaced with the real profile `created_at`.
- [x] **Phase 7 — Seller link on marketplace cards.** `ProductCard` converted to the overlay-link pattern; the pre-existing `preventDefault` hacks on the carousel controls were left in place (they still work above the overlay). Product page seller link verified as already present.
- [x] **Phase 9 — Build & typecheck.** Build passes; typecheck diff clean; no new lint errors in changed files.
- [ ] **Phase 8 — Full responsive/acceptance pass.** Partially done (see below) — blocked on credentials for the authenticated surfaces.
- [ ] **Phase 10 — Fake product cleanup.** Not started; gated on explicit confirmation and requires DB access.

## Browser verification (dev server with dummy Supabase credentials)
The app cannot boot without `VITE_SUPABASE_*`, and no `.env` exists, so the server ran with dummy values. That allows verifying the preview route (which renders from postMessage, not the DB) but **not** any data-backed surface.

Verified on `/preview/product`, rendered inside a real 390px same-origin iframe with the live handshake:
- `handshakeReceived: true`, draft rendered (`h1` = "SAT Preparation") — live draft preview works with no DB write.
- `anchors: 0`, `header: 0`, `footer: 0` — **AC 1-5 hold structurally**: there is no link, header or back control to click at all.
- At iframe width 388px: mobile buy bar `display: block`, desktop aside hidden. At viewport 1631px the same bar is `display: none` and `position: fixed`.
- No console errors.

That last point is hard evidence for the creative-phase reversal: the buy bar really is `position: fixed` (would have escaped an inline 390px container) and really is gated on the **viewport** via `lg:`, so an inline preview would have shown the desktop layout inside a phone frame.

**Not verified in a browser** (needs real credentials + seller login): the two-pane editor, the visibility dropdown, the storefront metrics, and the marketplace card seller link. These typecheck and build, but have not been exercised at runtime.

## Deployment handoff (not performed, per spec)
- Migration `supabase/migrations/20260917120000_private_products_and_seller_metrics.sql` must be applied.
- Edge functions `manage-products`, `manage-profile` and the shared `_shared/profiles.ts` must be redeployed.
- Until both happen, private-by-default and the storefront metrics will not be live.

## Reflection — COMPLETE, updated twice
`memory-bank/reflection/reflection-preview-editor-storefront.md`. Headline points:
- The audit prevented rebuilding three things that already existed (storefront route, product-page seller link, `bio` column).
- The creative phase reversed a wrong architecture (inline rendering) before implementation, and the build phase confirmed the reversal with runtime measurements.
- Two bugs were found that the spec never mentioned: the seller-link escape hatch out of Preview, and a fabricated `localStorage` "member since" date.
- Test infrastructure was initially skipped (wrong call, reversed at the user's request) — vitest + jsdom + testing-library now give **310 passing tests**.
- **On-device follow-up**: demoed through a Cloudflare tunnel, the user found the phone preview inside the editor rendered as a short scrollable strip on a real phone. Root cause: the dialog had no definite height below the `lg` breakpoint, and the preview frame only ever scaled by width. Fixed with a `fitScale` helper that fits both axes plus an explicit `h-[85vh]` on the dialogs below `lg`. Needs re-verification on an actual phone — jsdom cannot catch this class of layout bug, which is exactly why it shipped in the first place.
- Largest open risk now: the migration and edge-function redeploys are still pending, and the phone-preview fix is unverified on a real device.

## Next Step
1. User re-checks the phone preview fix through the tunnel.
2. `/archive`, once the migration is applied, the edge functions are redeployed, and Phase 8's acceptance pass has been run against the authenticated flows on a real device.
