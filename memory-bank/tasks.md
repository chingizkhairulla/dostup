# Tasks

## Active Task — English language (RU/KK/EN, extensible) + settings renames + white-on-orange
Source: the user's `/van` message, replanned 2026-09-22 — **the dark theme was cancelled by the user** ("темная тема не нужна"). Everything about "Подсветка", a black palette, a `ThemeProvider`, and the mandatory prototype gate from the first plan is **dropped**. `next-themes` stays installed but unused; do not build a theme toggle unless the user asks again in a fresh request.

**Note:** this file previously also tracked a second task (Product Preview / Storefront, including the round-2 editor window redesign). That task was archived on 2026-09-22 as development-complete but not yet deployed or reviewed by the customer — see `memory-bank/archive/archive-preview-editor-storefront.md` for its full history, lessons and outstanding items. If deploy/review turns up something to fix, that is a new task, started fresh with `/van`, not a reopening of the archived one.

### Requirements as they now stand (verbatim intent, user's message 2026-09-22)
1. **Rename settings sections**: "Приложение" (`appSettings`, download/install) → **"Скачать приложение"**; "Настройки уведомлений" (`notificationSettings`) → **"Уведомления"**. KK/EN equivalents needed too.
2. **English language**: add EN to Settings → language section **after Kazakh**; the **entire platform** must show in English too, alongside RU and KK. The user explicitly wants the three-language setup to **keep being supported going forward** — treat this as "build it as a real system a fourth language could later join", not a one-off translation pass.
3. **Logged-out header toggle** (`PublicLocaleToggle`, currently `RU / KK` top-right on the product page): add **`EN`**.
4. **White text on orange**: everywhere there's an orange background — buttons "and possibly not only buttons" — text must be white; black looks bad on orange. Stated as "in any theme" — since dark mode is now out of scope, in practice this means the one (light) theme today; the fix should still be token-based so it doesn't block a theme being added later, but no second theme is being built now.

### Complexity: **Level 4**
Still multi-area — a widened i18n type, ~800 call sites across 42 files, DB schema, server-generated text, and a systematic colour sweep — but smaller than the first plan: there is no gated design-review phase anymore. Two architecture choices remain flagged for `/creative` because they set the pattern the ~800 call sites will follow; nothing else blocks starting the build.

### Audit findings (from VAN, still accurate — unaffected by dropping the theme)
**i18n (the big one)**
- `Language = "ru" | "kk"` (`src/lib/translations.ts:1`); `translations` has two ~600-line objects; `t()` in `LanguageContext` falls back `translations[lang][key] → translations.ru[key] → key`. `TranslationKey = keyof translations.ru`. Adding `en` to the type is cheap and typed — **but**:
- **~800 inline binary ternaries** `language === "ru" ? <RU> : <KK>` across **42 files** (heaviest: `CreatorScheduleTab` 151, `TeacherScheduleTab` 149, `CreatorMaterialsTab` 94, `TeacherMaterialsManager` 60, notification hooks…). With a third language every one of these silently renders **Kazakh for English users** unless migrated.
- **77 files contain Cyrillic literals** outside `translations.ts` (biggest: `aiCategory.ts` 277, `CreatorProductsTab` 194, `ModeratorDashboard` 163, `taxonomyData.ts` 116, `SlotCreationWizard` 72, `normalizeTopic.ts` 21…).
- Hard-typed `"ru" | "kk"` in ~12 places (`catalog.ts` label helpers, `SlotCreationWizard`, both schedule tabs, `ErrorBoundary`) will fail typecheck or mis-narrow once `Language` widens.
- **Data-driven content**: categories carry `name_ru` / `name_kk` (`catalog.ts categoryLabel`) — no `name_en` column exists → needs a DB migration. Billing-period and event-date formatters take `"ru"|"kk"`; 18 `toLocaleDateString`/`Intl` call sites hard-code locales.
- **Server-side text**: edge functions (push / notify-* / emails) compose user-facing strings **in Russian only today — Kazakh users already get Russian**, not just an English gap.
- `PublicLocaleToggle` and `LanguageSwitcher` are hand-written two-button components; `ErrorBoundary` reads `localStorage.language` directly and casts, untrusted.

**Settings renames** — trivial: two translation keys × RU/KK/EN. `notificationSettings` is shared with `ModeratorSettingsDialog`, so that dialog's label changes too (acceptable; noted). Check `translations.test.ts` for assertions on the old strings.

### Audit result — white text on orange (verified against code, not assumed)
**Already correct** (white via `--primary-foreground: 0 0% 100%`): `Button` `default`/`cta`, `Badge`, `Checkbox`, `Switch`, calendar selected day, `SupportChat` own bubble, product-form "free/paid" toggle, `bg-accent text-white` drag-over crumbs, `InstallBanner`, and the three `bg-[#FF6B00]` CTAs (`AuthEntryScreen:58`, `PasswordLoginScreen:167`, `ProductPurchasePage:501` — they override only the background; the `Button` variant still supplies white text). The orange play-button discs (`ProductCard:93`, `ProductVideoPlayer:273`, `CreatorProductsTab:2889`) use a white `Play` icon. The other ~30 solid-orange spots are decorative (progress bars, nav-rail markers, status dots) and carry no text.

**Real defects found (dark text can appear on solid orange):**
1. `ui/dropdown-menu.tsx:28` (`SubTrigger`): `focus:bg-accent` / `data-[state=open]:bg-accent` with **no** `…text-accent-foreground` → dark label on orange when focused/open. `ContextMenuSubTrigger` (used in `CreatorMaterialsTab:1349`) needs the same check; `MenubarSubTrigger` already sets it correctly.
2. `ui/dialog.tsx:56` (mobile close ×): `data-[state=open]:bg-accent data-[state=open]:text-muted-foreground` → grey icon on solid orange. Radix `Close` doesn't set `data-state` today so it's dormant, but the class is wrong — fix for safety.
3. `ui/calendar.tsx:31`: range-cell `[&:has([aria-selected])]:bg-accent` — orange cell whose text colour isn't forced; verify at runtime.
4. Structural, not a text bug: **two oranges** in the codebase — raw `#FF6B00` (67 uses) vs. token `--primary` = hsl(24 95% 53%) = `#F97015` — plus `theme-color` `#f97316` in `index.html`/`offline.html`. Should be unified to one token regardless of the text-colour fix.

**Honest finding the user should know:** white on this orange measures **≈2.86:1** contrast (WCAG AA wants 4.5:1 for normal text, 3:1 for large/bold ≥18px or bold ≥14px). Black (`#1F2328`) on the same orange is 5.53:1. That is the accessibility cost of "always white on orange". **Default taken for this plan** (reversible, not a blocking question): keep the brand orange as-is and make sure every such text is **bold, ≥16px** where practical, which brings it close to the AA large-text threshold; do **not** silently darken the brand orange platform-wide, since that changes brand identity and wasn't asked for. Flag any spot where the text can't be made bold/large (e.g. a small badge) so it can be reviewed individually.

**Static grep cannot see inheritance / arbitrary `className` overrides** — the real acceptance check is the runtime scanner in Phase 1.

### Decision on the RU-only "tail" (schedule / materials / notifications / seller product screens)
Per the user's repeated "все сразу" / "и дальше поддерживались", going with the previously-recommended approach: **one pass, but staged in a safe order** — (1) mechanically migrate every `language === "ru" ? A : B` to a 3-way helper with `en` initially defaulting to `ru` (behaviour-preserving, fully testable), (2) fill in real English content area by area, most visible first, the two schedule tabs **last** (they're mid-edit from recent calendar work — highest conflict risk), (3) a completeness test that lists any string still falling back to Russian, so "done" is measurable rather than assumed. Documented, not silently translated: `ModeratorDashboard` (staff-only) and `aiCategory.ts`/`normalizeTopic.ts` (Russian **keyword-matching logic**, not UI text — translating these would break category auto-detection, not just look wrong) stay Russian; user-authored content (product titles/descriptions/reviews) is never translated.

### Other open items (defaults taken, not blocking — flag if wrong)
- **Orange contrast**: keep the brand colour, enforce bold/≥16px white text where the design allows it (see above) rather than deepening the orange.
- **Branch**: the branch created for this task was named `темная-подсветка`; since the theme is cancelled it has been **renamed to `английский-язык`** to match the actual scope (no code touched by the rename).
- **DB apply**: the user has DB access now, but I still only **prepare** migrations/edge functions as files — applying them (this is production) is run by the user, and no key is ever pasted into chat, committed, or put in a `VITE_*` variable.

---

# Implementation Plan (Level 4) — English (RU/KK/EN), settings renames, white-on-orange

## Technology validation
No new runtime dependencies. Present: React 18, Vite, Tailwind, `sonner`, lucide, vitest + jsdom + testing-library (≈310 tests), Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`. **New dev-only**: `puppeteer-core` (drive the installed Chrome for the orange/contrast scanner and a screenshot matrix) and optionally `axe-core` for a contrast rule. Baseline first: `npm test`, `npx tsc --noEmit`, `npm run build` (note: `build` does not typecheck).

## Ordering and dependencies
```
Phase 0 baseline
   ├─ Phase 1 white-on-orange   (independent, small, lands first)
   ├─ Phase 2 settings renames  (independent, small, lands first)
   └─ Phase 3 i18n foundation ─► Phase 4 English coverage ─► Phase 5 DB + server (gated apply)
Phase 6 verification (per-phase tests already required; this is the final matrix)
```
Phase 2's EN string finishes together with Phase 3 (needs the widened `Language` type first for the EN entries to exist); the RU/KK rename can land immediately.

## Phase 0 — Baseline
Run tests / `tsc --noEmit` / build on branch `английский-язык`; record counts in the Build Log so pre-existing failures aren't misattributed to this work.

## Phase 1 — White text on orange (user item 4)
1. **Runtime scanner** (dev script, `scripts/audit-orange.mjs` via `puppeteer-core`): open key routes (home, product, checkout/login, settings, creator dashboard tabs, open dropdown/context menus, calendar) and walk the DOM, flagging elements whose computed background is orange (hue 14–34°, sat > 70%) with non-white text; report selector + route. Run **before** fixing (defect list) and **after** (must be empty).
2. Fix the 3 real defects: `dropdown-menu.tsx` `SubTrigger`, `dialog.tsx` close ×, `calendar.tsx` range cell, plus `ContextMenuSubTrigger` (add `text-accent-foreground` alongside every solid `bg-accent`).
3. Unify the orange: replace the 67 raw `#FF6B00`/`#E86200` usages with the `--primary` token (`bg-primary`, `hover:bg-primary/90`, `ring-primary`, `text-primary`); update `theme-color` in `index.html`/`offline.html` to match. Do **not** change the hue/value of the orange itself (see "Other open items" above).
4. **Guard tests** (vitest): (i) `--primary-foreground` is `0 0% 100%`; (ii) `Button` `default`/`cta` and `Badge` classes contain `text-primary-foreground`; (iii) a source scan fails on any `className` combining a solid `bg-primary|bg-accent|bg-[#FF6B00]` with `text-foreground|text-black|text-[#1F2328]|text-muted-foreground`; (iv) every solid `bg-accent` in `components/ui/` has an accompanying `text-accent-foreground`. Allowlist: `GoogleSignInButton` (white by Google brand rules).

## Phase 2 — Settings renames (user item 1)
`appSettings`: RU **"Скачать приложение"**, KK "Қолданбаны жүктеп алу", EN "Download the app". `notificationSettings`: RU **"Уведомления"**, KK "Хабарландырулар", EN "Notifications". Both keys are shared with `ModeratorSettingsDialog` (its label changes too — intended). Update the section `keywords` used by settings search for both. Tests: labels render correctly in each language in `AccountSettingsView`; search still finds "скачать"/"уведомл".

## Phase 3 — i18n foundation (user items 2-3, part 1) — build it as a real system
1. `Language = "ru" | "kk" | "en"`, defined once as a `LANGUAGES` list (`code`, native label, short code) that every switcher reads from — this is what makes a future 4th language a one-line addition rather than another 42-file hunt. `isLanguage()` guard; `LanguageProvider` and `ErrorBoundary` validate `localStorage.language` instead of casting it (unknown/legacy value → `ru`).
2. `translations.en` typed so a missing key is a **compile error** for both `kk` and `en`. `t()` keeps its `lang → ru → key` fallback, plus a dev/test-time warning listing any fallback actually hit.
3. A 3-way helper (working name `l({ru, kk, en})`, exposed as `useLanguage().l`) that **never** silently returns Kazakh for English. Codemod the ~800 `language === "ru" ? A : B` sites to it (`en` initially mirrors `ru` — behaviour-preserving, reviewable diff). Retype the ~12 hard-coded `"ru" | "kk"` signatures (`catalog.ts` helpers, `SlotCreationWizard`, both schedule tabs, `ErrorBoundary`) to `Language`.
4. Locale-aware formatting: one `localeTag(language)` (`ru-RU` / `kk-KZ` / `en-GB`) feeding the 18 `toLocaleDateString`/`Intl` call sites; `formatEventDate` gets English month abbreviations; audit plural handling in `AccountSettingsView`, `CreatorPendingPayments`, `CreatorUsersTab`, `ProductPage`, checkout pages (English needs 1/other, not the RU/KK 1 / 2-4 / 5+ pattern); `billingPeriodLabel` gets an EN branch.
5. Switchers: `PublicLocaleToggle` → **RU / KK / EN** (logged-out header, top-right — user item 3), `LanguageSwitcher` → English added **after** Қазақша (Settings language section — user item 2; also used in `TeacherAccountTab` and the moderator dialog); `document.documentElement.lang` follows.
Tests: `translations.test.ts` extended (every key present in ru/kk/en, no empty strings, `{param}` placeholders identical across languages); `l()` fallback matrix; `PublicLocaleToggle` renders three buttons and switches correctly; `LanguageSwitcher` order is ru, kk, en; invalid stored language → `ru`; **no-Kazakh-for-English guard** (renders representative components in `en` and asserts no Kazakh-only letters `әіңғүұқөһ` leak).

## Phase 4 — English coverage, all at once (user item 2, part 2), ordered by visibility
4a. Buyer-facing: marketplace/catalog/product/checkout/purchase pages, auth, layout/nav, buyer dashboard (`ScheduleTab`, `MaterialsTab`, `NotificationsTab`), settings, install banner, `NotFound`, `ErrorBoundary`, auth/API error mapping (`authErrors.ts`).
4b. Seller: `CreatorProductsTab` (194 literals), announcements, users, pending payments, notifications, materials (`CreatorMaterialsTab`, `ProductMaterialsManager`, `TeacherMaterialsManager`), teachers/schedule managers.
4c. Realtime notification hooks and toasts (`useRealtimeStudentNotifications`, `useRealtimeBookings`, `useRealtimeTeacherNotifications`, `useSimplePurchases`).
4d. Schedule tabs and `SlotCreationWizard` **last** (`CreatorScheduleTab` 151 / `TeacherScheduleTab` 149 / wizard 72 — highest regression + merge-conflict risk against the recent calendar work).
4e. Static assets: `public/offline.html`, PWA manifest strings, `ogproduct` HTML (`lang="ru"` hard-coded).
**Documented exclusions**: `ModeratorDashboard`/moderator-only strings (staff), `aiCategory.ts`/`normalizeTopic.ts` (Russian keyword-matching logic — translating breaks category auto-detection), user-authored content (product titles, descriptions, reviews — stays as written by the seller).
Tests per area: a render-in-`en` test asserting the visible headline/CTA strings; a repo-level **completeness test** that fails while any component still contains a Cyrillic literal outside the exclusion list — this is the measurable "done" for "все сразу".

## Phase 5 — Server text (production; prepared here, applied by the user)
5a. **Taxonomy names — REVISED BY `/creative` C2: no migration.** Add `src/lib/taxonomyEn.ts`, a slug→English map for the 5 categories and ~35 subcategories seeded in `20260825100000_category_taxonomy.sql:42-97`; widen the three label helpers in `catalog.ts:123-139` from `"ru" | "kk"` to `Language` and resolve `en → map[slug] ?? name_ru`. Every DB view/RPC stays untouched. Guard test: every seeded slug has a map entry (read from the migration file, the way `translations.test.ts` already reads repo files). `taxonomyData.ts` preset topics are **not** translated — see C2 for why that would fragment the `topics` table.
5b. **Server-generated text**: `notify-*`, `send-reminders`, `process-subscriptions`, `checkout`, `manage-bookings`, `unlock-materials`, `submit-payment-receipt`, … are **Russian-only today** (this already under-serves Kazakh users, not just an English gap). Add `profiles.language` (`ru|kk|en`, default `ru`, CHECK constraint) written by a new `manage-profile` `set_language` action whenever the user switches language in the UI, read by the edge functions via a shared `_shared/i18n.ts`.
5c. Handoff, not execution: migrations + edge-function redeploys are prepared as files; **applied only when the user says so**, in order migration → edge functions → frontend. Confirm a backup/PITR point first — this is production (`supabase/config.toml` site_url is `trydostup.online`).
5d. **Key handling**: the DB key is never pasted into chat, committed, or exposed via a `VITE_` variable. If it's the `service_role` key it bypasses RLS and stays only in the user's local shell/CI secrets — the recommended path is the user running `supabase login` + `supabase link` + `supabase db push` themselves.
Tests: `_shared/i18n.ts` picks the recipient's language with `ru` fallback; migration file lint (idempotent `IF NOT EXISTS`, additive only, no `DROP` of data columns); `catalog.ts` label helpers return EN with `ru` fallback when `name_en` is null.

## Phase 6 — Verification (project rule: tests must pass before a phase is "done")
- vitest for every phase above + `npx tsc --noEmit` + `npm run build` + lint.
- Headless-Chrome matrix: {ru, kk, en} × {1280px, 390px} on home, product, checkout, settings, seller dashboard → screenshots + the orange/contrast scanner + a text-overflow check (English strings run longer than Russian/Kazakh in some UI slots — worth checking explicitly). Lesson carried from the earlier preview task: jsdom can't see real layout, so this real-browser pass is mandatory, not optional.
- Nothing is deployed, pushed, or applied to the database without the user's explicit instruction.

## Creative phases — COMPLETE (2026-09-22)

### C1 — i18n architecture → `memory-bank/creative/creative-i18n-architecture.md`
**Decision: hybrid — inline `l({ ru, kk, en })` for the inline sites, existing `t()` keys retained.**
- Real count is **730**, not ~800: **575** `language === "ru"` + **155** `language === "kk"`. 495 are simple literal pairs, 16 use template literals, ~64 are multiline.
- **The 155 KK-first sites have inverted operands.** A single regex over both forms would silently swap Russian and Kazakh on 155 strings, with a green typecheck. The codemod therefore runs as **two separate passes**, with an anti-swap regression test naming real strings from `CreatorMaterialsTab` / `CreatorAnnouncementsTab`.
- `Translated = { [K in Language]: string }` makes `en` **mandatory** — an untranslated site cannot compile. `en` is seeded from **Russian**, never Kazakh, so worst case shows the language users actually read.
- **Completeness metric = the Cyrillic invariant**: no `en:` value anywhere contains a Cyrillic character. Self-maintaining, needs no inventory file, and passes naturally for legitimately identical Latin strings ("SAT", "IELTS", "Email"). This is the measurable "done" for "все сразу".
- One `LANGUAGES` list drives the type and every switcher (the user's "и дальше поддерживались"). Trade-off accepted and documented: a future 4th language produces an exhaustive compile-time worklist rather than silent gaps.
- **Pre-existing defect flagged, not fixed** (out of scope): counted Russian strings are already ungrammatical — `CreatorScheduleTab.tsx:433` renders "Создано 1 слотов".

### C2 — Taxonomy in English → `memory-bank/creative/creative-taxonomy-english.md`
**Decision: client-side slug→EN map. NO taxonomy migration. This reverses Phase 5a below.**
- What changed: `search_catalog` matches only `title`/`headline`/`seller_display_name` and filters by **slug**, never by category name (`20260914120000_product_reviews.sql:224-239`); the tables are **seed-only config** (no runtime INSERT anywhere); no edge function reads these columns; and `20260917120000` is **still unapplied**, so a second migration would compound a pending production change. A `name_en` column would have cost 4 view + 3 function recreations on production for 40 constant display strings, buying no capability.
- Upgrade trigger to revisit: the first time server-generated text (email/push/receipt) needs a category name, or categories become runtime-editable.
- **Preset product topics stay Russian.** `products.topic` stores the chosen label *as free text* and `topics` has an open-insert policy, so translating the presets would fragment the `topics` table and break `aiCategory.ts`'s Russian keyword matching. Topic chips will read Russian even in the English UI — the user should know this; fixing it properly needs topic *ids*, a separate task.

## Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Codemod of ~800 ternaries regresses the schedule/materials screens | high | Behaviour-preserving first step (`en = ru`), tests per file, schedule tabs last, checked against the in-progress calendar work |
| `en` silently rendering Kazakh (binary ternaries) | high | `l()` helper + no-Kazakh-for-English guard test + typed exhaustiveness |
| Production DB/view changes | high | Additive-only migrations, latest view definitions verified, null-safe frontend, backup/PITR, user-run apply |
| DB key leaked or misused (`service_role` in frontend) | high | Never in chat/commits/`VITE_*`; user runs the CLI; noted in the deployment handoff |
| White on orange ≈2.86:1 (below WCAG AA) | medium | Bold/≥16px text where possible; brand colour kept as-is by default, flagged per spot rather than changed platform-wide |
| Two oranges (`#FF6B00` vs `#F97015`) | low | Unify to one token |
| EN copy quality (no native reviewer) | medium | Glossary decided in `/creative`; user reviews the highest-visibility screens first |
| Scope creep from "все сразу" | medium | Explicit exclusion list + completeness test as the measurable "done" |
| Longer English strings breaking fixed-width buttons/labels | medium | Included in the Phase 6 screenshot matrix explicitly |

### Status
VAN → PLAN (replanned 2026-09-22 after the dark theme was cancelled) → **CREATIVE complete (C1, C2)** → **BUILD in progress: Phase 0 ✅, Phase 1 ✅, Phase 2 next.**

Two creative decisions changed the plan and must be carried into the build:
1. The taxonomy migration is **cancelled** (C2) — Phase 5 shrinks to server-side notification language only.
2. The codemod is **two passes, not one** (C1) — the 155 KK-first sites invert operands and would otherwise swap Russian and Kazakh silently.

---

# Build Log

## Phase 0 — Baseline ✅ (2026-09-22, branch `английский-язык`)
| Gate | Result |
|---|---|
| `npm test` | **310 passed / 27 files** |
| `npm run typecheck` | **18 pre-existing errors** (`tsconfig.app.json` covers `src` only) |
| `npm run build` | green |

Note: `progress.md` had claimed 338 tests — that count belongs to the `предпросмотер` branch (round 2's tests), which this branch does not contain. Corrected.

## Phase 1 — White text on orange ✅ (2026-09-22)

**Written first, confirmed failing, then fixed** (TDD): `src/test/whiteOnOrange.test.ts` (17 tests) over a new pure helper `src/lib/orangeSurfaces.ts`.

The helper matches **per Tailwind variant**, not per class string. That mattered: a naive same-string check flags correct code such as `hover:bg-accent text-muted-foreground hover:text-white` (grey at rest, white on the orange hover) and `bg-accent text-white md:bg-accent/10 md:text-foreground`. Both shapes are real and in the repo, and both are now regression tests.

**Repo-wide static scan result: exactly one offender** — `ui/dialog.tsx`. The audit's claim that the app is already white-on-orange held up.

Three source fixes:
1. `ui/dropdown-menu.tsx:28` — `SubTrigger` set `data-[state=open]:bg-accent focus:bg-accent` with **no text colour for either state**, so the label inherited the page's dark text. Added the matching `text-accent-foreground`.
2. `ui/dialog.tsx:56` — the phone close ✕ paired `data-[state=open]:bg-accent` with `text-muted-foreground` (grey on orange). Now `text-accent-foreground`.
3. `ui/command.tsx:108` — the background used `data-[selected='true']` and the text colour `data-[selected=true]`. CSS treats quoted and unquoted attribute values alike so it worked, but the mismatch was only found because the test compares variants literally. Normalised.

**Runtime verification** (the part static reading cannot do — inherited colour): new `scripts/audit-orange.mjs` drives real Chrome over the DevTools Protocol against a harness of the real components (`scripts/orange-harness/`, outside `public/`, so nothing ships; `tsconfig.app.json` includes only `src`, so it adds no type errors). It walks every element, finds orange backgrounds by hue/saturation, focuses each `[data-scan]` target to make `focus:` states real, and reports the computed text colour and contrast.

Result: **PASS — 0 elements with non-white text on orange** across menus, controls, calendar and dialog scenes. Screenshot confirms the fix visually: the sub-menu trigger now renders white on orange.

**Honest scope of those fixes.** All three are *latent*, not live: `DropdownMenuSubTrigger` is used 0 times in the app (only `ContextMenuSubTrigger` is, and it was already correct), `command.tsx`/`menubar.tsx`/`navigation-menu.tsx` are unused entirely, and Radix's `Close` never sets `data-state`, so the dialog ✕ is never orange in practice. So Phase 1 did not repair a visible defect — it **proved by measurement** that the customer's rule already holds, and closed three ways it could silently break later.

**Two findings recorded, both decisions for the user (not applied):**
- **Calendar `cell` is not a defect.** `ui/calendar.tsx:31` puts a solid `bg-accent` on the `<td>` with no text colour, which the plan flagged for runtime checking. Measured: the day button fully covers the cell and supplies its own white-on-orange, so selected days read white (verified for a 5-day range and for "today"). Left as is.
- **The two oranges are near-identical.** Raw `#FF6B00` (55 uses) vs the `--primary` token `#F97015`: rgb delta (6, −5, −21), **identical luminance** (0.3178 vs 0.3178), white contrast 2.86 vs 2.85. Unifying is therefore safe for accessibility in either direction but is a visible brand change either way, so **Phase 1 step 3 (unify the orange) is deferred to the user's choice** rather than applied silently — a deliberate deviation from the plan, recorded here per the build rules. The measured 2.85:1 also confirms the WCAG caveat already reported.

| Gate | Result |
|---|---|
| `npm test` | **327 passed / 28 files** (+17, all green) |
| `npm run typecheck` | **18** — unchanged from baseline, no new errors |
| `npm run build` | green; `dist` contains no harness reference |
| `node scripts/audit-orange.mjs` | **PASS — 0 dark-on-orange** |

## Phase 2 — Settings renames ✅ (2026-09-23)
Tests written first (6, all failing on the old strings), then the rename. `appSettings` → «Скачать приложение» / «Қолданбаны жүктеп алу», `notificationSettings` → «Уведомления» / «Хабарландырулар»; English added with Phase 3. Both keys are shared with `ModeratorSettingsDialog`, so its labels changed too, as planned.

One test of mine was wrong, not the product: asserting that searching «скачать» hides the profile section failed because the section list filters but the open section's own pane keeps rendering on the right. Assertion corrected to check a section that only ever appears in the list.

`npm test`: **333 passed / 29 files**.

## Phase 3 — i18n foundation ✅ (2026-09-23)

**`src/lib/language.ts`** is now the only place that knows which languages exist: `LANGUAGES` (code, native label, short code, locale) derives `Language`, `Translated`, `isLanguage`, `toLanguage`, `pickLanguage`, `localeTag` and `pluralForm`. Both switchers render from that list, so a fourth language cannot leave a switcher behind.

**`translations.ts` restructured** so a missing translation is a compile error: the three dictionaries are built as `dictionaries`, and the export is typed `Record<Language, Record<TranslationKey, string>>`. Writing the 547-key English dictionary produced **no key errors**, confirming completeness at compile time rather than by inspection.

**The codemod ran as two passes** (`scripts/codemod-l.mjs`), per C1. Two guard failures in the script caught real problems before anything was written:
1. The post-condition compared Russian/Kazakh literals as a *list*, so it refused every file — seeding `en` from the Russian side duplicates that literal on purpose. Changed to compare distinct **Cyrillic words**, which also fixed a second false alarm where a ternary living inside a template literal legitimately reshapes that literal.
2. `MaterialsTab.tsx` was the case that exposed it.

Result: **714 sites rewritten in 38 files**, 16 handled by hand (date-fns locales, two plural forms, an `isKk` shorthand, a nested plural ternary). `l` was then wired into 37 components' `useLanguage()` destructuring; three sub-components that take `language` as a *prop* (`MaterialNode`, `CreatorTrashList`, `SlotCreationWizard`) needed their own hook call.

**The operand inversion was verified, not assumed.** `src/test/languageSlots.test.ts` parses every `l({…})` back out of the source and checks the slots by alphabet: no Kazakh-only letter (ә, і, ң, ғ, ү, ұ, қ, ө, һ) in any `ru` slot, and `en` never seeded from the Kazakh side. All 649 single-line phrases pass — the 155 KK-first sites were inverted correctly.

Also done: `ErrorBoundary` validates stored language instead of casting (and gained English), `catalog.ts` label helpers widened to `Language` with English plural rules for reviews/sales, `formatEventDate` gained English months, `LanguageContext` gained `l` plus a dev-time warning naming any fallback hit.

**C2 implemented**: `src/lib/taxonomyEn.ts` maps 5 category and 35 subcategory slugs to English; a test reads the seed migration itself so the map cannot fall behind the database. No migration was written.

| Gate | Result |
|---|---|
| `npm test` | **375 passed / 34 files** |
| `npm run typecheck` | **18** — still exactly the baseline |
| `npm run build` | green |
| Real browser, all three languages | **verified** — see below |

**Browser check on the running app** (`scripts/shoot-languages.mjs`, real dev server, three languages): the header toggle renders `RU / KK / EN`, `document.documentElement.lang` follows, headings translate ("Buy. Learn. Sell."), category chips show the C2 map working ("Online lessons", "Materials", "Subscriptions"), and **no button or link overflows its box in any language** — the specific risk of longer English strings. Seller-written product titles correctly stay as their authors wrote them.

## Phase 4 — English coverage ✅ (2026-09-23)

709 inline phrases needed English, but only **377 were distinct** — the same sentence ("Ошибка", "Отмена", "Ошибка при удалении") appears in up to 17 places. Translating each once and applying it by exact Russian text both halved the work and made the wording consistent across screens.

Three small scripts do it, all kept as tooling: `i18n-extract.mjs` (dump the distinct untranslated phrases), `i18n-apply.mjs` (write English into the `en` slot only, matching by Russian text) and `i18n-todo.mjs` (what is left).

**A real bug in that tooling was caught before it wrote anything.** The phrase regex used a lazy `.*?` for the string bodies, which let a quote character through; on a multi-line `l({…})` it therefore paired the opening `l({` with a `})` much further down the file. Running it would have rewritten the wrong span of code. It surfaced as a nonsense reading — `MaterialsProtectionNotice.tsx` reported 2 untranslated phrases although all 4 of its phrases were already English. Fixed by spelling the string bodies per quote character with that quote excluded (`[^"\\]`, `[^'\\]`, …), and moved into one shared module, `scripts/i18n-phrases.mjs`, so extract/apply/report cannot drift apart again.

`i18n-apply.mjs` carries the same post-condition as the codemod: a file is refused if any Cyrillic word appears in it that was not there before — replacing Russian with English can only ever remove Cyrillic words, never add one. No file was refused.

Two date phrases were translated with `{ locale: enGB }` in place of `{ locale: ru }` inside their interpolation, so an English reader gets "5 Sep" rather than "5 сент". That deliberately did not compile until `enGB` was imported — the compiler named all three files that needed it (`CreatorScheduleTab`, `TeacherScheduleTab`, `ScheduleTab`).

**Result: 716 phrases, 0 still Russian.** The `[i18n]` line printed by the test suite now reads `649/649 translated`.

Also worth recording: a raw `grep 'en: "…[а-я]'` suggests 6 leftovers, but all six are key names ending in "en" — `slotTak`**`en: "`**`Занято"`, `loginAlreadyTaken`, `handleTaken` — inside the Russian and Kazakh dictionaries, where Cyrillic belongs. The parser-based count of 0 is the correct one.

| Gate | Result |
|---|---|
| `npm test` | **375 passed / 34 files**, `[i18n] 649/649 translated` |
| `npm run typecheck` | **18** — baseline |
| `npm run build` | green |
| Real browser, 3 languages × 1280px and 390px | headings, chips and toggle all translate; **no overflowing control in any language at either width** |

### What is left
- **Phase 5** — server-generated text (`profiles.language` column + `_shared/i18n.ts` for the edge functions). Notifications and emails are still Russian-only for everyone, which already under-serves Kazakh users; this is the one part of the task that needs a production migration, prepared here but applied by the user.
- **Phase 6** — the final verification matrix on authenticated seller screens, which is where most of the 716 translated phrases actually live. They are covered by typecheck, tests and the parser, but have not been seen on screen in English.
