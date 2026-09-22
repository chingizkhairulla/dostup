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
- [ ] BUILD — next step
- [ ] REFLECT
- [ ] ARCHIVE

## Repo-wide technical notes
- Test infrastructure exists: vitest + jsdom + testing-library, `npm test` (338 tests across 27 files as of the last archived task; will grow with this one). Config in `vitest.config.ts`, setup in `src/test/setup.ts` (jest-dom matchers, cleanup, stubs for `matchMedia`, `ResizeObserver`, `hasPointerCapture`, `scrollIntoView` — the last two needed by Radix).
- `npx tsc --noEmit` fails on the project-references setup — use `npm run typecheck` (`tsc -p tsconfig.app.json --noEmit`).
- Baseline of 22 pre-existing type errors and roughly 253 pre-existing lint problems, unrelated to this task; fix only what this task's own changes cause.
- The app cannot start without `VITE_SUPABASE_*` env vars; there is no `.env` committed (the user has one locally).
- **jsdom has no real layout engine.** This task's Phase 6 headless-Chrome matrix (ru/kk/en × two widths, five routes) exists specifically because component tests alone cannot catch layout issues — e.g. English strings running longer than Russian/Kazakh in a fixed-width button.

## Verification tooling note
Headless Chrome is installed (`C:\Program Files\Google\Chrome\Application\chrome.exe`) and can screenshot real dev-server routes: `chrome --headless=new --window-size=W,H --virtual-time-budget=20000 --screenshot=<file> <url>`. A temporary Vite entry (deleted afterward, confirmed via `git status`) can render real components without logging in, driven over the Chrome DevTools Protocol for both a screenshot and hard geometry (computed styles, element rects). Temporary files must live outside `public/` — anything there ships in the production build. Under PowerShell use `Start-Process -Wait -PassThru`; a plain `&` call reports a spurious exit code 1.

## Branch note
This branch was created as `темная-подсветка` for a dark-theme task, then renamed to `английский-язык` once the user dropped the theme and kept only the translation work (2026-09-22). It branches from `предпросмотер` (not `main`) deliberately — Phase 4b of this task's plan and the white-on-orange sweep both touch files `предпросмотер` already rewrote (`CreatorProductsTab.tsx`, `dialog.tsx`), so stacking avoids a later merge conflict. `предпросмотер` should be merged to `main` reasonably soon; once it is, rebase this branch onto `main`.
