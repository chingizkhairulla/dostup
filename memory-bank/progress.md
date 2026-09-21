# Progress

## Memory Bank
- [x] `memory-bank/` structure created (2026-09-17)
- [x] Task defined: `.claude/dostup_claude_code_prompt.md` (Level 4)

## Task phases
- [x] VAN — audit of 13 spec questions complete
- [x] PLAN — 10-phase implementation plan, 5 creative decisions flagged
- [x] CREATIVE — all 5 design decisions settled (`memory-bank/creative/`); Phase 1 approach reversed to iframe-based
- [x] BUILD — Phases 0-7 and 9 complete; build green, typecheck clean against baseline, 310 tests passing
- [x] BUILD — Phase 8 acceptance criteria covered by component tests; **three real bugs found via actual on-device testing and fixed** (phone preview showed only a scrollable strip; cover photo vanished when picked because the layout remounted the form; long product titles stacked letter-by-letter and overflowed the phone — see reflection doc); all three need re-verification on a real phone
- [ ] Phase 10 — fake product cleanup (gated on explicit user confirmation + DB access)
- [x] REFLECT — `memory-bank/reflection/reflection-preview-editor-storefront.md` (updated after the test round and again after the on-device bug)
- [ ] ARCHIVE

## Build observations
- Test infrastructure now exists: vitest + jsdom + testing-library, `npm test` runs **310 tests across 27 files**. Config is in `vitest.config.ts`, setup in `src/test/setup.ts` (jest-dom matchers, cleanup, and stubs for `matchMedia`, `ResizeObserver`, `hasPointerCapture`, `scrollIntoView` — the last two are needed by Radix).
- Three pre-existing `node:test` files were found (missed in the original audit, which only checked `package.json`) and converted to vitest; nothing had ever run them because there was no `test` script.
- `npx tsc --noEmit` fails on the project-references setup — use `npm run typecheck` (`tsc -p tsconfig.app.json --noEmit`).
- Baseline of 22 pre-existing type errors and 253 pre-existing lint problems; none were fixed, per the spec's "fix only errors related to these changes".
- The app cannot start without `VITE_SUPABASE_*` env vars; there is no `.env` in the repo (the user has since created one locally, not committed).
- **jsdom has no real layout engine**, so a `flex-1`/percentage-height collapse — the class of bug that caused the phone-preview strip — is invisible to component tests. That bug was only found by testing on a real device. Keep this in mind before treating jsdom-passing tests as proof of correct layout.

## Pending user actions before this work is live
1. **Re-check the phone preview fix on an actual phone** through the demo tunnel.
2. Apply `supabase/migrations/20260917120000_private_products_and_seller_metrics.sql`.
3. Redeploy edge functions `manage-products`, `manage-profile` (and the shared `_shared/profiles.ts`).

## Verification tooling note
Headless Chrome is installed (`C:\Program Files\Google\Chrome\Application\chrome.exe`) and can screenshot the real dev-server routes: `chrome --headless=new --window-size=W,H --virtual-time-budget=20000 --screenshot=<file> <url>`. Use it for any layout question — jsdom cannot see layout. The `/preview/product` route can be driven without login by embedding it in an iframe on a throwaway page and answering its `ready` postMessage with a draft product. Any such throwaway page must live outside `public/` or be deleted afterwards (files in `public/` ship in the production build). Under PowerShell use `Start-Process -Wait -PassThru` — a plain `&` call reports a spurious exit code 1.
