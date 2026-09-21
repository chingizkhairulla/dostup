# Creative Phase: Preview Isolation Architecture

Type: **Architecture** · Spec refs: §1, §2, §3.1 · AC 1-9, 13

## Requirements
1. Inside Preview the user can reach **nothing** of the platform — no back button, no Notifications, no Messages, no Account (AC 1-5).
2. Phone and Desktop modes, **always** opening on Phone regardless of the viewer's device (AC 6-8).
3. Phone mode must show the **real responsive mobile layout** (§2.1), not a narrow desktop layout.
4. Must reuse the real Product Page — no second copy to maintain (§2.2, AC 9).
5. Must render **unsaved draft** form state live, with no DB write (§3.1, AC 13).

## Constraints discovered in code
- `ProductPage.tsx:829` renders the mobile buy bar as `fixed bottom-0 left-0 right-0`. Rendered inline, `position: fixed` resolves against the **browser viewport**, so it would escape any 390px preview container and stretch across the whole screen.
- `ProductPage` uses standard Tailwind `lg:` breakpoints throughout (`lg:grid-cols-…` L554, `lg:hidden` L829, `lg:pb-0` L827). Media queries resolve against the **browser** width, not a parent container. A 390px-wide `div` on a desktop browser would still render the **desktop** layout — directly violating requirement 3.
- No `X-Frame-Options` or CSP `frame-ancestors` anywhere (`vercel.json`, `middleware.ts`, `vite.config.ts`, `index.html`) — same-origin iframes are viable.
- `middleware.ts` matches `/p/:path*` and 301-redirects UUID→slug, so a preview URL under `/p/` would pass through redirect logic.

## Options

### Option A — Render `ProductPage` inline with `previewProduct` / `isPreview` props
- ✅ Simplest data flow; draft state passed straight down as a prop.
- ✅ No iframe, no message passing.
- ❌ **Breaks requirement 3**: `lg:` breakpoints follow the browser window, so "Phone" preview on a desktop shows the desktop layout.
- ❌ **Breaks the layout**: the `fixed` buy bar escapes the preview frame.
- ❌ Fixing both means converting `ProductPage` to container queries — a rewrite of an 889-line page, against "не переписывай проект с нуля / не ломай существующий функционал".

### Option B — Keep today's iframe pointed at the live `/p/:slug`
- ✅ Correct responsive behavior and containment (this is *why* the original author used an iframe).
- ❌ Cannot show unsaved draft data — the iframe only renders what's in the DB (fails requirement 5).
- ❌ Still renders `MarketplaceHeader` and the back link, i.e. today's bug (fails requirements 1).

### Option C — Dedicated chrome-less preview route in a same-origin iframe, fed draft data over `postMessage` ← **SELECTED**
- New route `/preview/product` renders `ProductPage` in preview mode: no `MarketplaceHeader`, no back link, no `PublicFooter`, all actions inert.
- Parent posts the mapped draft object into the iframe; the route renders from the posted draft instead of fetching.
- Phone = iframe `width: 390px`. Desktop = iframe `width: 1280px` CSS-`transform: scale()`d to fit the pane.
- ✅ Media queries evaluate against the **iframe** width → genuine mobile layout at 390px, genuine desktop layout at 1280px (requirement 3).
- ✅ `position: fixed` is contained by the iframe's browsing context (the buy bar sits correctly at the bottom of the phone frame).
- ✅ Isolation is structural, not cosmetic: the chrome is never rendered, so there is nothing to click (requirements 1, AC 1-5).
- ✅ One `ProductPage`, used by the real route and both previews (requirement 4).
- ✅ Draft data arrives live without a DB write (requirement 5).
- ⚠️ Costs a small `postMessage` handshake (~40 lines) and an iframe reload on mode switch.

## Decision
**Option C.** This reverses the recommendation recorded during `/plan`, which assumed inline rendering was viable. It is not: the `fixed` buy bar and viewport-scoped `lg:` breakpoints make an inline preview show the *wrong* layout, and §2.1 explicitly demands the real responsive mobile version. The iframe is the correct primitive for a nested viewport; the original author's instinct was right. The actual bug was never the iframe — it was pointing it at the fully-chromed public route.

## Implementation guidelines
1. **Route**: add `/preview/product` in `App.tsx` (public, outside `RequireProfile`). Deliberately *not* under `/p/` so it bypasses the `middleware.ts` matcher and never collides with public product URLs. Add `noindex`.
2. **`ProductPage` props**: `isPreview?: boolean`, `previewProduct?: PreviewProduct`. When `isPreview`:
   - skip `MarketplaceHeader` (L368/380/544), the "← Назад" `Link` (L546-552) and `PublicFooter` (L827);
   - gate every query with `enabled: !isPreview` (`useProduct`, `useProductProgram`, `check-trial`, reviews);
   - skip `touchRecentProduct`;
   - keep buy / trial / review / report controls **visible but inert** (fidelity matters — the seller should see what the buyer sees), guarded by a single early-return in each handler.
3. **Handshake**: iframe posts `{type:'preview-ready'}` on mount; parent replies with `{type:'preview-data', product}` and re-posts on every debounced draft change. Validate `event.origin === window.location.origin` on both sides.
4. **Blob URLs work**: draft media uses `URL.createObjectURL` (`CreatorProductsTab.tsx:709/758`). Blob URLs are origin-scoped and the iframe is same-origin, so freshly picked images/videos preview without upload.
5. **Mode switch**: keep both the phone and desktop iframe mounted, or re-post data on reload — never refetch from the DB.
6. **Default**: `useState<'phone'|'desktop'>('phone')` with no device sniffing (AC 8).
7. **Close**: explicit "Закрыть предпросмотр" / X returning to the origin (AC 5).

## Verification against requirements
| # | Requirement | Met by |
| --- | --- | --- |
| 1 | No platform navigation | Chrome never rendered in the preview route |
| 2 | Phone/Desktop, phone default | Toggle over iframe width; hardcoded initial state |
| 3 | Real mobile layout | Media queries resolve against iframe width |
| 4 | Reuse real Product Page | Same `ProductPage` component, one codebase |
| 5 | Live unsaved draft | `postMessage` draft transport, no DB write |
