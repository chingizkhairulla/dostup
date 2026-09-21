# Creative Phase: Visibility Control vs. Existing Pause

Type: **UX** · Spec refs: §4, §5 · AC 15-17

## Requirements
1. The Preview button's slot on the product card becomes visibility management (§4).
2. New products are private by default and must be publishable later (§5, AC 16-17).
3. Do not end up with two competing visibility systems (§4: "Не оставлять две разные Preview-системы"; §5: "Используй одно существующее поле visibility/status").

## Actual semantics in code
Two flags exist, and they are **not** redundant — verified in `supabase/functions/catalog/index.ts:97-146` and the `public_products` view:

| State | Flags | In marketplace? | Direct link behavior |
| --- | --- | --- | --- |
| Приватный / черновик | `is_active=false` | No | `get_product` returns null → "Продукт не найден" |
| Опубликован | `is_active=true`, `is_paused=false` | Yes | Normal, buyable |
| Приостановлен | `is_active=true`, `is_paused=true` | No | Link still resolves and shows the author's `paused_message` |

The pause state exists so that people who already have the link get an explanation ("Мы набрали достаточно учеников — ждите новый поток") instead of a dead page. That is a real, distinct product behavior, not a duplicate of private.

## Options

### Option A — Two separate controls (Видимость toggle + existing Пауза button)
- ❌ Exactly the "two competing systems" the spec warns against; the seller must reason about two booleans.

### Option B — Delete `is_paused`, express everything with `is_active`
- ❌ Destroys a distinct behavior (paused link with a message) and orphans stored `paused_message` values on live products. Destructive.

### Option C — One "Видимость" control exposing all three states ← **SELECTED**
A single `DropdownMenu` (already used elsewhere in the codebase) in the freed button slot, listing: **Приватный · Опубликован · Приостановлен**, with the current state shown as a badge on the card.
- ✅ One control, one mental model — satisfies requirement 3 while preserving both behaviors.
- ✅ Both flags become implementation detail behind a single state machine.
- ✅ Choosing "Приостановлен" keeps the existing message dialog (`setPausingProduct` / `pauseMessage`), so no feature is lost.
- ✅ Publishing a private product is the same gesture as unpausing one.

## Decision
**Option C.** The card's action row becomes `[Редактировать] [Видимость ▾] [Поделиться]` plus the existing Delete, matching §4's sketch.

## Implementation guidelines
1. Derive state: `is_active === false → 'private'`; `is_paused === true → 'paused'`; else `'published'`. Keep the flags as the source of truth — **do not** add a new column (§5).
2. Transitions via the existing `updateProduct` mutation:
   - → `private`: `{ is_active: false }` (leave `is_paused` untouched so a later republish restores the prior intent, or normalize it to `false` — pick one and be consistent).
   - → `published`: `{ is_active: true, is_paused: false }`.
   - → `paused`: `{ is_active: true, is_paused: true, paused_message }` — reuse the existing pause dialog to collect the message.
3. Replace the current Pause/Resume button (`CreatorProductsTab.tsx:3152-3191`) — its logic moves into the dropdown rather than being deleted.
4. Card badge: a small colored pill next to the title showing the current state, so the seller can scan their list without opening a menu. Copy must make "Приватный" clearly mean "покупатели не видят".
5. After creating a product, surface a hint that it is private with a direct "Опубликовать" action, so private-by-default doesn't read as a bug (§5's flow: create → private → add materials/schedule → check preview → publish).
6. Verified safe: `unlock-materials` and `_shared/purchase.ts` have no `is_active` filter, so making a product private never revokes access for existing buyers (AC 36).
