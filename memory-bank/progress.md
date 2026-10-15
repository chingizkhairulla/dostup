# Progress

## Memory Bank
- [x] `memory-bank/` structure created (2026-09-17)

## Archived tasks
- **Product Preview / Editor / Storefront** (including its round 2, the editor window rework) — tracked and archived on the `предпросмотер` branch, not this one. Full history: `memory-bank/archive/archive-preview-editor-storefront.md`. If its customer review or deploy turns up something to fix, that starts as a new task via `/van`, not a reopening of it.

## Task phases — Active Task (follow-ups from the English task's reflection, Level 3)
- [x] PLAN — 2026-10-15, plan at the top of `memory-bank/tasks.md`; no creative phases
- [x] BUILD — 2026-10-15: `noImplicitAny` on (18 baseline), Russian/English counted phrases, «Ученик» → reader's word, Kazakh 195 → 0 gaps (review file `memory-bank/review/kk-review.md` — **merge waits for a native speaker**), 9 more harness scenes + a Kazakh check, materials toolbar fixed on phones, audit Chrome launcher fixed (stale browsers had been holding the port). Gates: 535 tests / 43 files, 138 browser screens clean, orange PASS.
- [x] REFLECT — 2026-10-15, `memory-bank/reflection/reflection-english-followups.md`. Main lessons: verify the audit instrument itself (stale Chrome held the port); "clipped" and "squeezed" are different checks; a fallback written into data outlives its code.
- [ ] ARCHIVE (together with the English task, after the Kazakh review)

## Task phases — English language RU/KK/EN, settings renames, white-on-orange (archive pending)
- [x] VAN — audit complete, findings in `memory-bank/tasks.md`
- [x] PLAN — replanned 2026-09-22 after the user cancelled the dark-theme part of the original request; 6-phase plan (down from 8)
- [x] CREATIVE — both flagged decisions settled (`memory-bank/creative/`):
  - **C1** (`creative-i18n-architecture.md`): hybrid `l({ru,kk,en})` helper + the existing 615 `t()` calls kept; real count is 730 sites (not ~800), and the codemod runs as two passes because 155 are KK-first with inverted operands; completeness is measured by "no Cyrillic in any `en:` value".
  - **C2** (`creative-taxonomy-english.md`): **reverses** the plan's original Phase 5a — no `name_en` DB migration; a client-side slug→English map instead, since category names are display-only (search/filter use `title`/`headline`/slug, never category name) and the tables are seed-only config.
- [x] BUILD — **complete in code 2026-10-13**: Phases 0-6, including Phase 4b (623 Russian strings written outside `l()` → 0, measured on the syntax tree) and Phase 6 (84 screens in real Chrome: 0 Cyrillic on English screens, 0 crashes, 0 sideways scrolling). Found and fixed on the way: three screens that crashed in English (404, reminder settings, slot wizard), 29 dates pinned to the Russian locale, upload cancellation recognised by a Russian error message. **Not deployed:** migration `20261003120000` is on production (2026-10-03); the 14 edge functions and the frontend are not. Commit `7b238f7` (pushed) holds Phases 0-5; Phase 4b/6 are in the working tree until the user asks for a commit. Per-phase detail and gate results are in the Build Log at the end of `tasks.md`.
- [x] REFLECT — 2026-10-15, `memory-bank/reflection/reflection-english-language.md`. Main lesson: the definition of done measured what the tooling already covered (`l()` phrases), not what a reader sees.
- [ ] ARCHIVE

## Build status (branch `английский-язык`)
- Baseline: 310 tests / 27 files, 18 pre-existing type errors, build green.
- After Phase 1: **327 tests / 28 files**, still 18 type errors, build green, `node scripts/audit-orange.mjs` passes with 0 dark-on-orange elements.
- After Phase 3: **375 tests / 34 files**, still 18 type errors, build green, and the running app verified in a real browser in all three languages with no text overflow.
- After Phase 5 + customer fixes (2026-10-03): **508 tests / 37 files**, still the same 18 type errors (diffed), build green, `deno check` adds 0 errors to the edge functions (5 pre-existing in `_shared/receipt-parse.ts`), English product page shows 0 Cyrillic in real Chrome.
- After Phase 4b + Phase 6 (2026-10-13): **522 tests / 39 files**, the same 18 type errors (diffed against the committed baseline), build green, `node scripts/i18n-raw.mjs` reports 0, `node scripts/audit-languages.mjs` passes on 84 screens, `node scripts/audit-orange.mjs` still passes.
- More permanent dev tooling from Phase 4b/6, again outside `public/` and the `src` typecheck scope:
  - `scripts/i18n-raw.mjs` (+ `.d.mts`) — the tree-based scan for Russian written outside the translation system, and for dates pinned to the Russian locale. `src/test/noRawRussian.test.ts` runs it; this is the real "is English complete" check — `i18n-todo.mjs` only ever looked inside `l({…})`.
  - `scripts/i18n-wrap.mjs` — wraps what the scan finds in `l({ ru, kk, en })` from a Russian→English (optionally Kazakh) JSON dictionary. `--keys` prints the texts still needing a translation.
  - `scripts/language-harness/` + `scripts/audit-languages.mjs` — real seller screens with a fake Supabase client and a fake signed-in seller, audited in Chrome in three languages at two widths. Start the harness first: `npx vite --config scripts/language-harness/vite.config.mts` (port 5198). A new seller screen gets a line in `SCENES` in both files; a request the fake does not answer is printed as `unanswered: <function> <action>`.
- Source files are CRLF. A script that matches multi-line text must normalise line endings first (two attempts here failed on exactly that); splicing by syntax-tree offsets, as `i18n-wrap.mjs` does, is unaffected.
- `git stash` leaves untracked files in place, so a "baseline" typecheck after stashing still sees new files — one phantom error appeared that way; compare with that in mind.
- Deno is not installed, but `npx -y deno check --no-lock <files>` works (deno 2.9.6 from npm) — the way to type-check edge functions here; compare against `git stash` to separate new errors from old.
- New permanent dev tooling, all outside `public/` and outside the `src` typecheck scope, so none of it ships or affects the build:
  - `scripts/audit-orange.mjs` + `scripts/orange-harness/` — real-Chrome colour audit.
  - `scripts/codemod-l.mjs` — the two-pass ternary rewrite, kept because it is also how a fourth language would be seeded.
  - `scripts/i18n-phrases.mjs` — the one correct way to parse an `l({…})` phrase out of source; the extract/apply/report scripts all import it, after an earlier duplicated regex mis-paired multi-line phrases.
  - `scripts/i18n-extract.mjs` / `scripts/i18n-apply.mjs` / `scripts/i18n-todo.mjs` — dump the distinct untranslated phrases, write translations back into the `en` slot only, and report what is left.
  - `scripts/shoot-languages.mjs` — screenshots the running app in every language and reports overflowing controls.
- Resolved 2026-10-03: the user said to apply what the plan wrote, so raw `#FF6B00` is now the `primary` token everywhere (guard test forbids reintroducing it).

## Repo-wide technical notes
- Test infrastructure exists: vitest + jsdom + testing-library, `npm test`. This branch started at 310 tests / 27 files — the 338 figure belongs to `предпросмотер`, whose round-2 tests are not here. Config in `vitest.config.ts`, setup in `src/test/setup.ts` (jest-dom matchers, cleanup, stubs for `matchMedia`, `ResizeObserver`, `hasPointerCapture`, `scrollIntoView` — the last two needed by Radix).
- `npx tsc --noEmit` fails on the project-references setup — use `npm run typecheck` (`tsc -p tsconfig.app.json --noEmit`).
- Baseline of 18 pre-existing type errors on this branch (`npm run typecheck`; 22 was an older count) and roughly 253 pre-existing lint problems, unrelated to this task; fix only what this task's own changes cause.
- The app cannot start without `VITE_SUPABASE_*` env vars; there is no `.env` committed (the user has one locally).
- **jsdom has no real layout engine.** This task's Phase 6 headless-Chrome matrix (ru/kk/en × two widths, five routes) exists specifically because component tests alone cannot catch layout issues — e.g. English strings running longer than Russian/Kazakh in a fixed-width button.

## Verification tooling note
Headless Chrome is installed (`C:\Program Files\Google\Chrome\Application\chrome.exe`) and can screenshot real dev-server routes: `chrome --headless=new --window-size=W,H --virtual-time-budget=20000 --screenshot=<file> <url>`. A temporary Vite entry (deleted afterward, confirmed via `git status`) can render real components without logging in, driven over the Chrome DevTools Protocol for both a screenshot and hard geometry (computed styles, element rects). Temporary files must live outside `public/` — anything there ships in the production build. Under PowerShell use `Start-Process -Wait -PassThru`; a plain `&` call reports a spurious exit code 1.

## Branch note
This branch was created as `темная-подсветка` for a dark-theme task, then renamed to `английский-язык` once the user dropped the theme and kept only the translation work (2026-09-22). It branches from `предпросмотер` (not `main`) deliberately — Phase 4b of this task's plan and the white-on-orange sweep both touch files `предпросмотер` already rewrote (`CreatorProductsTab.tsx`, `dialog.tsx`), so stacking avoids a later merge conflict. `предпросмотер` should be merged to `main` reasonably soon; once it is, rebase this branch onto `main`.
