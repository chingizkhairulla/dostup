# Progress

## Memory Bank
- [x] `memory-bank/` structure created (2026-09-17)

## Archived tasks
- **Product Preview / Editor / Storefront** (including its round 2, the editor window rework) — tracked and archived on the `предпросмотер` branch, not this one. Full history: `memory-bank/archive/archive-preview-editor-storefront.md`. If its customer review or deploy turns up something to fix, that starts as a new task via `/van`, not a reopening of it.

## Task phases — Active Task (English language RU/KK/EN, settings renames, white-on-orange)
- [x] VAN — audit complete, findings in `memory-bank/tasks.md`
- [x] PLAN — replanned 2026-09-22 after the user cancelled the dark-theme part of the original request; 6-phase plan (down from 8)
- [x] CREATIVE — both flagged decisions settled (`memory-bank/creative/`):
  - **C1** (`creative-i18n-architecture.md`): hybrid `l({ru,kk,en})` helper + the existing 615 `t()` calls kept; real count is 730 sites (not ~800), and the codemod runs as two passes because 155 are KK-first with inverted operands; completeness is measured by "no Cyrillic in any `en:` value".
  - **C2** (`creative-taxonomy-english.md`): **reverses** the plan's original Phase 5a — no `name_en` DB migration; a client-side slug→English map instead, since category names are display-only (search/filter use `title`/`headline`/slug, never category name) and the tables are seed-only config.
- [ ] BUILD — **in progress**: Phases 0-4 done (baseline, white-on-orange, settings renames, i18n foundation, English coverage — 716 phrases, 0 left in Russian). Remaining: Phase 5 (server-generated notification text, needs a production migration) and Phase 6 (verification on authenticated seller screens). Per-phase detail and gate results are in the Build Log at the end of `tasks.md`.
- [ ] REFLECT
- [ ] ARCHIVE

## Build status (branch `английский-язык`)
- Baseline: 310 tests / 27 files, 18 pre-existing type errors, build green.
- After Phase 1: **327 tests / 28 files**, still 18 type errors, build green, `node scripts/audit-orange.mjs` passes with 0 dark-on-orange elements.
- After Phase 3: **375 tests / 34 files**, still 18 type errors, build green, and the running app verified in a real browser in all three languages with no text overflow.
- New permanent dev tooling, all outside `public/` and outside the `src` typecheck scope, so none of it ships or affects the build:
  - `scripts/audit-orange.mjs` + `scripts/orange-harness/` — real-Chrome colour audit.
  - `scripts/codemod-l.mjs` — the two-pass ternary rewrite, kept because it is also how a fourth language would be seeded.
  - `scripts/i18n-phrases.mjs` — the one correct way to parse an `l({…})` phrase out of source; the extract/apply/report scripts all import it, after an earlier duplicated regex mis-paired multi-line phrases.
  - `scripts/i18n-extract.mjs` / `scripts/i18n-apply.mjs` / `scripts/i18n-todo.mjs` — dump the distinct untranslated phrases, write translations back into the `en` slot only, and report what is left.
  - `scripts/shoot-languages.mjs` — screenshots the running app in every language and reports overflowing controls.
- Open decision for the user, deliberately not applied: whether to unify raw `#FF6B00` (55 uses) with the `--primary` token `#F97015`. Measured as visually near-identical (same luminance), so it is a brand preference, not a correctness issue.

## Repo-wide technical notes
- Test infrastructure exists: vitest + jsdom + testing-library, `npm test`. This branch started at 310 tests / 27 files — the 338 figure belongs to `предпросмотер`, whose round-2 tests are not here. Config in `vitest.config.ts`, setup in `src/test/setup.ts` (jest-dom matchers, cleanup, stubs for `matchMedia`, `ResizeObserver`, `hasPointerCapture`, `scrollIntoView` — the last two needed by Radix).
- `npx tsc --noEmit` fails on the project-references setup — use `npm run typecheck` (`tsc -p tsconfig.app.json --noEmit`).
- Baseline of 22 pre-existing type errors and roughly 253 pre-existing lint problems, unrelated to this task; fix only what this task's own changes cause.
- The app cannot start without `VITE_SUPABASE_*` env vars; there is no `.env` committed (the user has one locally).
- **jsdom has no real layout engine.** This task's Phase 6 headless-Chrome matrix (ru/kk/en × two widths, five routes) exists specifically because component tests alone cannot catch layout issues — e.g. English strings running longer than Russian/Kazakh in a fixed-width button.

## Verification tooling note
Headless Chrome is installed (`C:\Program Files\Google\Chrome\Application\chrome.exe`) and can screenshot real dev-server routes: `chrome --headless=new --window-size=W,H --virtual-time-budget=20000 --screenshot=<file> <url>`. A temporary Vite entry (deleted afterward, confirmed via `git status`) can render real components without logging in, driven over the Chrome DevTools Protocol for both a screenshot and hard geometry (computed styles, element rects). Temporary files must live outside `public/` — anything there ships in the production build. Under PowerShell use `Start-Process -Wait -PassThru`; a plain `&` call reports a spurious exit code 1.

## Branch note
This branch was created as `темная-подсветка` for a dark-theme task, then renamed to `английский-язык` once the user dropped the theme and kept only the translation work (2026-09-22). It branches from `предпросмотер` (not `main`) deliberately — Phase 4b of this task's plan and the white-on-orange sweep both touch files `предпросмотер` already rewrote (`CreatorProductsTab.tsx`, `dialog.tsx`), so stacking avoids a later merge conflict. `предпросмотер` should be merged to `main` reasonably soon; once it is, rebase this branch onto `main`.
