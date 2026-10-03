# TASK ARCHIVE: Product Preview Isolation, Live Editor Preview & Seller Storefront

## METADATA
- **Source spec:** `.claude/dostup_claude_code_prompt.md`
- **Complexity:** Level 4
- **Started:** 2026-09-17 · **First archived:** 2026-09-22 · **Closed:** 2026-09-29
- **Branch:** `предпросмотер` (round 2 design rework happened on top of the same branch/work)
- **Status: CLOSED 2026-09-29** — development complete, shown to the customer, customer feedback received and routed to a **new task** (start with `/van`). Deployment is still pending — see "Outstanding" below.
- Earlier status (2026-09-22): development complete, deployment and customer review pending. This is not a "verified working in production" close; it is closed as active development so a fresh task can start on the same repo without two tasks sharing one `tasks.md`.

## SUMMARY
Rebuilt the product Preview to be a genuinely isolated, chrome-less view (fixing a bug where the seller could navigate the whole platform from inside "Preview"); added Phone/Desktop preview modes; moved Preview into the Product Editor as a live pane driven by unsaved form state; made new products private by default; built out the public Seller Storefront with real rating/sales/joined-year metrics and a seller description field; and, after the initial build, went through three rounds of on-device bug fixes and a full customer-driven redesign of the editor window (round 2: 30/70 split, enlarged scrollable preview, pinned Save button, centred collapsed sections, compact cover-cropping window).

## REQUIREMENTS
Full text: `.claude/dostup_claude_code_prompt.md`. Acceptance criteria: 39 items covering preview isolation (AC 1-9), the in-editor live preview (AC 10-15), private-by-default (AC 16-17), and the seller storefront (AC 18-39). Round 2 added customer design requirements delivered as chat feedback plus two reference photos (whop.com's "Add product" editor) — not in the original spec, layered on afterward.

## IMPLEMENTATION
Ten-phase original plan + a six-phase round-2 plan, both in this file's git history (now superseded by this archive). Key files:
- **Preview isolation:** `src/pages/ProductPreviewRoute.tsx`, `isPreview`/`previewProduct` props on `src/pages/ProductPage.tsx`, transport contract in `src/lib/productPreview.ts`.
- **Editor window:** `src/components/creator/ProductEditorLayout.tsx`, `ProductPreviewPane.tsx`, `ProductVisibilityMenu.tsx`, `AutoSaveIndicator.tsx`; save/validation logic extracted into `src/lib/productPayload.ts`, `src/lib/persistProduct.ts`, `src/hooks/useAutoSave.ts`, `src/lib/pricingOptions.ts` (all previously duplicated inline in `CreatorProductsTab.tsx`).
- **Storefront:** `supabase/migrations/20260917120000_private_products_and_seller_metrics.sql` (extends `get_seller_storefront`, flips `products.is_active` default to `false`), `src/hooks/useSellerStorefront.ts`, `src/pages/StorefrontPage.tsx`.
- **Settings:** `set_bio` action in `supabase/functions/manage-profile/index.ts`, `src/components/account/BioSettingsCard.tsx`.
- **Shared UI changes (app-wide, not scoped to this feature):** `src/components/ui/button.tsx` (pale-orange hover on secondary variants), `src/components/ui/dialog.tsx` (`alwaysShowCloseButton` opt-in).

### Architecture decisions (full rationale in `memory-bank/creative/`)
1. Preview stays **iframe-based**, pointed at the new chrome-less route — reversed the plan's own "render inline" recommendation after finding the mobile buy bar is `position: fixed` and the page's breakpoints are viewport-scoped, not container-scoped.
2. Sections centre via **auto margins**, not `justify-content: center` — measured in a real browser that the latter clips the first section above the scroll origin, unreachable, once sections expand.
3. Preview frame renders at a **real device viewport, scaled up** — widening the iframe instead was measured to shrink the rendered text.
4. Save button **coexists with autosave** rather than replacing it — resolves a direct contradiction between round 1 feedback ("no Save/Cancel") and round 2 feedback ("Save button back, pinned").

## TESTING
No test infrastructure existed at the start; it was built at the user's explicit request (vitest + jsdom + testing-library) after an initial attempt to skip it was rejected. Final state: **338 tests across 27 files**, `npm run build` green, `npx tsc -p tsconfig.app.json --noEmit` unchanged against a recorded baseline of 22 pre-existing errors, lint clean in every new/changed file.

Verification relied on three methods, used deliberately for different classes of bug:
- **jsdom component tests** for logic, state and React reconciliation (e.g. the autosave hook's timing, the "form must not remount" invariant).
- **Real headless Chrome, screenshotted via a temporary harness**, for anything CSS-layout-dependent — jsdom has no layout engine and cannot see this class of bug. This caught defects that passed every jsdom test: the "rectangular strip" preview bug, an overflowing product-title column, and in round 2, a Save button floating mid-window and a preview pane rendering at half life size on a phone.
- **The user's own on-device testing** through a Cloudflare tunnel, which found three real bugs after the build was declared "done" (see Lessons Learned).

## LESSONS LEARNED
(Full detail in `memory-bank/reflection/reflection-preview-editor-storefront.md`, two rounds.)
- **Measure the thing a decision rests on**, in a real browser, before committing — twice a plausible-sounding implementation was measured and found wrong (inline preview rendering; centring via `justify-content`).
- **jsdom can pin a fix but cannot find a layout bug.** Every layout defect across both rounds was found by pixels or geometry, never by a passing/failing jsdom assertion alone.
- **A missing-tests audit must glob the filesystem, not read `package.json`.** Three dead `node:test` files existed and were missed by checking dependencies alone.
- **A fix to one sibling element should prompt checking its siblings for the same defect** — round 2's Save-button and blank-preview bugs shared one root cause (`flex-1` missing in the stacked layout) and were found in two separate screenshot passes instead of one.
- **A proportion derived in one context can be wrong in another** — a "half the pane" preview-scale rule, correct on a wide desktop pane, rendered the card at half life size in a narrow phone pane.

## OUTSTANDING (why this is not a "verified in production" close)
1. ~~The customer has not reviewed the round-2 editor window.~~ **Resolved 2026-09-29:** the user showed it to the customer, who sent a list of changes. Those changes are a **new task**, not a reopening of this one.
2. **Nothing is deployed.** `supabase/migrations/20260917120000_private_products_and_seller_metrics.sql` is unapplied; edge functions `manage-products` and `manage-profile` (plus shared `_shared/profiles.ts`) are not redeployed. Until both happen, private-by-default and the storefront metrics are not live.
3. **The real `ProductForm`** was never rendered inside the new two-pane window in a browser — verification used a stand-in with the same section structure, because the real form lives behind a seller login inside the 3,300-line `CreatorProductsTab.tsx`.
4. **Cross position is ambiguous**: the customer's words say top right, their reference photo shows top left. Built to the words; a one-class change either way.
5. **Phase 10 (fake-product cleanup)** was never started — report-only, gated on the literal confirmation "Да, удаляй fake products", against production data.
6. **`CreatorProductsTab.tsx` is still ~3,300 lines**, holding the form, the card and every dialog — the direct reason #3 above is true.

## CLOSING NOTE (2026-09-29)
The task is closed so the customer's feedback can go through its own `/van` → `/plan` → `/build` cycle. Carry-over items for whoever picks up the follow-up work:
- Items 2–6 in OUTSTANDING above are still open. The migration and edge-function redeploys (item 2) must happen before private-by-default and the storefront metrics go live, whatever the new task changes.
- Round 1 on-device fixes (phone-preview `fitScale`, cover-photo remount, long product titles) and round 2's phone preview sizing were never re-checked on an actual phone.
- Code for rounds 1 and 2 is committed on branch `предпросмотер` (`949f4b8`, `70d5069`), not merged into `main` and not pushed.
- If the customer's feedback touches the editor window, re-read `creative/creative-editor-window-round2.md` first: it records why the Save button coexists with autosave and why sections centre via auto margins.

## REFERENCES
- Reflections: `memory-bank/reflection/reflection-preview-editor-storefront.md` (two rounds)
- Creative decisions: `memory-bank/creative/creative-preview-architecture.md`, `creative-editor-layout.md`, `creative-productcard-seller-link.md`, `creative-visibility-control.md`, `creative-storefront-metrics.md`, `creative-editor-window-round2.md`
- Full plan and build log: this archive's git history of `memory-bank/tasks.md` up to 2026-09-22
