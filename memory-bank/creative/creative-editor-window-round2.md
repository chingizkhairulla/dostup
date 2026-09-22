# Creative Phase: Editor Window Rework (Round 2)

Type: **UI/UX + Architecture** · Source: customer feedback + two reference photos of whop.com's "Add product" editor · Planned in `memory-bank/tasks.md` ("Design Feedback, Round 2")

Everything below was measured in real Chrome against the real `/preview/product` route before deciding. Two of the four decisions reversed the obvious implementation, and one of those would have shipped a bug the customer explicitly asked to avoid.

---

## 🎨 Decision 1 — Preview frame sizing (Architecture)

### Requirements
1. Preview occupies 70 % of the window; it is **enlarged** so the card is easier to see.
2. Works for both phone and computer modes.
3. On phone the page inside **scrolls down**.
4. Reference photos: phone card ≈ 50 % of the pane width, computer card ≈ 94 %, both reaching the pane's bottom edge.

### Constraints in the code
- `ProductPreviewPane.tsx:58-69` currently fits the **whole device box on both axes** (`fitScale`, `lib/productPreview.ts`) — the round-1 fix for the "rectangular strip" bug. Fitting both axes is the opposite of filling the height, so this round reverses part of that decision.
- Round-1 finding that still holds: the product page's mobile buy bar is `position: fixed` and its breakpoints are viewport-scoped (`ProductPage.tsx:829`), so the frame must stay an **iframe**; only its size changes.

### Options
| | Mechanism | Phone viewport inside |
| --- | --- | --- |
| **A** | Native 390 px viewport, CSS `transform: scale()` up to the target width | **390 px — a real phone** |
| **B** | No scaling; set the iframe's CSS width to the target (≈ 484 px) | 484 px — not any real device |
| **C** | Like A, plus a drawn device bezel | 390 px |

### Measured (pane 967 px, stage 780 px — the geometry from the photos)
| | Inner viewport | On screen | Scrolls inside | Mobile buy bar |
| --- | --- | --- | --- | --- |
| A phone | **390** | 486 × 767 | **yes** | `block`, pinned to the frame's bottom |
| B phone | 484 | 486 × 766 | yes | `block` |
| C desktop (1280 → 0.71) | 1280 | 910 × 766 | fills exactly | `none` (correct: desktop layout) |

Screenshots: in **A** the text is visibly larger than in **B** at the same frame width, because B renders more CSS pixels into the same space. "Увеличен, чтобы легче было видно" is precisely what A does and B does not.

### Selected: **A — native viewport, scaled up**
B was rejected because it shows a viewport no phone has and makes the text *smaller*, which is the opposite of the request. C adds chrome for no information — against "as simple as possible".

**This reverses half of the round-1 `fitScale` decision**, deliberately: the requirement changed from "show the whole device at once" to "enlarge it and let it scroll". What carries over unchanged is the part that fixed the strip bug — the frame's height is always an **explicit pixel value computed from a measured stage**, never a percentage inherited from an ambient flex chain.

### Implementation guidelines
- Frame width on screen: `phone = 50 % of the stage width`, `desktop = 94 %`.
- `scale = displayWidth / deviceWidth`, clamped to **[0.9, 1.5]** so a very wide or very narrow window cannot produce an absurd size; `displayWidth` is then recomputed from the clamped scale so width and scale never disagree.
- Frame CSS height = `(stageHeight − topGap) / scale`, so after scaling it reaches the stage's bottom edge; `transformOrigin: top left`; horizontally centred; `topGap` 16 px.
- Keep the existing `ResizeObserver` measuring **both** dimensions, and keep the "fall back to a safe value when the stage has no measurable size" rule.
- `fitScale` and its tests are removed with this change; new tests cover the clamp and the height derivation.

---

## 🎨 Decision 2 — Sections column: centred, scrollable, pinned footer (UI/UX)

### Requirements
1. Sections **closed by default** and **vertically centred** in the window, "as before", not stuck to the top.
2. When expanded they scroll.
3. Save is pinned at the bottom of the window and does not move.

### Options
- **A** `justify-content: center` on the scrolling container.
- **B** A scrolling container with the content wrapped in `margin: auto 0`.
- **C** `display: grid; align-content: center` on the scrolling container.

### Measured (420 × 560 column, three sections, collapsed vs expanded)
| | Collapsed: centred | Expanded: first section reachable |
| --- | --- | --- |
| A | yes | **NO — clipped, `gapTop: −52 px`** |
| B | yes | **yes, `gapTop: +14 px`** |
| C | yes | **NO — clipped, `gapTop: −52 px`** |

The screenshot makes it unmistakable: with A and C, "Раздел 1" is cut off above the scroll origin and **cannot be scrolled to at all**. This is the classic flex/grid centring-plus-overflow trap, and A is the implementation anyone would reach for first.

### Selected: **B — auto margins on an inner wrapper**
The only option that satisfies both halves of the request. Had this not been measured, the window would have looked right when the customer opened it and lost the first section the moment they expanded anything.

### Implementation guidelines
- Left pane is a flex column: fixed top bar (title + autosave indicator), `flex-1 min-h-0 overflow-y-auto` middle, fixed bottom bar (`border-t`, Save right-aligned).
- The form sits in a wrapper with `my-auto` inside the middle area.
- Bottom bar is a sibling of the scroll area, never inside it, so it cannot scroll away.
- Measure the trailing margin: the last section's bottom margin offsets the optical centring by that amount — use `space-y` between sections rather than `margin-bottom` on each.

---

## 🎨 Decision 3 — Save button alongside autosave (UX)

### The conflict
Round 1 the customer asked for **no Save/Cancel — save automatically**. Round 2 asks for **Save, pinned at the bottom**. The reference photos show a pinned "Create product" button, confirming round 2.

### Options
- **A** Remove autosave, go back to save-on-click only.
- **B** Keep autosave, add Save as an explicit "finish and close".
- **C** Keep autosave, make the button only a status indicator.

### Selected: **B**
A would re-open the hole round 1 closed (work lost on an accidental close, and no save while the seller types). C hands the seller a button that does nothing, which is worse than no button. B also restores something that was lost: the form's own submit path (`handleFormSubmit`, `CreatorProductsTab.tsx:1074`) with field-by-field validation and highlighting became unreachable when the button was removed — the exact gap the user hit when they asked "how do I save this?".

### Implementation guidelines
- Button is `type="submit"` wired to the form via the `form` attribute, so it can live in the pinned footer outside the scrolling area.
- Valid → save now, then close (closing already flushes anything pending). Invalid → window stays open, toast + scroll to and highlight the first missing field.
- Disabled with a spinner while a save is in flight. No Cancel: closing is the cross, a click outside, or Escape.
- Autosave keeps running unchanged, including the warning when a window is closed with work that could not be saved.

---

## 🎨 Decision 4 — Cover editing back to its former size (UI)

### Finding
The cropper is **already** capped at `max-w-[384px]` (`CoverCropEditor.tsx:50`) and has not changed. It looks oversized only because the window around it grew to `96vw × 92vh` for the two-pane layout. So the fix belongs to the **window**, not the cropper — nothing about the cropper itself should be touched.

### Options
- **A** Shrink the window back to the old compact dialog while cropping.
- **B** Keep the big window, constrain the cropper inside it.
- **C** Move cropping into its own separate dialog.

### Selected: **A**
It is what "вернуть в прежнее состояние" literally asks for, and it reuses sizing the window already had (`max-w-lg`, `max-h-[90vh]`, auto height, single column, no preview, no footer). B leaves a small cropper marooned in a huge dark frame. C is a second dialog stacked on a dialog — fragile, and the round-1 remount bug came from exactly this kind of structural switch.

### Implementation guidelines
- Hold the two class sets as named constants so the intent is readable and a contract test can assert on them.
- The switch must not change the **shape of the tree** around the form: same slot order in both states. The round-1 regression tests ("the form keeps its state across layout changes") must keep passing, and are extended to cover entering and leaving crop mode.
- Footer and preview pane are hidden while cropping; the cropper keeps its own Отмена / Сохранить buttons, which already exist.

---

## Verification against the requirements

| Requirement | Met by | Evidence |
| --- | --- | --- |
| Preview 70 % / sections 30 % | Decision 2 layout | To be screenshot-verified in the build |
| Preview enlarged, both modes | Decision 1 (scale 1.24 at the reference geometry) | Measured: 390 px viewport shown at 486 px |
| Phone scrolls down | Decision 1 | Measured: `scrollableInside: true` |
| "Предпросмотр" heading above the preview | Right pane top bar | Build |
| Cross top right | Dialog opt-in | Build |
| Sections closed, centred | Decision 2 option B | Measured: centred when short, nothing clipped when tall |
| Save pinned at the bottom | Decision 3 | Build |
| Cover editing compact again | Decision 4 | Build |

## Open question for the user
The cross: the words say **top right**, the photo shows it **top left**. Building the words' version; a one-class change either way.
