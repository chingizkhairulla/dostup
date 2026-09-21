# Creative Phase: Product Editor Layout with Live Preview

Type: **UI/UX** · Spec refs: §3, §3.2, §3.3 · AC 10-14

## Requirements
1. Preview lives **inside** product creation and editing (AC 10-11).
2. Desktop: form and preview side by side (AC 12).
3. Form changes reflect in the preview immediately (AC 13).
4. Mobile: no horizontally squeezed form; a genuinely usable layout (AC 14, §3.3).
5. Preview defaults to Phone here too (§3.2).

## Current state
Both flows use a shadcn `Dialog` with `DialogContent` at `max-w-lg` (create: `CreatorProductsTab.tsx:3004`, edit: `:3027`), `max-h-[90vh] overflow-y-auto`. `ProductForm` inside is a single column with three collapsible sections — Детали / Классификация / Оплата — which already match the spec's left-hand column.

## Options

### Option A — Widen the existing Dialog to near-full-screen, two-column grid ← **SELECTED**
`w-[96vw] max-w-[1600px] h-[92vh]`, `lg:grid-cols-[minmax(420px,1fr)_minmax(0,1.1fr)]`. Form column scrolls independently; preview column is fixed and does not scroll with the form.
- ✅ Keeps all existing open/close/reset state wiring (`isCreating`, `editingProduct`, `resetForm`, `isCroppingMedia`) untouched — lowest regression risk.
- ✅ Keeps the existing `dialog-mobile-fullscreen` mobile behavior already used elsewhere in the file.
- ✅ On a 1920px screen the preview column gets ~900px → desktop preview scales at ~0.7, which stays readable. Phone preview renders at native 390px with room to spare.
- ⚠️ A near-full-screen modal is a heavier surface than today's compact dialog — acceptable, since the editor is now a two-pane workspace.

### Option B — Convert the editor to a full page route (`/creator/products/:id/edit`)
- ✅ Most room; shareable URL; no modal constraints.
- ❌ Requires rerouting, new guards, and rewiring create/edit/reset/cropping state that currently lives in `CreatorProductsTab`. Large blast radius for no requirement that demands it.

### Option C — Keep `max-w-lg` and put the preview in a separate Sheet
- ❌ Fails AC 12 (not side by side).
- ❌ A Sheet over a Dialog is a fragile nested-overlay pattern.

## Decision
**Option A.** It satisfies the side-by-side requirement with the smallest change to a 3329-line file, and preserves the existing dialog lifecycle wiring.

## Mobile pattern (§3.3)
Segmented toggle pinned at the top of the dialog: **[Редактор] [Предпросмотр]**, defaulting to Редактор.
- Chosen over a "Открыть предпросмотр" button opening an overlay, because a nested overlay inside an already-fullscreen dialog is fragile, and over an inline section below the form because the preview is tall and would bury the form's submit action.
- It also visually rhymes with the Phone/Desktop segmented control introduced in the preview pane, so the editor has one consistent control idiom.
- On mobile the Phone/Desktop toggle itself can be hidden (a phone previewing desktop inside a phone is not useful) — Phone only.

## Live update mechanism (AC 13)
- Pure mapper `draftToPreviewProduct(formData, seller, categories)` → the shape `ProductPage` consumes (`title`, `headline`, `description`, `media`, `price`, `pricing_options`, `category_slug`, `author_name`, `seller_handle`, `seller_avatar_url`, `faq`, `has_free_trial`, `trial_days`, …). Pure function, no side effects, **never** writes to the DB.
- Debounce ~200ms before posting to the iframe, so typing a title doesn't post on every keystroke.
- Media already carries local `previewUrl` blob URLs (`CreatorProductsTab.tsx:709/758`), so newly picked images preview before upload.

## Implementation guidelines
1. Extract the shared dialog body into one component used by both create and edit, so the layout is defined once rather than duplicated across `:3004` and `:3027`.
2. Grid, not flex, for the two columns; give the form column `overflow-y-auto` and the preview column `overflow-hidden`.
3. `ProductForm` itself is **not** restructured — it keeps its three sections and simply becomes the left column.
4. The cropping mode (`isCroppingMedia`) currently swaps the dialog title; when active, collapse to a single column so the cropper gets full width.
5. Preview pane state (`phone`/`desktop`) is local to the pane and resets to `phone` each time the dialog opens.
