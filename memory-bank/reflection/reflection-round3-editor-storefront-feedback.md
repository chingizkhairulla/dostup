# Reflection: Round 3 — customer feedback on the editor, product page and storefront

Task: customer feedback round 3 (`memory-bank/tasks.md`) · Level 3 · 2026-09-29 · branch `предпросмотер`
Creative: `memory-bank/creative/creative-round3-editor-exit-and-back-button.md`

## Summary
The work covered 17 customer requests across three screens:
- **Editor window:** heading sizes, a 40/60 split, a centred viewport toggle, placeholder preview, Details open on create, renames, the crop window on top of the editor, a full-screen editor, and a two-click exit with a red hint.
- **Product page:** Report at the bottom, a smaller title, a history-aware sticky back button, a sticky purchase card, and no username or access lines.
- **Storefront:** a back button, rating and sales always shown, and a clear "visible to buyers" note in settings.

In `/creative` the user also asked to drop autosave in **both** modes. That reversed decisions made in rounds 1 and 2.

Everything except deployment is implemented. **345 tests pass** (338 at baseline; the autosave tests were removed and new ones added). Typecheck has no new errors (16, down from 18). The build is green. Layout was verified in headless Chrome at 1440/1280/1024/390. **Deployment was handed to the user**: the migration and two edge functions are not applied by Claude. Nothing is committed.

## Compared with the plan
| Plan item | Outcome |
|---|---|
| P0 baseline | As planned. |
| P1 editor chrome | Done. **Deviation:** the heading went to `text-xl`, not `text-lg`. The browser measurement showed 18px was barely larger than the old 16px, and the customer asked for "больше". A4 (desktop preview scroll) was **measured as already working**, so no code change was made. |
| P2 placeholders | Done as planned, for title, headline and description only. Price shows "0 ₸" rather than a placeholder. |
| P3 crop / close | Done. **Deviation from creative:** the cross is absolutely positioned in the dialog corner instead of sitting in the preview bar's `headerRight`. On a phone the editor tab hides the preview pane, so the cross would have disappeared with it. This was found while wiring the component, before any test ran. **Scope grew** at the user's request: autosave was removed from edit mode too, so `useAutoSave`/`AutoSaveIndicator` were deleted outright. |
| P4 product page | Done. The sticky root cause predicted in `/plan` (sticky element inside an aside only as tall as itself) was confirmed in the browser: the card's `top` stays constant after the fix. |
| P5 back button | Done. The placement changed in `/creative` from "side gutter" to "where it is today", after the user sent the customer's full-size screenshot. |
| P6 storefront | Done. Most of it already existed; the change was the two "always show" rules and a more prominent settings note. |
| P7 deploy | **Not done by Claude.** The CLI was not logged in, and `npx supabase login` cannot run through `!` (non-TTY). The user chose to deploy themselves. |
| P8 verification | Done, with the gaps listed below. |

## What went well
- **The regression test came first and failed for the right reason.** The crop tests failed on the old code with "the editor dialog is gone", which is exactly the customer's report. They pass on the new code.
- **The sticky bug was diagnosed from the code during planning**, not by trial and error, then confirmed by measurement: the card `top` was 137px at scroll 0, 400 and 1500 on all three desktop widths.
- **The audit reframed the storefront work.** Year, bio, sales, rating and the settings field already existed; what blocked the customer was the undeployed migration. That kept C to a few small changes and put the real blocker (deploy) in front of the user early.
- **Measure-before-change paid off twice.** A4 turned out not to need a fix, and the heading size was corrected upward after seeing real pixels.
- **Dead code went with the feature.** Removing autosave also removed `CROP_DIALOG_CLASS`, `isCroppingMedia`, `onCroppingChange`, `previewHidden`, 8 unused translation keys, and 2 pre-existing type errors in the deleted access-line code.

## Challenges
- **Stale Memory Bank state.** At the start of the session I reported the dark-theme task as active on this branch. It had been cancelled, and the English task lives on `английский-язык`; `tasks.md` here was an old copy. I corrected this during `/archive`, but the first answer was wrong.
- **Shell tooling cost several iterations.** In this environment, heredocs passed through the Bash tool broke on apostrophes and collapsed `\\` to `\`. The result was a truncated `afterEach`, regexes that matched nothing (a test that failed for the wrong reason until checked), and a syntax error. Writing scripts with the Write tool and running them fixed it.
- **Radix and jsdom.** While the nested crop dialog is open, Radix sets `aria-hidden` on the editor, which blanks its accessible name, so `getByRole("dialog", { name })` fails even with `hidden: true`. The test now asserts on content.
- **Reference images arrived as 128×80 thumbnails** in `/plan`. Only the later full-size screenshot settled the back-button position.
- **Deploy tooling was assumed, not checked, in `/plan`.** The plan listed CLI commands without first confirming the CLI was authenticated or that login works non-interactively here.

## Not verified / known gaps (be honest)
1. **The real `ProductForm` in the new window was never rendered in a browser.** It sits behind a seller login. The browser harness used stand-in sections around the real `ProductEditorLayout`, `EditorCloseButton` and `EDITOR_DIALOG_CLASS`. The real form is covered only by jsdom tests: the crop flow, save, close.
2. **No real phone and no real backend.** The save path is tested against mocked mutations.
3. **Deployment is not done.** Until the user applies the migration and deploys `manage-profile` / `manage-products`, the storefront metrics and private-by-default are not live.
4. **A dirty-check edge case.** The baseline is captured when the window opens. If the category taxonomy loads *after* opening, the key changes and an untouched window would show the exit hint once. That is a harmless false warning, but it is not tested.
5. **Orphaned uploads.** In edit mode a picked photo is uploaded to storage immediately and written to the product only on "Сохранить". Discarding with the cross now leaves the file in storage. The behaviour existed before, but it is more likely now that edits can be discarded.
6. **The exit-hint rule deviates from the customer's literal words.** It shows only when there are unsaved changes. The user was told; it is a one-line switch if they want "always".
7. **The test count went 338 → 345**, but that is not "7 new tests". About 25 autosave-specific tests were deleted and about 32 added. The deleted ones covered behaviour that no longer exists.

## Lessons learned
- **Check the branch a Memory Bank belongs to** before reporting its tasks. Files can be stale copies from a sibling branch; `git show <branch>:memory-bank/tasks.md` settles it.
- **A UI control placed in a pane disappears with that pane.** When a layout has modes that hide panes (the phone tabs), window-level controls belong to the window, not to a pane's slot.
- **jsdom + Radix nested dialogs:** assert on DOM content or order for layers underneath the top dialog, not on accessible names.
- **Plan the deploy's prerequisites, not just its commands.** Check auth, whether an interactive login works in this environment, and the account's role, before promising a deploy phase.

## Process improvements
- Write any multi-line script or test content through the Write tool, never through a Bash heredoc, in this environment.
- Add a "tooling preflight" line to `/plan` for any phase that needs external access (CLI login, tokens, passwords).
- When a creative decision is overridden during build (the cross placement here), record it in `tasks.md` in the same step. That was done here.

## Technical improvements (candidates, not done)
- Clean up orphaned storage uploads when an edit is discarded, or upload only on save.
- Recompute the dirty baseline when the taxonomy finishes loading, if the window is still untouched.
- Placeholder for the price in the empty preview, if the customer wants it.
- `CreatorProductsTab.tsx` is still ~3,100 lines. Extracting the editor window would allow a browser check of the real form without a seller login.

## Next steps
1. User: apply the migration and deploy `manage-profile`, `manage-products`. If the migration goes through the SQL Editor, run `migration repair`.
2. User or customer: check the product window, especially picking a cover, on a real phone through the tunnel.
3. Decide on the exit-hint rule (only when there are changes vs always).
4. Commit on `предпросмотер` when the user asks.
5. `/archive`.
