# Progress

## Memory Bank
- [x] `memory-bank/` structure created (2026-09-17)

## Archived tasks
- **Product Preview / Editor / Storefront** — archived 2026-09-22 as development-complete, not yet deployed or reviewed by the customer. Full history, lessons and outstanding items: `memory-bank/archive/archive-preview-editor-storefront.md`.
- **Round 2 — Editor window rework** (customer's whop.com-style feedback: 70/30 preview split, collapsed sections, pinned Save) was then built on top of the archived task — full detail in the reflection doc's "Round 2" section and `memory-bank/creative/creative-editor-window-round2.md`. Also complete but **not yet reviewed by the customer**, and not yet deployed. If either round's review turns up something to fix, that starts as a new task via `/van`, not a reopening of this one.

## This branch (`предпросмотер`)
No other task is tracked here. The active English-language/settings/white-on-orange task is tracked on the `английский-язык` branch (`memory-bank/tasks.md` there).

## Repo-wide technical notes
- Test infrastructure exists: vitest + jsdom + testing-library, `npm test` (338 tests across 27 files as of round 2). Config in `vitest.config.ts`, setup in `src/test/setup.ts` (jest-dom matchers, cleanup, stubs for `matchMedia`, `ResizeObserver`, `hasPointerCapture`, `scrollIntoView` — the last two needed by Radix).
- `npx tsc --noEmit` fails on the project-references setup — use `npm run typecheck` (`tsc -p tsconfig.app.json --noEmit`).
- Baseline of 22 pre-existing type errors and roughly 253 pre-existing lint problems, unrelated to any task here; fix only what a task's own changes cause.
- The app cannot start without `VITE_SUPABASE_*` env vars; there is no `.env` committed (the user has one locally).
- **jsdom has no real layout engine.** Any layout/CSS question needs verification in a real browser, not just jsdom component tests — see the tooling note below. Every layout defect found in this task (round 1's preview strip, round 2's three screenshot-only bugs) was invisible to component tests and only found by rendering real pixels.

## Verification tooling note
Headless Chrome is installed (`C:\Program Files\Google\Chrome\Application\chrome.exe`) and can screenshot real dev-server routes: `chrome --headless=new --window-size=W,H --virtual-time-budget=20000 --screenshot=<file> <url>`. A temporary Vite entry (deleted afterward, confirmed via `git status`) can render real components without logging in, driven over the Chrome DevTools Protocol for both a screenshot and hard geometry (computed styles, element rects). Temporary files must live outside `public/` — anything there ships in the production build. Under PowerShell use `Start-Process -Wait -PassThru`; a plain `&` call reports a spurious exit code 1.

## Pending before this task is live
1. Customer review of round 2's editor window (cross position is ambiguous between the customer's words and their reference photo — built to the words).
2. Apply `supabase/migrations/20260917120000_private_products_and_seller_metrics.sql`.
3. Redeploy edge functions `manage-products`, `manage-profile` (and the shared `_shared/profiles.ts`).
4. Re-verify round 1's on-device fixes and round 2's phone-preview sizing on an actual phone.
