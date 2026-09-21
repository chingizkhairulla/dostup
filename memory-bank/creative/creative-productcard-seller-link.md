# Creative Phase: Clickable Seller Block on the Marketplace Card

Type: **UI / Architecture** · Spec refs: §8.2 · AC 20

## Requirement
On a marketplace `ProductCard`, the seller block (avatar + name) must link to the seller's storefront. **Only** that block — the rest of the card must still open the product (§8.2: "Не превращай всю ProductCard в ссылку продавца").

## Constraint
`src/components/marketplace/ProductCard.tsx:56-58` wraps the **entire card** in a `<Link>`. The seller row sits inside it at L190-198. Nesting an `<a>` inside an `<a>` is invalid HTML — React Router will render it, but browsers recover unpredictably and keyboard/AT behavior breaks. The card also already contains interactive carousel arrows and dots (L102-151) that work around the wrapper today with `e.preventDefault()` + `stopPropagation()`.

## Options

### Option A — `onClick` + `stopPropagation` on a `<span role="link">`
- ✅ Smallest diff.
- ❌ Still a nested interactive control inside a link — same a11y problem, now hidden behind ARIA.
- ❌ No middle-click / "open in new tab" on the seller.

### Option B — Drop the card-wide link; link only the media and the title
- ✅ Valid HTML.
- ❌ Loses whole-card clickability, a real UX regression (the dead zone around price/rating would no longer open the product).

### Option C — Overlay-link ("stretched link") pattern ← **SELECTED**
The card root becomes a `relative` `<div>` (not a link). The product title is a `<Link>` whose `::after` is `absolute inset-0`, covering the whole card. The seller block is a sibling `<Link>` with `relative z-10`, sitting above that overlay.
- ✅ Valid HTML — two sibling links, no nesting.
- ✅ Whole card still opens the product.
- ✅ Two clean tab stops: product, then seller. Both support middle-click and "open in new tab".
- ✅ Removes the need for the existing `preventDefault` hacks on the carousel controls — they only need to sit above the overlay.
- ⚠️ Requires care with z-index layering.

## Decision
**Option C.** It is the established solution to exactly this problem and it *simplifies* the existing carousel-button workarounds rather than adding another one.

## Implementation guidelines
1. Card root: `<div className="group relative …">` — move the existing classes off the `Link`.
2. Title: `<Link to={productHref(product)} className="… after:absolute after:inset-0 after:z-0">`. Give the link an accessible name equal to the product title (it already is the title text).
3. Seller block: `<Link to={`/s/${encodeURIComponent(product.seller_handle)}`} className="relative z-10 …">`, rendered **only when `seller_handle` exists** — otherwise keep today's non-interactive avatar+name (mirror the same guard `ProductPage.tsx:436-458` already uses).
4. Carousel arrows and dots (L102-151): add `relative z-10`; the `preventDefault`/`stopPropagation` calls can then be dropped since they are no longer inside a link.
5. Hover affordance: keep `group-hover:shadow-md` on the root; give the seller link its own hover (e.g. `hover:underline`) so it reads as separately clickable.
6. `CatalogGrid` needs no change — it just renders `ProductCard`.

## Note on the product page
AC 19 (seller clickable on the product page) is **already implemented** at `ProductPage.tsx:436-451`. Verify only. One optional polish: that block shows the raw `/s/handle` as a subtitle, which is a bit technical for buyers — consider replacing it with something like "Смотреть профиль", but this is cosmetic and out of scope unless requested.
