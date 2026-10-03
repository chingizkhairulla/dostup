# Tasks

## Active task — Customer feedback round 3: product editor, product page, storefront
VAN'd 2026-09-29. Source: the customer's feedback on the round 2 editor window, relayed by the user in `/van` (Russian, verbatim in the conversation). Builds on the archived task `archive/archive-preview-editor-storefront.md` — read its OUTSTANDING and CLOSING NOTE first, and `creative/creative-editor-window-round2.md` before touching the editor window.

The customer says "фото прикрепил" twice (a filled-in preview reference; the product page's back button). **No photos reached the conversation** — ask the user for them in `/plan`.

### Requirements (numbered for the plan)
**A. Editor window (`CreatorProductsTab.tsx`, `ProductEditorLayout.tsx`, `ProductPreviewPane.tsx`)**
1. "Предпросмотр" and the window title larger, and the **same size** as each other. Now: title `text-base` (`CreatorProductsTab.tsx:2863`), preview label `text-sm` (`ProductPreviewPane.tsx:98`).
2. Split **40% sections / 60% preview**. Now `3fr/7fr` (`ProductEditorLayout.tsx:55`).
3. The Телефон/Компьютер toggle must be centred **on the preview pane**. Now `mx-auto` between the label and the close cross, so it is off-centre by their width difference.
4. Desktop preview must scroll too. Verify in a real browser whether it scrolls today.
5. Rename: title "Создать продукт" → **"Создание продукта"**; the Save button → **"Создать"** (create mode). Edit mode is not mentioned, so it keeps "Редактировать продукт" / "Сохранить" unless told otherwise.
6. The "Детали" section starts **expanded** when creating a product. Now `useState(false)` at `CreatorProductsTab.tsx:232`.
7. **Placeholder preview.** While a new product is empty, the preview shows field labels instead of blanks ("Название продукта", description, price, …), so the seller sees the shape of the page. The cover area shows a **centred image icon**. Mapping lives in `lib/productDraftPreview.ts`.
8. **Cover-crop flow (bug + redesign).** Today picking a photo turns the whole editor into a compact crop window (`CROP_DIALOG_CLASS`, `isCroppingMedia`). Clicking outside it closes the entire editor, and the customer reports lost changes. Required:
   - The crop window opens **on top of** the editor. The editor stays open behind it.
   - Save, or a click outside the crop window, returns to the editor with the editor still open. The crop window has **no Cancel button and no top-right cross**.
   - The editor itself becomes **full-screen**, so there is nowhere outside it to click.
   - The editor's cross: the first click shows a **red hint under the cross**, "Вы точно хотите выйти? Изменения не сохранятся.", and a second click closes the window.
   - Note: `ProductForm` owns the cropper state and must not remount (round 1's vanished-cover bug). Keep the three-slot invariant in `ProductEditorLayout`.

**B. Product page (`src/pages/ProductPage.tsx`)**
9. The Report button ("Пожаловаться") moves to the **very bottom of the page, centred**. Now it sits next to Share under the title (`:675`).
10. Product title font **smaller**, but still **larger than the "Часто задаваемые вопросы" heading**. Scale is `PRODUCT_TITLE_CLASS` / `productTitleSize` in `lib/productTitle.ts`. It is the same component as the preview, so it applies to both.
11. Back button: **returns to wherever the user came from** (marketplace, a product, a storefront…). Now it is a hard `<Link to="/">` (`:568`, `:397`). It sits in the **left white gutter** on desktop and **stays in place while scrolling**, like the header.
12. The desktop purchase card on the right also **stays in place while scrolling**. It is already `sticky top-24` (`:849`), yet the customer says it doesn't stick. Find out why in a real browser (likely an ancestor with `overflow`).
13. In that card, remove the seller's `/s/{handle}` line (`:465-467`). Show the name only.
14. Remove "Первый платёж: …" (`:528-531`) and "Доступ продолжается, пока вы оплачиваете подписку." (`subscriptionAccessNote`, `:444`).

**C. Seller storefront (`src/pages/StorefrontPage.tsx`, `/s/:handle`)**
15. A back button that behaves exactly like the product page's (same component, same history-aware logic, same placement).
16. Show: "На платформе с 2026 года" (exists); the description (exists); sales, **always shown, "0 продаж" when none** (now hidden when 0); and the **overall rating** = average over all the seller's products' reviews, **always shown, even with no reviews** (now replaced by "Нет отзывов").
17. Seller settings: the description field exists (`BioSettingsCard.tsx`). Add a visible note at its top saying everything here is **visible to buyers**. Check it is reachable in both creator and school settings.

### Audit findings
- **Most of C is already built** (round 1, Phases 5–6) but **not deployed**: migration `20260917120000_private_products_and_seller_metrics.sql` is unapplied, and `manage-profile` / `manage-products` are not redeployed. If the customer looked at an environment without them, they saw no year, bio, sales or rating. Work out which environment the customer used. The code changes for C are small; deployment is the real blocker.
- The cover-crop bug (A8) is structural. The crop UI is a *mode* of the single editor dialog, and that dialog's `onOpenChange(false)` → `closeEditor()` fires on an outside click in crop mode.
- The back button and the sticky card (B11, B12) need real-browser verification. jsdom cannot judge sticky/scroll behaviour (see progress.md's tooling note).

### Complexity: **Level 3**
About 17 changes over three screens. Most are small UI edits. Two carry real design decisions: the crop-window/close-confirm interaction (A8), which conflicts with autosave, and the history-aware sticky back button in the gutter (B11, B15). No new data model; C mostly needs deploy plus two display rules.
→ `/plan`, then a short `/creative` for A8 and B11.

### User answers (2026-09-29, in `/plan`)
1. **Photos.** Three screenshots were attached but reached the session only as 128×80 thumbnails, so no detail is readable. What they show: (a) the editor with sections on the left, and a preview with a grey cover and a large "Название"-style placeholder title, plus an orange button bottom right; (b) the storefront: avatar and name top left, a products grid; (c) the product page: media on the left, title below, a card on the right with an orange buy button, and a back link at the top left. Build to the text. Ask for full-size images only if a detail can't be decided from the text.
2. **Autosave: removed in both modes** (updated in `/creative`: "пусть при редактировании тоже будет через кнопку сохранить а не авто, чтобы не путать пользователя"). Create → "Создать", edit → "Сохранить". Nothing is written before the button is pressed. This reverses round 1's "self-saving" and round 2's "Save coexists with autosave".
3. **Access line: remove entirely.** Drop "Первый платёж", "Доступ продолжается…" **and** "Доступ на N дней" / "Доступ навсегда" from the purchase card, for every product type.
4. **Rating with no reviews:** "Общая оценка" + empty stars + "нет отзывов". Accepted.
5. **Edit mode: the changes apply to both modes.** Title: create "Создание продукта", edit "Редактирование продукта" (same noun form). Button: create "Создать", edit "Сохранить". "Создать" makes no sense for an existing product. The red two-click exit hint appears in both modes (see creative A8).
7. **Back button position** (screenshot, `/creative`): top left, **where it is today** — the white strip under the header, aligned with the content's left edge. Not the side gutter.
6. **Deployment: authorised.** Apply the migration and deploy the functions. **Standing rule for this task:** ask first only when something is large *and* changes tables unrelated to the preview/storefront work. Anything additive, or scoped to this work, goes ahead.

### Constraints
- Tests for every phase (vitest + jsdom + testing-library, `npm test`, 338 tests baseline); regression tests written first for bugs (A8).
- Anything layout- or scroll-related (A2–A4, A8 full-screen, B9–B12, C15) verified in real headless Chrome at desktop and phone widths, not only jsdom.
- No commit / push / deploy unless the user asks. Migrations are applied only by the user.
- Keep: white text on solid orange, pale-orange hovers on secondary buttons, the Save button coexisting with autosave (round 2 decision; revisit only via question 2).

# Implementation Plan (Level 3)

## Technology validation
No new dependencies. Stack in place: React + Vite + Tailwind + Radix Dialog (shadcn), react-router, vitest/jsdom/testing-library, headless Chrome for layout checks. Radix supports nested dialogs: a second `Dialog` opened from inside the first stacks on top, and its outside-click is handled by its own `onPointerDownOutside`. That is the basis for A8.
Deploy tooling: **the Supabase CLI is not installed**. Use `npx supabase@latest` (project ref `mebomnqdtuqmjjefvgkx` in `supabase/config.toml`). It needs a login (the user runs `! npx supabase login`) and the DB password for `link`/`db push`.

## Audit additions made during planning
- **Why the purchase card doesn't stick (B12):** `sticky top-24` is on the card `div` *inside* `<aside>`. The grid uses `items-start`, so the `<aside>` is only as tall as the card, and a sticky element cannot move outside its parent. Fix: make the `<aside>` stretch (`self-stretch`) or put `sticky` on the `<aside>` itself. Confirm in headless Chrome before and after.
- The site header (`AppHeader`) is `sticky top-0`, 64px tall. The sticky back button and card offsets must clear it; `InstallBanner` can add height.
- Title scale: `.public-display` 32/40/56px (mobile/md/lg), `-long` 26px, `-xlong` smaller. The FAQ heading is `text-lg` (18px). B10: step the whole scale down (e.g. 28/32/40), with `xlong` staying above 18px.
- Migration `20260917120000_…` scope check (rule 6): `products.is_active` default (in scope), `profiles.bio` ≤500 CHECK (in scope), two **additive** indexes on `purchases(product_id)` / `products(creator_account_id)`, and a replaced `get_seller_storefront` RPC (in scope). **No unrelated table is modified**, so it goes ahead. Pre-check: the CHECK fails if any existing `bio` is over 500 chars.
- `_shared/profiles.ts` (adds `bio` to `PROFILE_COLUMNS`) is imported by 7 functions; only `manage-profile` and `manage-products` are redeployed. The other 5 keep their old bundle. That is harmless: the change is additive and the column already exists.
- `английский-язык` carries the same `supabase/` diff, so deploying from this branch doesn't overwrite anything from it. It does touch `translations.ts`, so new strings added here will conflict at merge. Keep new keys grouped.

## Components and dependencies
| # | Component | Files | Depends on |
|---|---|---|---|
| P0 | Baseline | — | — |
| P1 | Editor chrome: A1, A2, A3, A4, A5, A6 | `ProductEditorLayout.tsx`, `ProductPreviewPane.tsx`, `CreatorProductsTab.tsx`, `translations.ts` | P0 |
| P2 | Placeholder preview: A7 | `lib/productDraftPreview.ts`, `ProductPage.tsx` (preview-only placeholders + cover icon) | P0 |
| P3 | Crop window, full-screen editor, exit confirm, create without autosave: A8 | `CreatorProductsTab.tsx`, `CoverCropEditor.tsx`, `hooks/useAutoSave.ts` usage, new `EditorCloseButton` | **creative A8**, P1 (layout slots) |
| P4 | Product page: B9, B10, B12, B13, B14 | `ProductPage.tsx`, `lib/productTitle.ts`, `index.css`, `ReportProductDialog.tsx` (trigger placement) | P0 |
| P5 | History-aware sticky back button: B11, C15 | new `components/marketplace/BackButton.tsx`, `ProductPage.tsx`, `StorefrontPage.tsx`, possibly a small nav-tracking hook | **creative B11** |
| P6 | Storefront metrics + settings note: C16, C17 | `StorefrontPage.tsx`, `lib/catalog.ts` labels, `BioSettingsCard.tsx`, `translations.ts` | P7 for live data (code does not wait on it) |
| P7 | Deploy | migration + `manage-profile`, `manage-products` | P6 code ready; user login |
| P8 | Verification | tests, typecheck, build, headless Chrome desktop 1440 + phone 390 | all |

P1, P2, P4 and P6 are independent and can go in any order. P3 goes after P1, because it changes the same dialog. P5 goes after P4, because both edit the top of `ProductPage`.

## Phase details and success criteria (each needs passing tests before it is marked done)
**P0 — Baseline.** `npm test` (expect 338 passing), `npm run typecheck` (22 baseline errors), `npm run build`. Record the numbers.

**P1 — Editor chrome.**
- A1: title and "Предпросмотр" both `text-lg font-semibold`, from one shared class constant.
- A2: grid `minmax(0,2fr)_minmax(0,3fr)` (40/60).
- A3: preview top bar as a 3-column grid (`1fr auto 1fr`): label left, toggle in the centre, close right. The toggle is centred on the pane regardless of side widths.
- A4: check in the browser that the desktop viewport scrolls inside the iframe. Fix only if it doesn't.
- A5: titles and buttons per answer 5, via translation keys (RU + KK).
- A6: `detailsOpen` initialised to `true` when creating (edit keeps its current default).
- Tests: title and label share the class; the toggle is in the centre column; titles/buttons per mode; Details open on create.

**P2 — Placeholder preview.** When a draft field is empty, `productDraftPreview` fills the preview with placeholder text: "Название продукта", "Короткое описание", "Описание продукта", price "0 ₸", author = seller name. The page renders placeholders in muted colour so they don't look like real content. Empty cover shows a centred `ImageIcon` on a grey block. **Placeholders exist only in preview (`isPreview`)** and never reach the saved product or the public page. Tests: an empty draft renders every placeholder; a filled field replaces its placeholder; the saved payload never contains placeholder text.

**P3 — Crop / close flow (after creative A8).** The regression test comes first: "picking a cover, then clicking outside the crop window, leaves the editor open with the form data intact". It must fail on the current code. Then:
- The crop becomes a **nested Dialog** on top of the editor. Only a Save button: no Cancel, no cross. An outside click = cancel the crop and return to the editor.
- The editor is full-screen (`inset-0`, no margins) in both breakpoints, so there's no outside to click.
- The two-click exit on the cross, with the red hint under it.
- Create mode without autosave: no draft product is written until "Создать".
- Remove `CROP_DIALOG_CLASS` and the `previewHidden` crop mode if they become unused.
- The `ProductForm` no-remount invariant stays covered by the existing tests.

**P4 — Product page.**
- B9: Share stays under the title; Report moves to the page bottom, centred, above the footer. Hidden in preview, as it is today.
- B10: new title scale; test that every size class is larger than the FAQ heading, as a CSS-value assertion on the scale constants.
- B12: sticky fix.
- B13: drop the `/s/handle` line.
- B14: remove the first-charge line and every access line (answer 3). Delete the translation keys if they are unused elsewhere.
- Tests per item, plus headless-Chrome proof for B12: the card's `getBoundingClientRect().top` is constant after scrolling 1000px.

**P5 — Back button (after creative B11).** One `BackButton` used by the product page and the storefront. It returns to the previous in-app page if the user came from inside the app, otherwise to the marketplace `/`. Desktop: in the left gutter, sticky under the header. Phone: in the flow at the top, as today. Tests: `navigate(-1)` when there is in-app history; `/` on a direct visit; it renders on both pages; it is hidden in preview.

**P6 — Storefront.**
- C16: always show `sellerSalesLabel(n)`, including "0 продаж"; always show "Общая оценка" + stars (filled per `avg_rating`, empty at 0) + "нет отзывов" / the review count.
- C17: `BioSettingsCard` gets a note at the top, "Всё, что вы напишете здесь, увидят покупатели на вашей витрине". Check that it's mounted for both creator and school settings.
- Tests: 0 sales and 0 reviews render the labels; plural forms; the settings note is present.

**P7 — Deploy (authorised).**
1. `npx supabase@latest login` (user, interactive) → `link --project-ref mebomnqdtuqmjjefvgkx`.
2. `npx supabase migration list`. **If any migration other than `20260917120000` is pending on the remote → stop and ask** (it could touch unrelated tables).
3. Pre-check: `select count(*) from profiles where char_length(bio) > 500` must be 0.
4. `npx supabase db push` (only that migration pending).
5. `npx supabase functions deploy manage-profile` and `… manage-products`.
6. Smoke test: call `get_seller_storefront` for a real handle; it returns `created_at` / `avg_rating` / `sales_count`.
7. Record the result in `progress.md`.

**P8 — Verification.** Full `npm test`, typecheck diff against the baseline, build, lint on changed files. Headless-Chrome screenshots at 1440 and 390 of: the editor (create, empty → placeholders; crop window on top), the product page (scrolled: card and back button stay), the storefront (0 sales/0 reviews and filled). Temp harness files outside `public/`, removed afterwards.

## Creative phases required
- **A8 — Crop window and editor exit flow.**
  - How the nested crop dialog looks without Cancel/cross.
  - How the red hint is shown under the cross: where it sits, when it resets (timeout? any other click?), and what it looks like on a phone.
  - Keeping it truthful in edit mode with autosave: either flush pending changes and close without a hint when nothing is unsaved, or always show the hint as the customer asked.
  - What "Создать" does when required fields are missing.
- **B11 — Back button.**
  - Detecting "came from inside the app" (`location.key !== "default"` vs. an explicit tracked stack).
  - Gutter placement at widths where the gutter is narrow (1024–1280px).
  - Sticky offset under the header plus the install banner.
- (A7's placeholder list is small and is decided in P2 unless the customer's full-size photo is needed.)

## Risks
| Risk | Mitigation |
|---|---|
| The nested dialog remounts `ProductForm` and loses the picked photo (round 1 bug) | The crop state stays inside `ProductForm`, and the nested Dialog renders from inside it. The existing no-remount tests plus the new regression test. |
| Turning off create-mode autosave loses work on an accidental close | The two-click confirm on the cross is exactly the guard. The full-screen editor removes outside clicks. Esc must go through the same confirm. |
| `db push` pushes other pending migrations | Step 2 of P7 stops and asks. |
| The bio CHECK fails on existing data | Pre-check in P7 step 3. |
| Sticky/gutter layout only looks right in jsdom | Headless-Chrome geometry checks at 1440/1280/1024/390. |
| Merge conflicts with `английский-язык` in `translations.ts` | New keys grouped in one block and listed in the build log. |

## Creative decisions (2026-09-29) — `creative/creative-round3-editor-exit-and-back-button.md`
**A8 (overrides the P3 notes above where they differ):**
- The crop is a **nested Radix Dialog rendered inside `ProductForm`**. The form body is no longer swapped out, and the crop state stays where it is. `CROP_DIALOG_CLASS`, `isCroppingMedia`, `onCroppingChange` and the crop use of `previewHidden` are removed.
- The crop window has a title and one "Сохранить" button: no Cancel, no cross. An outside click or Esc = cancel the crop, and the editor and its data stay.
- **Autosave removed completely**: `useAutoSave`, `AutoSaveIndicator` and `createdProductRef` go away; delete the files only if unused elsewhere. The footer button ("Создать" / "Сохранить") validates → persists → closes. On error the window stays open.
- Dirty = `saveKey(form)` ≠ the baseline captured at open or after save, or a pending media file.
- New `EditorCloseButton` (in the `headerRight` slot, with the Radix close hidden). The **first click shows the red hint only if dirty**, and a clean window closes at once; switching to "always" is a one-line change — **flag to the user**. The hint disarms after 4 s, on a form change, or on a click elsewhere. Esc goes through the same logic. Outside interaction is blocked.
- The editor is full-screen at every breakpoint (`inset-0`, `100dvh`, no radius).

**B11/C15:**
- `BackButton`: `location.key !== "default"` → `navigate(-1)`, else `/`.
- Placed where it is today (answer 7), but kept in place while scrolling: `AppHeader` gets an optional `below` slot rendered inside its existing sticky wrapper, so the header and the back bar form one sticky stack with no measured offsets. `MarketplaceHeader` passes it through. The product page (both states) and the storefront use it, and the in-flow `<Link to="/">` links are removed.
- The purchase card's sticky `top` must clear header + bar. Measure it in Chrome and set it once.

# Build Log (2026-09-29)

## P0 — Baseline
`npx vitest run` → 27 files / **338 passed**. `npm run typecheck` → **18** pre-existing errors (saved sorted, without line numbers, to diff against). `npm run build` → green.

## Phase results
- [x] **P1 Editor chrome.** A shared `EDITOR_HEADING_CLASS` in `creator/editorHeading.ts` is used by the window title and the "Предпросмотр" label. It is **`text-xl`**, raised from the planned text-lg after a browser check: 18px barely differed from the old 16px, and the customer asked for "больше". Grid `2fr/3fr` (measured 576/864 at 1440). The preview bar is a `grid-cols-[1fr_auto_1fr]`, and the toggle centre was measured within 1px of the pane centre at 1440/1280/1024. Titles: `editorTitleCreate`/`editorTitleEdit`; button `create`/`save`. `detailsOpen` = `useState(!isEdit)`. **A4:** desktop preview scroll verified already working (scrollY 0→500 inside the frame), so no change was needed.
- [x] **P2 Placeholders.** `draftToPreviewProduct(…, placeholders)` fills empty title/headline/description and records `preview_placeholders`. This is a preview-only `Product` field; the saved payload comes from `productPayload`, never from this object. `ProductPage` renders them `text-muted-foreground` only when `isPreview`, and an empty preview cover shows a centred `ImageIcon`.
- [x] **P3 Crop/close/no autosave.** The regression tests were written first and **failed on the old code** for the right reason: the editor was gone after an outside click in crop mode. The crop is now a nested Radix `Dialog` inside `ProductForm` (`hideCloseButton`, Save only). `CoverCropEditor` lost `onCancel`/Отмена. Deleted: `useAutoSave.ts`, `AutoSaveIndicator.tsx`, their tests, `CROP_DIALOG_CLASS`, `isCroppingMedia`, `onCroppingChange`, `ProductEditorLayout.previewHidden` and the 4 `autosave*` keys.
  - New `EditorCloseButton` + `useConfirmClose`, with dirty = `saveKey` vs a baseline captured on open. `submitEditor` validates → persists → closes. On error the window stays open, and a failed media upload also keeps it open. Double submit is guarded by a ref.
  - Esc goes through the same two-step close; outside interaction is prevented. The editor is full-screen via `EDITOR_DIALOG_CLASS`.
  - The cross is **absolutely positioned in the dialog corner**, not in the preview bar's `headerRight`. Reason: on a phone the editor tab hides the preview pane, and the cross would vanish with it.
  - The test file was renamed `CreatorProductsTab.autosave.test.tsx` → `CreatorProductsTab.editor.test.tsx`: 25 tests (crop window ×5, window ×5, create ×5, edit ×2, close ×8).
  - jsdom note: while the crop dialog is open, Radix sets `aria-hidden` on the editor, which blanks its accessible name. The test therefore asserts on its content, not its name.
- [x] **P4 Product page.** Report sits under the grid, `flex justify-center`. Title scale moved to 28/32/40, 24/28/32, 20/24/26; `productTitle.test.ts` reads `index.css` and asserts every size is >18px (the FAQ heading). **Sticky root cause confirmed and fixed:** `lg:sticky` is now on the `<aside>` itself, with top `var(--public-sticky-offset)`. The `/s/handle` line is gone, and so are the first-charge line and every access line; keys `accessDays`, `accessLifetime`, `subscriptionAccessNote`, `subscriptionFirstCharge` were removed. This also removed 2 pre-existing TS errors (`access_duration_days` on `ProductPricingOption`), so typecheck went 18 → **16**.
- [x] **P5 Back button.** `marketplace/BackButton.tsx` (`location.key !== "default"` → `navigate(-1)`, else `/`). `AppHeader` gains an optional `below` slot inside its sticky wrapper, and publishes `--public-sticky-offset` (height + 24px) via `ResizeObserver`, removed on unmount. `MarketplaceHeader` passes `below` through. Used by `ProductPage` (both states) and `StorefrontPage` (incl. not-found); the in-flow `<Link to="/">` is gone.
- [x] **P6 Storefront + settings.** "Общая оценка" + 5 stars (filled = rounded average) + value/"нет отзывов" are always shown, and sales are always shown ("0 продаж"). `BioSettingsCard` has a prominent note at the top (`bg-primary/10`, Eye icon, `text-sm`): "Всё, что вы напишете здесь, увидят покупатели на вашей витрине." It was already mounted for creator and school, covered by `AccountSettingsView.seller.test.tsx`.
- [x] **P7 Deploy — handed to the user** (2026-09-29: "сам буду делать миграцию"). Apply `20260917120000_private_products_and_seller_metrics.sql`; deploy `manage-profile` and `manage-products` (`npx supabase functions deploy <name> --project-ref mebomnqdtuqmjjefvgkx`). Needs an Owner/Admin/Developer role in the org. If applied through the SQL Editor, the CLI migration history must later be marked with `supabase migration repair --status applied 20260917120000`. Not performed by Claude.
- [x] **P8 Verification.** Final `npx vitest run` → **27 files / 345 passed**. Typecheck: no new errors (16, down from 18). Build green. ESLint on changed files: 0 new errors; `CreatorProductsTab.tsx` went 17 → 16, `ProductPage.tsx` 8 → 8, plus one react-refresh warning in `EditorCloseButton.tsx`.
  - **Headless Chrome** via a temporary `harness.html` + `src/__harness__/main.tsx` (deleted afterwards and confirmed via `git status`). It rendered the real `ProductPage`/`StorefrontPage` with seeded react-query data, plus the real `ProductEditorLayout`/`EditorCloseButton`/`EDITOR_DIALOG_CLASS` around stand-in sections. Checked at 1440/1280/1024/390:
    - The back button and the purchase card keep the same `top` at scroll 0/400/1500 (78px and 137px = header 65 + back bar 48 + gap 24).
    - Report is centred; the title is 40px desktop / 28px phone vs FAQ 18px; no horizontal overflow anywhere.
    - The editor rect equals the viewport; the red hint sits below the cross and inside the viewport, even at 390; the crop window stacks as a second dialog.
  - Not verified in a browser: the real `ProductForm` inside the window (behind a seller login). It is covered by the jsdom tests above.

## P7 preflight (2026-10-03): DEPLOY BLOCKED, do not apply or deploy from this branch
The user added a Supabase personal access token (`SUPABASE_PRIVATE_TOKEN` in the gitignored `.env`, prefix `sbp_`). Read-only checks through the Management API, run before any write, found that **production has moved past this branch**:
1. **Migration version collision.** Production already records `20260917120000` as `product_marketplace_visibility`, from `origin/main`. Our file uses the same version, so the CLI would treat it as applied and skip it.
2. **Production replaced the "private by default" model.** `origin/main` added `products.is_published` (default false). In that model `is_active` means "the product exists", and production `is_active` still defaults to true. Our migration (`is_active` default false) and our `manage-products` (`is_active ?? false`) would **disable new products** under that model.
3. **`public.purchases` does not exist in production**; only `simple_purchases` does (status `completed`). Our migration indexes and counts `public.purchases`, so it would fail outright.
4. **Edge functions are far ahead in production.** `origin/feature/search-sections` has `manage-products` +350/−16 lines (payment methods) and a different `manage-profile`; neither has `set_bio`. Deploying our versions would overwrite them.
5. Production also has migrations from `feature/manual-payments` / `feature/search-sections` (2026-09-24…29: `payment_methods`, `drop_legacy_kaspi_columns`, `direct_messages`, …) that are not on this branch.

Safe facts: no profile `bio` exceeds 500 characters, and production `get_seller_storefront` still returns only `handle, display_name, avatar_url, type, bio, products`. Nothing was written to production. Further production reads were then **denied by the auto-mode permission classifier**; none were retried.

**Required before any deploy (a new integration task, the user decides):** merge `origin/main` and the deployed feature branches into this work. Then:
- rewrite the storefront-metrics migration under a new timestamp, on `simple_purchases`, without the `is_active` default;
- drop our `is_active` private-by-default in favour of `is_published`;
- port `set_bio` and `bio` in `PROFILE_COLUMNS` onto the latest `manage-profile`;
- deploy only after that.

## Commands run
`npx vitest run` (per phase and full), `npm run typecheck` (diffed against the baseline), `npm run build`, `npx eslint <changed files>` (before/after counts via `git show HEAD:<file> | eslint --stdin`), Vite dev server with dummy `VITE_SUPABASE_*`, `node cdp.mjs` / `cdp2.mjs` (headless Chrome over CDP, in the scratchpad).

## Status
- [x] VAN
- [x] PLAN (2026-09-29)
- [x] CREATIVE — A8, B11 (2026-09-29)
- [x] BUILD — P0–P6, P8 (2026-09-29)
- [x] P7 DEPLOY — handed to the user
- [x] REFLECT (2026-09-29) → `reflection/reflection-round3-editor-storefront-feedback.md`
- [ ] ARCHIVE

Next: **`/archive`**. Deployment is done by the user outside this workflow.

---

## Tasks on other branches
- **English language (RU/KK/EN) + settings renames + white-on-orange**: tracked in `memory-bank/tasks.md` on branch `английский-язык`. The dark theme ("Подсветка") was **cancelled by the user** and must not be built unless asked again.

## Completed tasks
- [x] **Product Preview Isolation, Live Editor Preview & Seller Storefront** (Level 4, 2026-09-17 → closed 2026-09-29) → `archive/archive-preview-editor-storefront.md`
  - Still pending outside development: apply migration `supabase/migrations/20260917120000_private_products_and_seller_metrics.sql`; redeploy edge functions `manage-products`, `manage-profile` (+ `_shared/profiles.ts`); Phase 10 fake-product cleanup (gated on the literal confirmation "Да, удаляй fake products"); on-device re-check on an actual phone.
