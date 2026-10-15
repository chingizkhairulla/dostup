# Reflection: English language (RU/KK/EN), settings renames, white-on-orange

**Level 4** · branch `английский-язык` · 2026-09-22 → 2026-10-13
Commits: `ce29af1` (plan) · `ed75221` (Phases 0–4) · `7b238f7` (Phase 5, one orange, customer fixes) · `1c631d4` (Phase 4b, Phase 6), all pushed.
Size: 151 files, +7915 / −2046 since the plan commit.
**Status: done in code, not deployed.** The migration is on production (2026-10-03). The 14 edge functions and the frontend are not deployed yet.

## Summary

All four of the customer's requests are built:

1. **Settings renames.** «Скачать приложение» / «Уведомления», plus the same in Kazakh and English.
2. **English across the platform.** This covers the interface, dates, plurals, category names and server-generated push and email text. It is built as a system: one `LANGUAGES` list, so a fourth language is a list entry plus whatever the compiler then names.
3. **Header toggle.** It now reads `RU / KK / EN`.
4. **White text on orange.** This was already true almost everywhere. A runtime audit proved it, three latent ways it could break were closed, and the two oranges in the code were unified into one token.

Final gates:
- **Tests:** 522 / 39 files (baseline 310 / 27).
- **Typecheck:** the same 18 pre-existing errors, diffed against the baseline.
- **Build:** green.
- **Source scan:** 0 raw Cyrillic outside the translation system.
- **Browser audit:** 84 real-Chrome screens with 0 Cyrillic on English screens, 0 crashes and 0 sideways scrolling.
- **Orange audit:** passes.

## Plan vs. what happened

| Plan | Outcome |
|---|---|
| Phase 1: white on orange, then unify `#FF6B00` → token | Done. The unification was first **deferred** as a visible brand change, then applied on the user's word (2026-10-03). |
| Phase 2: renames | Done as planned. |
| Phase 3: `l({ru,kk,en})` + codemod of ~800 ternaries | 730 real sites; codemod in **two passes** (C1) because 155 were KK-first. Slot tests verified no RU/KK swap. |
| Phase 4: English for every phrase | Done for `l()` phrases. **But it was reported as "0 still Russian" when ~600 strings outside `l()` remained** (see Lessons 1). Corrected 2026-10-03, finished as Phase 4b. |
| Phase 5a: `name_en` taxonomy migration | **Cancelled by C2.** A client-side slug→EN map replaced it, with no production schema change. |
| Phase 5b: recipient language on `profiles` | **Changed in the build.** Pushes are addressed to `push_tokens`, not profiles. So the language lives on `push_tokens` (per device) and on `profiles` (email only). |
| Phase 6: screenshot matrix on 5 routes | **Bigger than planned:** a reusable harness with 14 scenes × 2 widths × 3 languages and pass/fail rules. It needed no login and could not touch production. |
| Dark theme | Cancelled by the user before the build. Not built. |

## What went well

- **Measuring before deciding paid off repeatedly:**
  - The KK-first inversion was counted (155) before the codemod existed. That is why it ran in two passes and nothing swapped.
  - C2 read the search function and the seed data before writing the taxonomy migration. That removed a production schema change entirely.
  - The orange audit measured that the two oranges have identical luminance. So the unification was safe for contrast, and the only question was taste.
- **Guards that fail on the shape of the defect, not on a list of known instances.** Examples: `Translated` makes `en` mandatory; `Record<Language, …>` tables; the slot-alphabet tests; `noRawRussian.test.ts`; the pinned-date check; the raw-orange-hex check. Each one fails on the next occurrence, not just on the ones already found.
- **Tooling caught its own bugs before writing anything:**
  - The codemod's post-condition refused files on a false alarm. Investigating that alarm fixed the condition.
  - `i18n-apply`'s Cyrillic-only-decreases check would have refused a mis-paired rewrite.
  - The wrapper refuses data positions (`===`, `case`, `.includes()`) instead of guessing.
- **Real defects surfaced as side effects of doing the job properly:**
  - Three screens crashed in English.
  - An upload cancel was detected by a Russian error message.
  - 29 dates printed in Russian in every language.
  - `trial_already_used` was shown raw.
  - A product title was interpolated unescaped into email HTML.
  - The Russian materials plural was always «материала».
- **No production risk was taken without the user:**
  - Migrations were prepared as additive files.
  - The one apply was done on instruction and verified afterwards.
  - Deploys are still the user's call.
  - The browser harness swaps out the Supabase client, so it cannot reach production.

## Challenges

- **The definition of done measured the tool, not the reader.** This is the big one; see Lessons 1.
- **No `strict` mode.** Indexing a `{ ru, kk }` table by `language` compiled, then threw at run time. The type system that was supposed to make English mandatory had a blind spot exactly where hand-written tables lived.
- **Regex-parsing source code broke twice.**
  - A lazy `.*?` let a multi-line phrase pair its `l({` with a far-away `})`.
  - Nested templates hid two `en` slots that still held Russian.
  - Both were solved properly only by switching to the TypeScript syntax tree (`i18n-raw.mjs`).
- **Russian that exists only at run time.** `{ locale: ru }` in date-fns and `"ru-RU"` passed as a value contain no Cyrillic in the source, so no text search finds them. Only a different detector (by shape) and a real browser did.
- **Environment friction.** Source files are CRLF, so three ad-hoc replace scripts failed on multi-line matches. One shell heredoc hung. `git stash` left untracked files in place and produced a phantom baseline type error. None of these cost correctness, but each cost a round-trip.
- **Seller screens need a login.** Phase 6 was blocked on that until the harness approach: swap only the data client and the auth context, and keep everything else real.

## Lessons learned

1. **A completeness metric must be taken from where the reader is, not from where the tooling already looks.** C1 defined "done" as "no Cyrillic in any `en:` slot". That was correct for what it measured, but it measured only text that had already gone through `l()`. So it reported 0 while ~600 strings had never entered `l()`. The fix was to measure the source as a whole (the syntax-tree scan) and the rendered page (the browser audit). Next time, define done as "what a reader in language X can see" and build the instrument for that before reporting a number.
2. **Never report a figure from a partial instrument without naming its scope.** "0 still Russian" should have read "0 of the `l()` phrases". The correction is recorded in the Build Log, but the overstatement reached the user first.
3. **Without `strict`, type every per-language table explicitly** (`Record<Language, …>`). Otherwise "a fourth language cannot compile without its text" is only true for `Translated`, not for tables written by hand.
4. **Do not use display text as a control signal.** Comparing an error message with «Загрузка отменена» is invisible until the message is translated. Then it silently changes behaviour. Use an error class or a code.
5. **Parse code with a parser.** Two regex mis-parses and one blind spot all disappeared with the TypeScript AST, which was already a dependency.
6. **A browser check is cheap once the harness exists, so build it early.** Swapping one data module gave real components, real CSS and real layout with no login and no production access. If it had existed after Phase 3, the English crashes and the run-time Russian dates would have shown up a phase earlier.
7. **Leave behaviour you were not asked to change alone, and make the gap measurable instead.** Kazakh stayed as it was where no Kazakh existed. The gap is now a number (207 of 1049 phrases), not a vague worry or ~200 unreviewed strings in production.

## Process improvements

- **Run the real-browser audit as part of every phase that touches visible text.** Do not save it for a final verification phase.
- **State the instrument and its scope next to every "N left / 0 left" figure** in the Build Log.
- **When a test-first step is skipped, say so in the log.** This was done for the server messages and the wrapper script; keep doing it.
- **Normalise line endings in any throwaway edit script, or splice by syntax-tree offsets.** In this repo, prefer the Edit tool for multi-line hand edits.

## Technical improvements (follow-ups, not done here)

- **Kazakh gap: 207 phrases**, mostly `CreatorProductsTab` (105) and `ProductMaterialsManager` (33). `i18n-wrap.mjs` already accepts `kk`, so this is translation work, ideally with a native reader.
- **Turn on `noImplicitAny` (or `strict`) gradually**, at least for language tables. That would have caught all three crashes at compile time.
- **Harness scenes for the screens it does not cover yet:** teacher dashboard, buyer dashboard tabs, seller notifications, pending payments.
- **Server-returned error texts** that are not covered in Phase 5 still reach toasts in Russian.
- **Pre-existing defects noticed and not changed:**
  - Russian «1 слотов» plurals.
  - The `capitalize` class on the schedule day heading.
  - The trash badge that does not fit at 390px.
  - Creator pushes sent to every creator device.
  - `process-subscriptions` passing a profile id as a `push_tokens.user_id`.
  - The `20260917120000` migration version collision.
- **Five unused files** (`ProductScheduleManager`, `AnnouncementEditor`, `CheckoutPage`, `SetupPasswordPage`, `AuthPage`) could be deleted. A test currently keeps them honest.

## Next steps

1. `/archive` this task.
2. Merge `предпросмотер` into `main` first (this branch grows from it).
3. Merge `origin/main` into `английский-язык`. 19+ files conflict, and `CreatorAnnouncementsTab.tsx` was deleted in `main`. After the merge, `noRawRussian.test.ts` lists any Russian that `main` brings in.
4. Open the PR named after the task.
5. On the user's word only:
   - deploy the 14 edge functions, then the frontend (the migration is already in place);
   - re-run `audit-languages.mjs` against the merged code.
