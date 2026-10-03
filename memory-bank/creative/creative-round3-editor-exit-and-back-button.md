# Creative: Round 3 — editor save/exit flow, cover-crop window, back button

Task: customer feedback round 3 (`memory-bank/tasks.md`, items A8, B11, C15). Date: 2026-09-29.

---

🎨🎨🎨 ENTERING CREATIVE PHASE: ARCHITECTURE + UI/UX — A8 editor save/exit flow and cover-crop window

## Requirements
1. The cover-crop window opens **on top of** the editor. The editor never closes because of it.
2. The crop window has **no Cancel button and no top-right cross**. Save, or a click outside it, returns to the editor.
3. The editor is **full-screen**, so there is nowhere outside it to click.
4. The editor's cross: the first click shows a **red hint under the cross**, "Вы точно хотите выйти? Изменения не сохранятся.". A second click closes the window.
5. **No autosave in either mode** (user decision in `/creative`, 2026-09-29: "пусть при редактировании тоже будет через кнопку сохранить а не авто, чтобы не путать пользователя"). Create → button "Создать"; edit → button "Сохранить".
6. `ProductForm` must never remount while open. It owns the picked photo and the cropper state (round 1's vanished-cover bug).

## Constraints found in the code
- The crop is a **mode of the editor dialog**, not a window of its own. `ProductForm` swaps its whole body for `<CoverCropEditor>` when `coverCrop.source` is set (`CreatorProductsTab.tsx:1135-1156`). Via `onCroppingChange` → `isCroppingMedia`, the parent then shrinks the dialog to `CROP_DIALOG_CLASS` (`:176`, `:2850`) and hides both panes (`previewHidden`). The dialog's `onOpenChange(false)` → `closeEditor()` (`:2847`) fires on an outside click, and **that is the reported bug**: an outside click during cropping closes the whole editor.
- Autosave: `useAutoSave` (`:2593`) with `saveEditor` (`:2560`), `closeEditor` flushing on close (`:2611`), `finishEditing` (`:2635`), `createdProductRef` for "created once required fields are valid", `AutoSaveIndicator` in the title (`:2866`).
- `DialogContent` renders its own Radix `Close` at `right-4 top-4` (`ui/dialog.tsx:59-68`). `hideCloseButton` suppresses it.
- `CoverCropEditor` has Отмена/Сохранить buttons at `CoverCropEditor.tsx:121-140`.
- Radix `Dialog` supports nesting. A dialog opened from inside another's content stacks on top as its own dismissable layer, so pointer-down outside the child dismisses **only the child**.

## Options — crop window
- **A. Nested Radix Dialog rendered from inside `ProductForm`.** The form stays mounted underneath and the crop state stays where it lives today. The child dialog's outside click and Esc cancel the crop, and the child layer absorbs them.
- **B. Keep crop as a mode, but block outside-close while cropping** (`onPointerDownOutside: preventDefault`). Smallest change, but the editor still visually disappears into a compact window, which is exactly what the customer called "the window closes in the background". It fails requirement 1.
- **C. Lift crop state to `CreatorProductsTab` and render a sibling dialog.** Works, but it moves ~100 lines of state out of the form. It also re-creates the mounting risk this invariant exists to prevent, for no gain over A.

**Selected: A.** It is the only option that meets requirement 1 without moving state. `CROP_DIALOG_CLASS`, `isCroppingMedia`, `onCroppingChange` and the `previewHidden` crop path become dead code. Remove them, and keep `previewHidden` only if something else still uses it (nothing does today).

## Options — saving and the exit hint
Autosave is gone (req. 5), so "unsaved" now has a plain meaning: the form differs from what was last opened or saved.
- **A. Show the hint only when there are unsaved changes.** A clean window closes on the first click.
- **B. Always require two clicks**, even with nothing changed.

**Selected: A.** The hint's text is "Изменения не сохранятся". With no changes it is meaningless, and it would train users to double-click past it, so the warning stops working when it matters. It still behaves exactly as the customer described whenever there is something to lose. **Flag this to the user** in the build summary. Switching to B is a one-line change (`dirty` → `true`).

This **reverses two earlier decisions**:
- round 1: "self-saving windows, no Save/Cancel";
- round 2: "the Save button coexists with autosave" (`creative-editor-window-round2.md`).

What changed: the customer now asks for an explicit create/save action and a truthful "changes will be lost" warning. Autosave contradicts both.

## Implementation guidelines
**Dirty tracking.** `baselineKey` = `saveKey(formData, taxonomyCategories)` captured when the editor finishes loading a product (edit) or resets the empty form (create), and again after each successful save. `dirty = currentKey !== baselineKey`. A newly picked `pendingImageFile` / `pendingVideoFile` counts as dirty.

**Save / Create.**
- Remove `useAutoSave`, `AutoSaveIndicator` usage, `createdProductRef`, and the "created private" autosave path.
- The pinned footer button submits the form. The form's existing validation (`handleFormSubmit` → `notifyMissingField`) opens the section and focuses the first missing field.
- Then `persistProduct` runs: a new product is created private, as today (the toast `productCreatedPrivate` stays); an existing one is updated.
- The button shows a spinner while saving. On success the window closes. On error a toast appears and the window stays open with the data intact.
- Labels: create "Создать", edit "Сохранить".
- Delete `hooks/useAutoSave.ts`, `AutoSaveIndicator.tsx` and their tests only if nothing else imports them (grep first).

**Exit control — `EditorCloseButton`** (new, in `components/creator/`). It replaces the Radix close: `hideCloseButton` on this `DialogContent`, and the component is passed as `headerRight`, the same slot as today.
- Props: `dirty`, `onClose`.
- State `armed`. Click when `!dirty` → `onClose()`. When `dirty && !armed` → `armed = true`. When `armed` → `onClose()`.
- The hint is absolutely positioned under the cross and right-aligned to it:
  - `role="alert"`, `text-sm font-medium text-destructive`, on `bg-background` with `border border-destructive/30 rounded-lg shadow-md px-3 py-2`;
  - `max-w-[min(18rem,calc(100vw-2rem))]`, so it wraps on a phone instead of overflowing.
- **Disarm** after 4 s, on any change to the form (a new edit means the user decided to stay), or on a pointer-down anywhere else in the editor.
- **Esc** goes through the same logic: `onEscapeKeyDown` on the editor's `DialogContent` → `preventDefault()` + the same handler, so Esc can never skip the warning.
- `onPointerDownOutside` / `onInteractOutside` on the editor → `preventDefault()`. The editor is full-screen, but Radix toasts and portals could still count as "outside".

**Full-screen editor.** `EDITOR_DIALOG_CLASS` becomes `inset-0 h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0` at every breakpoint. The Radix centring classes are overridden via `left-0 top-0`. Check that the `mobileFullScreen` CSS in `index.css:320-342` does not fight it.

**Crop window.**
- Inside `ProductForm`, render `<Dialog open={Boolean(coverCrop.source)} onOpenChange={(o) => { if (!o) cancelCrop(); }}>` with `<DialogContent hideCloseButton className="max-w-lg">`. The content is a visible "Настройка обложки" title, `<CoverCropEditor … />`, and a single "Сохранить" button.
- `CoverCropEditor` loses `onCancel` and the Отмена button.
- The form body is **no longer swapped out**: it stays rendered underneath.
- An outside click or Esc on the crop window = `cancelCrop()` (`coverCrop.resetCrop(); setCropQueue([])`). The picked file is not added, and the editor and everything typed stay.

## Verification against the requirements
1. The editor stays open, because the crop is a separate layer (test: crop open → the editor's title and fields are still in the DOM).
2. There is no cross or Cancel in the crop window, and an outside click returns to the editor (test: pointer-down on the overlay → the crop is gone, the editor is open, and the typed title is intact; real-browser check in Chrome).
3. The full-screen class has no outside area (headless Chrome: the dialog rect equals the viewport at 1440 and 390).
4. Two-click cross with the red hint (tests: dirty → the first click shows the alert and does not close; the second click closes; a clean window closes on the first click; Esc behaves the same; the hint disarms on edit).
5. No autosave: typing waits for "Создать"/"Сохранить", with no network call before (test with the persist mock: zero calls until submit).
6. No remount: the existing `ProductEditorLayout` no-remount tests, plus the new regression test that picks a cover, then clicks outside the crop, then checks that the form state survives. It is written first and must fail on the current code.

🎨🎨🎨 EXITING CREATIVE PHASE

---

🎨🎨🎨 ENTERING CREATIVE PHASE: UI/UX + ALGORITHM — B11/C15 back button

## Requirements
- It returns to wherever the user came from: the marketplace, a product, a storefront.
- The customer marked its **position on a screenshot** (2026-09-29): **top left, where it is today**. That is the white strip between the header and the content, aligned with the content's left edge (`ProductPage.tsx:568-576`). So "налево, где белый отступ" means this white strip, not the side gutter. Moving it into the side gutter is dropped. The container is `max-width 1200px + 24px padding` (`index.css:140-145`), so at 1024–1280px the gutter would be 24–64px, too narrow for "← Назад" anyway.
- It **stays in place while scrolling**, like the header.
- The same component and behaviour on the storefront.

## Constraints
- The header `AppHeader` is `sticky top-0 z-30`, `h-16` (64px), plus an `InstallBanner` of variable height.
- Today the back link is a hard `<Link to="/">`, in two places in `ProductPage` (`:397` not-found state, `:568`).
- The preview hides it (`!isPreview`).

## Options — "where the user came from"
- **A. `location.key !== "default"` → `navigate(-1)`, else `navigate("/")`.** React Router gives the first entry of a session the key `"default"`, so a direct visit (a shared link, a new tab) falls back to the marketplace. Any in-app navigation has real history to go back to.
- **B. Track an explicit in-app route stack** in context or sessionStorage. More control (e.g. skipping duplicate entries), but more code and state for no case this task needs.
- **C. `document.referrer`.** It is unreliable for SPA navigation and blank on many policies.

**Selected: A.** It is the standard React Router idiom and covers every case the customer listed. Edge case: a page reached by `navigate(..., { replace: true })` still has a non-default key, and `-1` goes to the entry before it. That is correct.

## Options — keeping it in place while scrolling
- **A. A sticky back bar:** a full-width `sticky` row directly under the header (`top` = header height) with `bg-background`. The button sits in it at the content's left edge.
- **B. Sticky button only**, with no background. Content scrolls visibly under the text and it becomes unreadable over the cover image.
- **C. Put it inside the header.** That changes a shared app component on every page, which is out of scope.

**Selected: A.** The top offset must follow the header's real height (the install banner can add to it). So make the header wrapper and the back bar **one sticky stack**: `BackBar` renders as a sibling immediately after `MarketplaceHeader` inside a shared `sticky top-0` wrapper, or `AppHeader` accepts an optional `below` slot. **Prefer the `below` slot**: it keeps the header and the bar in one sticky element, with no measured offsets. It is additive and optional, so no other page changes.

The purchase card's sticky `top` must then clear the header and the bar: `top-[calc(4rem+2.75rem+1rem)]`. Measure the actual bar height in Chrome and set it once as a CSS variable, `--public-sticky-offset`, on the page wrapper.

## Implementation guidelines
- `components/marketplace/BackButton.tsx`: `useLocation` + `useNavigate`; `onClick = key !== "default" ? navigate(-1) : navigate("/")`. Keep the existing visual (`ArrowLeft` + `t("back")`, `public-meta hover:text-foreground`). It is a `<button>`, not a `<Link>`.
- `AppHeader` gets an optional `below?: ReactNode`, rendered inside the sticky wrapper under `<header>` as `<div className="bg-background"><PublicContainer className="py-3">{below}</PublicContainer></div>`. `MarketplaceHeader` passes a `below` prop through.
- `ProductPage` (both states) and `StorefrontPage` pass `<BackButton />` as `below`. Remove the in-flow back links. Not rendered in preview, where the whole header is already absent.
- The phone uses the same layout. The bar is one short row, and the in-flow link was already at the top.

## Verification
- Unit tests: key `"default"` → navigates to `/`; otherwise → `navigate(-1)`; it renders on the product page and the storefront; it is absent in preview.
- Headless Chrome at 1440 and 390: after scrolling 1500px, the back button's and the purchase card's `getBoundingClientRect().top` equal their values after the first scroll step, and neither overlaps the header.

🎨🎨🎨 EXITING CREATIVE PHASE
