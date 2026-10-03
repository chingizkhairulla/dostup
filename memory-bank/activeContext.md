# Active Context

## Current focus (2026-09-29)
Customer feedback round 3 on the product editor, product page and seller storefront. Level 3. VAN, PLAN, CREATIVE and BUILD (P0–P6, P8) done, 345 tests green. Deploy handed to the user; reflection done; next `/archive`. User answers, plan and phases: `memory-bank/tasks.md`. Deployment of the migration and the two functions is authorised; ask first only for large changes to tables unrelated to this work.

- Reference photos arrived only as 128x80 thumbnails; build to the text.
- Decided: autosave removed in both modes (Создать / Сохранить buttons); crop becomes a nested dialog; back button stays top-left but sticky via an `AppHeader` `below` slot. See `creative/creative-round3-editor-exit-and-back-button.md`.
- Most storefront items already exist in code but are **not deployed**. Deployment, not code, is the blocker there.
- Cover-crop bug: the crop UI is a mode of the editor dialog, so an outside click closes the whole editor.

The previous task (Product Preview / Editor / Storefront) was closed on 2026-09-29.

## Context the next task should know
- Branch `предпросмотер` holds rounds 1 and 2 of the editor/preview work (`949f4b8`, `70d5069`). It is not merged into `main` and not pushed.
- Archive: `memory-bank/archive/archive-preview-editor-storefront.md`. Design rationale for the current editor window: `memory-bank/creative/creative-editor-window-round2.md`.
- Deployment is still pending (migration + edge functions). Private-by-default and storefront metrics are not live until it happens.
- Layout changes must be verified in real headless Chrome and ideally on a real phone, not only in jsdom. Every layout bug in the previous task was invisible to component tests.
- Tests are required for every phase (vitest + jsdom + testing-library, `npm test`, 338 tests as of round 2).
- The English-language task lives on branch `английский-язык`. The dark theme was cancelled.
