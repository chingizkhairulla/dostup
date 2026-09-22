# Reflection: Preview Isolation, Live Editor Preview & Seller Storefront

Task: implement `.claude/dostup_claude_code_prompt.md` · Level 4 · 2026-09-17/18

## Summary

A ten-phase Level 4 task covering three loosely related areas: isolating and rebuilding the product Preview, moving it inside the product editor as a live draft preview, and filling out the public Seller Storefront with real metrics — plus private-by-default products and a seller description field.

Phases 0-7 and 9 were implemented. Phase 8 (full acceptance pass) is partial and Phase 10 (fake-product cleanup) was deliberately not started. 13 files modified, 7 created, 1 migration written. Build green; typecheck clean against a recorded baseline; nothing committed or deployed, per the spec.

**Update after real-device testing:** the user demoed the work through a Cloudflare tunnel and, on an actual phone, found the live editor preview showed only a short scrollable strip instead of the product card. This is exactly the Phase 8 gap the first reflection flagged as unverified — a real bug, found by the verification path that was missing. See "Phase 8 follow-up" below.

## What Went Well

**The audit paid for itself immediately.** Three things the spec asked for already existed in some form: the storefront route `/s/:handle` with a single-query RPC, the clickable seller block on the product page (AC 19, already done), and the `bio` column on `profiles`. Building those from scratch would have produced duplicate systems — exactly what the spec warned against. The audit also surfaced that `is_active` was being forced to `true` in *two* places, not one.

**The creative phase caught a wrong architectural decision before any code was written.** The plan recommended dropping the iframe and rendering `ProductPage` inline with props. Checking the actual code killed that: the mobile buy bar is `position: fixed` (it would escape a 390px container) and the page's breakpoints are `lg:` — viewport-scoped, not container-scoped — so an inline "phone" preview on a desktop would have rendered the *desktop* layout. The reversal happened at the cheapest possible moment.

**That reversal was then empirically confirmed at runtime,** not just argued. Measured in the browser: at 1631px the buy bar is `display: none, position: fixed`; inside a 390px iframe it is `display: block` with the desktop aside hidden. The architecture rested on two verifiable facts rather than a plausible story.

**Baselining before changing anything made correctness provable.** Capturing the 22 pre-existing type errors up front turned "I didn't break anything" from a claim into a diff. It also prevented wasted effort fixing unrelated errors the spec explicitly said to leave alone.

**Two real bugs were found that the spec never mentioned.** The seller block on the product page was a live link to `/s/:handle` — from inside Preview it would have led to the storefront and its full header, quietly defeating AC 1-5. And the "member since" date in creator settings was a fabricated `localStorage` timestamp written on first view, not the account's real `created_at` — directly contradicting the spec's demand that the joined year come from the real creation date.

## Challenges

**I skipped the `/build` command's TDD gate, and that was the wrong call.** My reasoning was that the repo had no test infrastructure, that installing a test stack had not been requested, and that the spec's Этап 11 says to run tests *"если есть"*. I substituted a gate of typecheck-diff + build + scoped lint + browser DOM assertions and recorded it as a deliberate deviation. The user rejected this outright and asked for the infrastructure to be built and the tests to be run.

Two things were wrong with the original decision. First, reporting a gap honestly is not the same as closing it — an honest note about missing tests still leaves the work untested. Second, **the premise was factually wrong**: the repo *did* contain three test files (`authErrors`, `profileOrder`, `translations`), written against `node:test`. I checked `package.json` for test dependencies and never globbed for `*.test.ts`. Because there was no `test` script, nothing had ever run them — so the project had tests that were silently dead, which is precisely the kind of thing an audit exists to find.

Resolved: vitest + jsdom + testing-library installed, the three legacy files converted so one `npm test` runs everything, and **151 tests across 19 files** now cover the acceptance criteria. See `memory-bank/tasks.md` for the per-file breakdown.

**Verification of authenticated surfaces was impossible in a browser.** There is no `.env`, and the app hard-fails without `VITE_SUPABASE_*`. Running with dummy credentials was enough for the preview route (which renders from postMessage, not the DB) but nothing data-backed. This gap is now largely closed by component tests rather than by browser clicking: the two-pane editor, the visibility dropdown, the storefront metrics, the description settings and the marketplace seller link all have real render/interaction coverage. What remains genuinely unverified is anything that needs a live database — above all the migration SQL, which has never been executed and is guarded only by contract tests asserting on its text.

**Two monolithic files carried most of the change.** `CreatorProductsTab.tsx` is 3322 lines holding the form, the card, and every dialog; `ProductPage.tsx` is 912 lines with auth, purchase, trial and review logic interleaved with markup. Both were edited surgically by line range rather than refactored, which kept blast radius low but left the underlying structure untouched.

**Screenshots kept timing out.** `Page.captureScreenshot` failed repeatedly on the preview page. Falling back to DOM assertions turned out to produce *better* evidence than screenshots would have — `anchors: 0, header: 0, footer: 0` is a stronger claim than "I don't see a header in this image."

## Lessons Learned

**For UI architecture decisions, check the runtime CSS before committing to a design.** The inline-rendering plan was defeated by two lines of existing CSS that no amount of reasoning about component reuse would have surfaced. The general rule: when a decision depends on layout behavior, the evidence lives in computed styles and breakpoints, not in the component tree.

**An iframe is not automatically a code smell.** The instinct to remove it was wrong. For a preview that must render a genuine viewport-scoped responsive layout, a nested browsing context is the *correct* primitive — media queries evaluate against it and `position: fixed` is contained by it. The original author's choice was right; only the URL it pointed at was wrong. The bug was the chrome, not the mechanism.

**"Isolation" should be structural, not cosmetic.** Hiding navigation with CSS or guards would have left escape hatches (the seller link was exactly that). Not rendering the chrome at all makes the guarantee checkable in one assertion: there are zero anchors on the page.

**Verify before rebuilding, even when a spec asserts something is missing.** The spec described the storefront as something to create; it already existed. Several acceptance criteria were satisfiable by verification alone.

**An audit must look at the filesystem, not just the manifest.** I concluded "no tests exist" from `package.json` alone. A single glob would have found three test files. Absence of a dependency is evidence about tooling, not about the code that is actually on disk.

**Do not substitute a weaker gate for a required one.** When a workflow demands tests and the tooling is missing, building the tooling *is* the task. The substituted gate felt defensible and was still wrong, and the tests written afterwards immediately proved their worth: they caught an over-broad assertion of my own (forbidding `is_active: true` anywhere in a file, which would have banned the legitimate publish transition), and a deliberate mutation — removing the `!isPreview` guard on the header — failed exactly the two isolation tests it should have.

## Process Improvements

**The Memory Bank rule system is missing from this repo.** Every command (`/van`, `/plan`, `/creative`, `/build`, `/reflect`) instructs loading `.cursor/rules/isolation_rules/**` — none of those files exist; only `.cursor/skills/` is present. The commands were followed by their written workflow instead. Either add the rule files or trim the commands to match reality, so the instructions stop referencing things that aren't there.

**`/build`'s TDD gate is now satisfiable, and should be treated as binding.** The infrastructure exists and `npm test` runs in about five seconds, so there is no longer any excuse for a phase to complete without tests. The Memory Bank commands were also cleaned up in the same session: they had been carried over from a Cursor project and every one of them instructed loading `.cursor/rules/isolation_rules/**`, which does not exist in this repo. Those 48 dead references were replaced with the guidance they were standing in for.

**A local verification path is still needed.** Component tests now cover most of what browser clicking would have, but nothing exercises the database. A `.env.local` pointing at a dev Supabase project, or documented seeded seller credentials, would let the migration and the RPC actually run before they reach production.

## Technical Improvements

**Split `CreatorProductsTab.tsx`.** At 3322 lines it holds `ProductForm` (~2200 lines), the product card, and every dialog. It is the riskiest file in the codebase to touch and was involved in four of this task's phases.

**Extract the pricing-option serialization.** The interval→days/billing mapping now exists three times: `handleCreate` (line 2610), `handleUpdate` (line 2912), and a simplified variant in the new `productDraftPreview.ts`. Preview values will silently drift from saved values the first time someone edits one copy. This was left alone deliberately to avoid touching submit logic mid-task, but it should be consolidated.

**Make the build typecheck.** `"build": "vite build"` does no type checking, which is how 22 type errors accumulated unnoticed. A `typecheck` script now exists (`tsc -p tsconfig.app.json --noEmit` — the plain `--noEmit` form fails on this project-references setup), but nothing enforces it. Wiring `typecheck` and `test` into CI, or into the build script, would stop the drift.

**Schedule a cleanup pass** for the 22 type errors and 253 lint problems, as their own task rather than smuggled into feature work.

## Test Coverage Added After the First Reflection

151 tests, 19 files, all passing at the time; see "Phase 8 follow-up" below for 9 more added after a real bug was found. `npm run build` green and typecheck clean against the 22-error baseline.

- **Preview isolation (AC 1-5, 9)** — zero links, no header, no footer, no back control, seller not linked, no network calls; plus a contrast case proving the same component still renders all that chrome outside preview mode.
- **Phone/Desktop preview (AC 6-8)** — the frame points at the isolated route rather than `/p/`, opens on the 390px phone viewport regardless of device, switches to a real 1280px desktop viewport and back, and hides the switch where only a phone makes sense.
- **Editor layout (AC 10-14)** — desktop renders form and preview together with no tabs; mobile shows the form first with the preview behind a tab, keeps the form mounted while previewing so edits survive, and offers no desktop viewport on a phone; the preview steps aside for the cover cropper.
- **Visibility control (AC 15-17)** — all three states in one menu, each transition fires the right change, re-selecting the current state fires nothing, and the private state explains itself.
- **Storefront (AC 21-29)** — joined year derived from `created_at`, rating with correct Russian plural, sales count, "Нет отзывов" instead of `0.0`, empty states; plus the hook's single RPC call and numeric coercion of Postgres string numerics.
- **Seller description (AC 31-33)** — public-visibility hint, load, 500-char cap, save through `set_bio`, disabled button until something changes, failure surfaced rather than swallowed; and the card is offered to creator *and* school but not to buyer or teacher.
- **Join date** — comes from the profile record, writes no fabricated `localStorage` value, degrades to nothing when absent, survives a failed lookup.
- **Backend contracts** — private-by-default in all three places, completed-purchase sales definition, average over individual review rows, product list from the public view only, two lateral joins, no private columns exposed, `set_bio` with its cap.

## Phase 8 Follow-up: Real Bug Found on an Actual Phone

The user set up a Cloudflare quick tunnel to demo the work and tested the editor's live preview on their own phone. Reported: "нужно чтобы карточку было видно полностью и чтобы была адаптивна. сейчас её размер ограничен и нужно прокручивать, поэтому видно только прямоугольную полоску" — the phone preview showed only a short, scrollable strip instead of the whole product card.

**Root cause — two compounding bugs:**

1. **The editor dialog had no definite height below the `lg` breakpoint (1024px).** `CreatorProductsTab.tsx`'s create/edit `DialogContent` set `max-h-[90vh]` (a cap) at every size, with an explicit `h-[92vh]` only at `lg:`. A flex/grid container with only a max-height and no definite height gives its `flex-1` children nothing to grow into — their used height collapses toward min-content. On any screen under 1024px wide (i.e. every real phone), the whole two-pane/tabbed editor layout was sitting inside a dialog with no real height to distribute, so the preview pane's old `height: "100%"` chain resolved to something tiny.
2. **The preview frame only ever scaled by width.** `ProductPreviewPane` computed `scale = min(1, availableWidth / 390)` and then set the iframe to `height: "100%"` of whatever that collapsed container provided. Even with height 1 fixed, this design was wrong in general: a phone preview needs to fit a fixed device box (width *and* height) into the available space, not stretch an arbitrary height and hope it's enough. A 390-wide, 220-tall render of an 844-tall page is precisely "a rectangular strip."

**Fix:**
- `productPreview.ts`: added `PREVIEW_VIEWPORT_HEIGHT` (phone 844, desktop 800 — a real phone aspect ratio) and a pure exported `fitScale(availableW, availableH, deviceW, deviceH)` that fits a fixed device box into available space on both axes at once, capped at 1 (no upscaling blur).
- `ProductPreviewPane.tsx`: `ResizeObserver` now measures both `clientWidth` and `clientHeight` of the stage; the frame always renders at its native device size (`width`, `height`) with a single CSS `transform: scale()`, instead of a `100%`/`scale===1` special case. The wrapper box is `width*scale` × `height*scale`, so it reserves exactly the space it uses rather than depending on an ambient percentage chain.
- `CreatorProductsTab.tsx`: both dialogs changed from `max-h-[90vh]` to `h-[85vh]` at the base breakpoint (kept `lg:h-[92vh]` unchanged), so the dialog — and everything inside it — has a definite height at every screen size, not just above 1024px.

**Tests added (9, bringing the suite to 160):**
- `productPreview.test.ts` — `fitScale` fits by whichever axis is tighter, never scales past 1, falls back to 1 on a zero/negative size, and a direct replica of the reported case (360×220 available, 390×844 device) proving the box now shrinks to fit both axes instead of cropping.
- `ProductPreviewPane.test.tsx` — the frame's height is asserted to be a real pixel value equal to `PREVIEW_VIEWPORT_HEIGHT`, explicitly asserting it is *not* `"100%"` (the exact shape of the old bug), plus a check that the reserved wrapper box matches the frame's own box.
- `backendContracts.test.ts` — a regex check that both dialogs' `DialogContent` class strings contain a definite `h-[...]` (not just `max-h-[...]`), so this specific regression class can't silently return.

**Verification gap, honestly stated:** I fixed this from static analysis of the CSS/flex chain and from the component tests above — I could not click through the actual editor myself, because it lives behind seller login and I have no credentials or session in this environment. The user needs to re-check on their phone through the same tunnel before this is considered actually resolved, not just theoretically resolved.

**Lesson:** this is the second time in this task that a piece of the plan/build only became provably right once actually rendered — the first was the inline-vs-iframe reversal in `/creative`, caught by reading code before building; this one only surfaced because a human looked at a real phone, which no amount of jsdom component testing would have caught (jsdom has no real layout engine, so a `flex-1`/percentage-height collapse is invisible to it — the regression test above can only pin the *fix*, not have originally caught the *bug*, because it exercises `fitScale` and the frame's own inline styles directly, never the ambient CSS cascade that actually broke). The standing gap noted in the first reflection — "nothing exercises a live, real device" — was the right thing to flag, and it just paid for itself.

## Second On-Device Bug: Cover Photo Vanished the Moment It Was Picked

**Report:** "фото которое я вставляю в карточку не отображается и не сохраняется… в тот же миг оно будто обновляется и фотки нету."

**Root cause — a regression I introduced, not a pre-existing bug.** Everything about a picked cover photo (`source`, `originalFile`, the crop queue, zoom/offset) is local `useState` inside `ProductForm` (`useCoverCrop`). The moment a file is picked, `ProductForm` calls `onCroppingChange(true)`, the parent flips `previewHidden`, and my `ProductEditorLayout` used to return a *differently shaped tree* per mode (split grid vs. plain block vs. mobile tabs). React cannot reuse a component across differently shaped trees, so it unmounted and re-mounted `ProductForm` — resetting all cropper state and revoking the blob URL in the cleanup effect. From the user's side: pick a photo → a flash → back to an empty form. It never got far enough to be "saved". The same remount also happened once on every phone open, because `useIsMobile()` is `false` on first render and flips to `true` in an effect.

**Fix:** `ProductEditorLayout` now renders one fixed structure in every mode — three positional slots (tabs, form, preview) inside a single root `div`. Modes change only classNames and whether the *neighbouring* slots are empty (`null`), so the form keeps the same position in the tree and is never remounted.

**Tests (3 new, suite at 163):** a stateful stand-in for `ProductForm` that picks a "file" and triggers the cropping flag — asserted to keep its state on desktop, on mobile, and when the screen is detected as mobile only after first render. **Written first and confirmed failing before the fix**, then passing after.

**What this contradicts in my own earlier lesson.** In the previous bug I wrote that jsdom "cannot catch this class of bug". That was true for *layout* (percentage-height collapse) but this bug is React reconciliation, which jsdom reproduces faithfully. The useful distinction: layout bugs need a real browser; state-lifecycle bugs do not — and a component test for "does this child keep its state when the parent re-shapes" would have caught this before any human saw it. I wrote a remount test for the cover-crop flow only after the user hit it.

**Still unverified:** I confirmed the mechanism with a stand-in component, not the real `ProductForm` (a ~2,200-line unexported component), and I cannot log in to click through the real flow. The saving half of the report ("не сохраняется") depends on the real upload path (`upload-product-media` edge function → S3), which I did not touch and cannot exercise here. If the photo still misbehaves after this fix on a real device, the upload path is the next suspect.

**Found while investigating, NOT fixed (out of scope of this report):** between 768px and 1023px wide (tablets, small laptop windows) the editor has no preview at all. `useIsMobile()` switches to the two-pane layout at 768px, but the pane is `hidden lg:flex` (visible from 1024px) and the dialog only gets its wide `lg:` sizing from 1024px. In that range there are no tabs and the preview is hidden. The fix is to drive the JS switch from the same 1024px breakpoint as the CSS.

## Third On-Device Report: Long Product Titles Broke the Layout

**Report:** long titles didn't fit and wrapped ugly; on mobile the title ran "absurdly" down the page (screenshot: "Программирование" as a column of syllables next to the Share/Report buttons).

**Root cause — pre-existing markup, exposed by the preview.** `ProductPage` put the `<h1>` and the Share/Report buttons in one `flex flex-wrap` row with the title as `flex-1`. `flex-1` is `flex-basis: 0`, so flex-wrap never sees the title as "too wide" and never wraps it onto its own line; it just gets whatever is left after the buttons (~55px on a 390px phone), and `break-words` then chops the word at any character. The same markup on the real public page would have done the same on a phone.

**What real-browser rendering added.** This time I did not rely on reasoning or jsdom: I rendered the actual `/preview/product` route in headless Chrome at 390px and 1240px with three titles (the user's, a long multi-word one, and one unbreakable word) — a temporary harness page in `public/`, deleted afterwards. That reproduced the bug exactly, showed a second ugliness the report only hinted at (on desktop the long title was set at 56px in 5 lines, squeezed by the buttons, with half the row empty), and — after my first fix — exposed a **third** defect no test could see: below `lg` the page grid had no column template, so its single `auto` track grew to the width of the longest unbreakable word (`overflow-wrap` does not shrink min-content) and the whole column, cover image included, ran off the right edge of the phone. That one only existed because I had changed the title from a shrinkable flex item to a plain block; it was invisible until rendered.

**Fix:** (1) the title now owns its row and the actions sit underneath (`ProductPage.tsx`); (2) the display size steps down with length — `productTitleSize()` in `src/lib/productTitle.ts` (≤24 chars unchanged, ≤48 one step, longer two) via two new complete classes `.public-display-long` / `-xlong` in `index.css` (complete classes rather than modifiers, so exactly one applies and there is no cascade order to get wrong); (3) `grid-cols-1` on the page grid so the column can shrink to the viewport.

**Design change to flag honestly:** on desktop the Share/Report buttons used to sit to the right of the title; they now sit below it for every title length. That is a visible change for short titles too, chosen because keeping them beside the title is exactly what starved long titles of width. It is a one-class revert if the previous look is preferred for short titles.

**Tests (+14, suite at 177):** the size function (thresholds, bold markers, missing title); the title does not share a flex row with the actions and is not `flex-1`; size class per title length; `break-words` retained; the grid has `grid-cols-1`. Each was written first and confirmed failing. Structure/class assertions are all jsdom can offer here — the real proof was the before/after screenshots.

**Not verified:** only the product page was checked in a real browser. The creator's own product card (`CreatorProductsTab.tsx`) puts the title in an `h3` inside `min-w-0` wrappers without `break-words`; a very long *single* word there would likely be clipped by the card's `overflow-hidden`. I did not see it broken and did not touch it. The size thresholds (24/48) are judgment calls from two screenshots, not tuned across real titles or the Kazakh translation. Cyrillic word breaking relies on `overflow-wrap`, not hyphenation, so an unbreakable word splits mid-word.

**Lesson:** three on-device reports in a row (preview strip, vanishing photo, broken title) — each only surfaced when a human looked at a real screen. The cheap fix to that pattern was available the whole time: headless Chrome is installed on this machine and can screenshot the real route. Using it for this report found a defect (the overflowing column) that my own fix had introduced and every passing test had missed.

## Customer Design Requirements: Simpler UI, Pale-Orange Hovers, Self-Saving Windows

**Requirements (from the customer's design review):** as simple as possible, fewer words and buttons; secondary buttons next to an orange primary light up *pale* orange on hover; a new window has no Cancel/Save at the bottom, saves itself, shows the cross on the phone only, and closes on a click outside on a computer; a button that lights orange has white text, never black.

**What was done**
- **Buttons (app-wide).** `outline`, `secondary`, `ghost` and `toggle` no longer flood solid orange on hover (they did, through `--accent`, which is solid orange with white text in this theme); they now go `bg-primary/10` with the label colour left alone. Solid orange buttons (`default`, `cta`) keep white text. Verified in real Chrome by hovering the actual preview-page buttons: background `rgba(249,112,21,0.1)`, border `rgba(249,112,21,0.4)`, text stays `rgb(20,24,31)`.
- **Windows (app-wide).** The shared `DialogContent` cross is `sm:hidden` (phone only). A click outside already closed dialogs (Radix default) — now covered by a test, plus Escape.
- **Product window.** The two dialogs (create, edit) became one, with no bottom button. It saves as you type: after a 1 s pause, never two saves at once, and closing flushes anything pending. A new product is created **private** the first time its required fields are complete, then every later change updates that same product. An icon-only indicator (no words) shows saving / saved / error.
- **Simplification.** The visibility menu lost its explanatory sentences under each state; unused translations removed.
- **Tech debt paid.** The pricing serialization that was copy-pasted in `handleCreate` and `handleUpdate` (flagged in an earlier reflection) is now one tested module: `lib/pricingOptions.ts`, `lib/productPayload.ts`. Saving orchestration is `lib/persistProduct.ts`; the timing logic is `hooks/useAutoSave.ts`.

**Bugs the tests caught in my own work before anyone saw them**
1. `useAutoSave` could wedge for the rest of a session: when the first timer fired while the form was still incomplete (title typed, no category yet), the run returned synchronously and its `finally` cleared the "running" flag *before* it was set, leaving it stuck on — autosave silently never ran again. Fixed by clearing the flag from `.finally` on the promise.
2. Autosave validation was looser than the form's own submit check: it did not require a payment link/phone or a billing interval, so it would have auto-created **paid products nobody can pay for**. Moved the full rules into `validateProductForm`.
3. A missing-options fallback with a *random* id made the "what would be saved" key differ on every call, which would have made autosave save forever. Fixed id, with a test.
4. Two contract tests reading source text broke on the intended restructure; updated (not weakened) — the private-by-default invariant now lives on the shared builder.

**Testing.** 310 tests, 27 files. The wiring is covered by a real component test that renders `CreatorProductsTab` with its data hooks replaced and drives the actual form (17 tests: no bottom buttons; nothing created while incomplete; a private product created with no click once complete; later typing updates the same product and never creates a second, even when a change lands while the first is still being created; opening an existing product saves nothing; a change saves to that product without touching `is_active`/`is_paused`; closing saves a last-second edit, warns when incomplete work could not be saved, and starts the next window blank). I mutation-checked the two riskiest guards (forget the just-created id → duplicate-create test fails; skip the flush on close → close test fails).

**Interpretation and judgement calls to flag**
- "New window" was taken to mean the **product create/edit window**. Other windows keep their own buttons: confirmation dialogs must (delete), and several others (pause message, profile/handle setup, add profile) need an explicit action; auto-save does not fit them. I did **not** audit every dialog in the app.
- The hover and cross changes are in shared components, so they change **every** button and dialog in the app, not only the new screens.
- Auto-saving a *new* product means half-finished private drafts can accumulate in the seller's list if they abandon a window after the required fields are complete. It never reaches the marketplace (private by default), but it is a real behaviour change from "nothing exists until I press Create".

**Not verified / known gaps**
- The product window itself was never rendered in a real browser (it is behind seller login); the autosave is proven through the component test, not on a device or against the real backend.
- Picking a photo through the cropper into an autosaving session is covered at the `persistProduct` layer, not end-to-end through the UI.
- The form's own "highlight the first missing field" check is now unreachable (it hung off the removed submit button). While typing there is no hint about *which* field blocks saving; the only feedback is a warning when the window is closed with unsavable work. Legacy products that fail the stricter validation (e.g. no payment link) cannot autosave edits at all, with the same close-time warning.
- Only the shared `outline` buttons were hovered in a real browser; `secondary`/`ghost`/`toggle` and the solid-orange white text are covered by class-level tests, not by pixels. Kazakh strings for the new indicator were not reviewed by a native speaker.

**Lesson:** the riskiest change of the session (moving a save flow behind a timer) was made safe by extracting the logic into small pure pieces first and testing them with injected fakes — that found three real defects before any of it touched the 3,300-line component. And a wiring test that renders the real component is achievable even for a monolith, once the hooks it depends on are replaced.

## Next Steps

1. **Re-verify all three on-device fixes on an actual phone** through the tunnel: (a) the phone preview shows the whole card, (b) a picked cover photo now survives into the cropper and saves.
2. Apply `supabase/migrations/20260917120000_private_products_and_seller_metrics.sql`.
2. Redeploy edge functions `manage-products`, `manage-profile` and shared `_shared/profiles.ts`.
3. Smoke-test as a logged-in seller once deployed — the component tests cover the UI contracts, but nothing has exercised the real database.
4. Phase 10 (fake-product cleanup) — report-only against production, gated on the literal confirmation "Да, удаляй fake products."
5. Consider wiring `npm test` and `npm run typecheck` into CI so the gate is enforced rather than remembered.


---

# Round 2 Reflection: Editor Window Rework

Customer design feedback round 2 · Level 3 · six phases · 338 tests (from 310) · built 2026-09-22, checked by the user, **not yet reviewed by the customer**

## Summary

The customer asked for the product editor window to look like whop.com's "Add product" screen: preview at 70 % and enlarged with the phone scrollable, sections at 30 % and closed by default, a "Предпросмотр" heading, a close cross at the top right, the Save button back and pinned to the bottom, and cover editing returned to its former compact size. Two reference photos arrived after the plan was written and settled several open questions.

All of it was built. The layout switch also moved to a 1024 px media query, closing a known gap where between 768 and 1023 px the editor showed neither a preview nor tabs.

## What Went Well

**The creative phase found a real bug before a line of code was written.** The customer asked for collapsed sections to sit centred in the window. The obvious implementation is `justify-content: center` on the scrolling container. Measured in a real browser across three candidate patterns, that turned out to push the first section *above the scroll origin* once sections expand, where it can never be reached — `gapTop: −52 px`, and the screenshot showed "Раздел 1" simply missing. Auto margins were the only option that centres when short and clips nothing when tall. Deciding by measurement instead of by instinct is what prevented shipping a window whose first section disappears the moment anyone opens it.

**The reference photos converted prose into numbers.** "Preview 70 % and enlarged" is not buildable as written; the photos gave the phone card at ~50 % of the pane and the desktop card at ~94 %, both reaching the pane's bottom edge. That turned the open creative question about preview scale into a measurement, and the built result matches: `grid-template-columns: 414.109px 966.281px` — exactly 30/70 — with the phone's 390 px viewport shown at 483 px.

**Contract tests moved from regexing JSX to reading exported constants.** The window's two class sets are now `EDITOR_DIALOG_CLASS` and `CROP_DIALOG_CLASS`, and the tests import them. The previous version scraped `<DialogContent className="...">` out of the source with a regex and broke the moment the className became an expression.

**Mutation testing confirmed the new guards bite**: centring via `justify-center` fails the centring tests, and moving the footer inside the scroll area fails the pinned-footer tests.

## Challenges

**Three defects got past the tests and were caught only by screenshots.**

1. On a phone the Save button floated 324 px above the window bottom instead of being pinned.
2. On a phone the preview tab rendered a blank white pane.
3. In that same preview tab the phone card rendered at half life size.

The first two share one cause: a grid stretches its items, a flex column does not. In the stacked layout both panes needed `flex-1`, and without it the preview's stage measured zero — the same class of collapse that produced the "rectangular strip" bug in round 1.

What is uncomfortable is that **I fixed exactly this for the left pane, screenshotted, saw it fixed, and did not check the sibling pane that had the identical problem**. The second screenshot found it. A fix of the form "this element needs `flex-1` in the stacked layout" should immediately prompt: which other children of that same container need it too?

The third is a different kind of mistake. `stageFraction: 0.5` was derived from the desktop reference photo, where the pane is ~966 px wide. In the phone's own preview tab the pane is 358 px, and half of that is 179 px — the card rendered at 46 % of life size, half the size it would be on the actual phone. The rule was correct for the context it came from and silently wrong in the other context it was applied to.

**A tooling trap cost real time.** Writing a regex into a test file through a shell heredoc containing Python turned `\b` into an actual backspace character (0x08) inside the file. The test then failed for a reason that had nothing to do with the code, and the assertion *looked* correct in every listing. It was only visible under `cat -A`. Files with escape-heavy content belong in the Write tool, not in nested heredocs.

## Lessons Learned

**Measure the thing the decision rests on.** This is now the second round where the obvious implementation was defeated by a measurement: round 1's inline-vs-iframe reversal, round 2's centring trap. Both were cheap to check and expensive to ship wrong.

**jsdom tests can pin a fix but cannot find a layout bug.** Every layout defect in this task — the strip, the vanishing photo, the broken title, and all three from this round — was found by pixels or geometry. The class-level assertions written afterwards are worth having, but they are a ratchet, not a detector.

**A proportion derived in one context needs checking at both extremes.** "Half the pane" was right at 966 px and wrong at 358 px. When encoding a fraction, ask what it produces at the smallest and largest sizes it will actually meet.

**Fix the class, not the instance.** Two of the three defects were the same missing `flex-1` on sibling elements.

## Process Improvements

**The screenshot harness is now a proven tool and is documented in `progress.md`.** A temporary Vite entry rendering the real components, driven over the Chrome DevTools Protocol, gives both a picture and hard geometry (`grid-template-columns`, element rects, whether a frame scrolls internally). It works without logging in and without touching production data. This should be the default for any layout question in this project, not a last resort.

**Temporary files must live outside `public/`** — files there ship in the production build. Both the probe pages and the harness were deleted, and `git status` was checked afterwards.

## Technical Improvements

**`CreatorProductsTab.tsx` is still over 3,300 lines and `ProductForm` is still trapped inside it.** That is the direct reason the browser verification used a stand-in for the form: the real one cannot be rendered in a harness without dragging the entire tab and its data hooks along. Extracting `ProductForm` into its own file would make the next layout check cover the real thing.

**The pre-existing debt is unchanged**: 22 type errors and 253 lint problems, none introduced by this work and none fixed, per the spec's instruction to fix only errors caused by these changes.

## What Is Not Verified

- **The customer has not reviewed it.** The user checked it and reported it looks right; the customer's own review is still outstanding.
- **The real `ProductForm` inside the new two-pane window** was never rendered in a browser — only a stand-in with the same three collapsible sections.
- **The full save flow end to end** against the real backend: the pinned Save button's path is covered by component tests, not by a real product being written.
- **The cross position is still ambiguous**: the customer's words say top right, their reference photo shows top left. Built to the words, one class to change.
- **Nothing is deployed.** The migration `20260917120000_private_products_and_seller_metrics.sql` is still unapplied and `manage-products` / `manage-profile` are still not redeployed, so private-by-default and the storefront metrics are not live.

## Next Step

`/archive` once the customer has reviewed the window and the migration and edge functions are deployed. Until then this round is complete but unconfirmed.
