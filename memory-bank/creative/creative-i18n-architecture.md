# Creative: i18n architecture (C1)

**Date:** 2026-09-22 · **Task:** English language (RU/KK/EN) · **Type:** Architecture

## 1. Requirements and constraints discovered in the code

### Requirements
- R1. Adding `en` must never cause an English user to see Kazakh. This is the whole point: today every binary ternary falls through to KK.
- R2. The existing key-based `t()` system must keep working — it is not a legacy corner, it is **615 call sites across 70 files** covering **547 keys** (`src/lib/translations.ts:1212` = `TranslationKey`).
- R3. The user asked that three languages "и дальше поддерживались" — the result must be a maintainable system, not a one-off pass.
- R4. "Done" must be measurable, not asserted.
- R5. Must not collide with in-progress calendar work, which lives in the two heaviest files.

### Constraints measured (not assumed)
| Fact | Evidence |
|---|---|
| **730** inline language comparisons, not ~800: **575** `language === "ru"` + **155** `language === "kk"` | grep over `src/**/*.{ts,tsx}` excluding tests |
| **495** of the 575 are simple `? "literal" : "literal"` one-liners | `grep -hoE 'language === "ru" \? "[^"]*" : "[^"]*"'` |
| **16** use template literals with `${}` params | e.g. `CreatorScheduleTab.tsx:433`, `useRealtimeStudentNotifications.ts:160` |
| ~64 are multiline JSX/expression forms | e.g. `CreatorProductsTab.tsx:3063-3065` |
| **155 sites are KK-first** — `language === "kk" ? <KK> : <RU>`, operands inverted | `CreatorMaterialsTab.tsx:145,155,162`, `CreatorAnnouncementsTab.tsx:37,49` |
| `t()` already interpolates `{param}` | `LanguageContext.tsx:35-44`, keys like `sellerJoinedYear: "На платформе с {year} года"` |
| `t()` fallback is `translations[lang][key] || translations.ru[key] || key` | `LanguageContext.tsx:36` |
| RU and KK key sets are **exactly in parity** (547 = 547, 0 missing) | scripted key diff |
| Heaviest files are mid-edit from the calendar task | `CreatorScheduleTab` 151 sites, `TeacherScheduleTab` 149 |

### The trap that shapes the whole design
**155 sites put Kazakh first.** A naive codemod matching `language === "ru" ? A : B` and blindly mapping `A→ru, B→kk` would, when pointed at the `=== "kk"` form, silently **swap Russian and Kazakh** on 155 strings. Nothing would crash and typecheck would stay green — the bug would ship. Any chosen option must handle both operand orders explicitly and be verified per-form.

## 2. Options

### Option A — Move all 730 sites into `t()` keys
Every site becomes `t("scheduleCreated")`; `translations.ts` grows from 547 to ~1,277 keys × 3 languages (~4,000+ lines).
- ➕ One source of truth; a translator could be handed one file; completeness = key parity; params already supported; consistent with the 615 existing calls.
- ➖ 730 key names must be invented (naming churn, collisions like `error`/`errorSaving`); text moves far from its use site, so review becomes "is key X right here?" instead of reading the sentence; one 4,000-line file is a merge-conflict magnet precisely where the calendar work is active (R5); highest chance of a mechanical mis-pairing of key→string.

### Option B — Inline three-way helper `l({ ru, kk, en })`
`language === "ru" ? "Расписание" : "Кесте"` → `l({ ru: "Расписание", kk: "Кесте", en: "Schedule" })`.
- ➕ 1:1 mechanical rewrite that keeps RU/KK text **byte-identical and in place**, so the diff is reviewable line by line; no key naming; the sentence stays where it is read; a required `en` field makes omission a **compile error** (R1 enforced by the type system, not by discipline); template-literal sites keep working unchanged because interpolation happens at the call site.
- ➖ Text scattered across 42 files (no single-file translator handoff); repeated strings ("Ошибка") duplicated; lines get longer.

### Option C — Hybrid: `l()` for the 730 inline sites, `t()` retained and preferred for shared/repeated strings
- ➕ Everything in B, plus the existing 615 `t()` calls stay untouched; genuinely shared strings can be deduplicated into keys where that pays.
- ➖ Two mechanisms coexist — but they **already** coexist today (`t()` + ternaries), so this is not a new cost, it is the current reality made explicit with a rule.

### Option D — Codemod that auto-generates keys from the Russian text
- ➕ Single system, fully automated.
- ➖ Generated names are either unreadable (`t("k_8f3a21")`) or fragile (a slug of Russian text that changes when the copy changes). Worst of both worlds for maintenance; rejected.

## 3. Decision — Option C (hybrid), with `l()` as the migration target

Rationale against the requirements: 495 of 575 sites are literal pairs, so B/C's mechanical rewrite is demonstrably safe and reviewable (R5, low regression risk), while A would rewrite the same lines *and* invent 730 names *and* concentrate the diff in the one file the calendar work also touches. R2 is satisfied by not disturbing the 615 existing `t()` calls. R1 is satisfied structurally — see the type below.

**Rule for which mechanism to use going forward** (this is the part that answers R3):
- A string already in `translations.ts` → keep using `t()`.
- A **new** string used in **3+ files** → add a `t()` key.
- Everything else → `l({...})` at the use site.

### Type design — R1 enforced by the compiler
```ts
// src/lib/language.ts
export const LANGUAGES = [
  { code: "ru", label: "Русский",  short: "RU" },
  { code: "kk", label: "Қазақша",  short: "KK" },
  { code: "en", label: "English",  short: "EN" },
] as const;

export type Language = (typeof LANGUAGES)[number]["code"];
export type Translated = { [K in Language]: string };   // all three REQUIRED

export const isLanguage = (v: unknown): v is Language =>
  typeof v === "string" && LANGUAGES.some((l) => l.code === v);

export const pickLanguage = (lang: Language, values: Translated): string => values[lang];
export const localeTag = (lang: Language) =>
  ({ ru: "ru-RU", kk: "kk-KZ", en: "en-GB" })[lang];
```
`Translated` is a mapped type over `Language`, so `en` is mandatory — an un-translated site cannot compile. `LANGUAGES` is the single list every switcher renders from, so a switcher can never drift from the type.

**Trade-off stated honestly:** because `Translated` is mapped over `Language`, adding a 4th language later turns every `l()` site into a compile error at once. That is deliberate — it produces an exact, exhaustive worklist instead of silent gaps — and the same codemod used now (seed the new language from `ru`) makes it a mechanical step. The alternative (optional fields + runtime fallback) would make a 4th language compile instantly and then quietly ship Russian everywhere, which is the exact failure we are fixing.

### Surface
- `useLanguage()` gains `l(values: Translated): string` next to the existing `t`. Components use `l` so they re-render on language change.
- Non-React callers use the pure `pickLanguage(lang, values)`.
- `ErrorBoundary.tsx:42` currently does `localStorage.getItem("language") as "ru" | "kk"` — replace the cast with `isLanguage()` (R1/robustness: a legacy or hand-edited value must not index into `translations[undefined]`).

### Codemod plan (the 730 sites)
Two **separate**, explicitly-ordered passes — never one regex over both forms:
1. **Pass 1 — RU-first** (`language === "ru" ? A : B`) → `l({ ru: A, kk: B, en: A })`
2. **Pass 2 — KK-first** (`language === "kk" ? A : B`) → `l({ ru: B, kk: A, en: B })` ← **operands inverted**

Both passes run per file with a printed count, and the post-condition is checked mechanically: the multiset of RU strings before and after must be identical. `en` is seeded with the **Russian** text (never Kazakh) so that, at worst, an unfinished string shows Russian — the language the user base actually reads — instead of Kazakh.

For the ~64 multiline and 16 template-literal sites: handle by hand, not by regex. Template literals need no special support — `l({ ru: \`Создано ${count} слотов!\`, … })` builds all three strings eagerly and picks one; the waste is negligible and it avoids inventing a `{count}` key convention for 16 sites.

### Measuring "done" (R4) — the Cyrillic invariant
An `en:` value seeded from Russian is indistinguishable from a deliberately identical one (`"SAT"`, `"IELTS"`, `"Email"`) if we compare `en === ru`. Instead, use a property that is true of *every* finished English string and false of *every* placeholder:

> **No `en:` value, anywhere, contains a Cyrillic character.**

This is self-maintaining (no inventory file to go stale), passes naturally for legitimately identical Latin strings, and yields an exact remaining-work list. Two tests implement it: one over `translations.en`, one scanning `l({...})` literals in `src/**`.

### Dates, numbers, plurals
- One `localeTag()` feeds the 18 `toLocaleDateString`/`Intl` call sites; `formatEventDate` (`catalog.ts:170`) gains English month abbreviations.
- English needs one/other where RU/KK use one/few/many. Provide `plural(count, { one, other })` via `Intl.PluralRules` for the EN branch of counted strings.
- **Pre-existing defect, flagged not fixed (scope):** counted Russian strings are already ungrammatical for some counts — `CreatorScheduleTab.tsx:433` renders "Создано 1 слотов". Translating to English must not quietly rewrite Russian grammar across the app; recorded here as a separate follow-up.

## 4. Implementation guidelines
1. Create `src/lib/language.ts` (above). Re-export `Language` from `translations.ts` to avoid a churn of import paths.
2. Add `translations.en` typed as `Record<TranslationKey, string>` so a missing key fails `tsc`.
3. Extend `LanguageContext` with `l`; validate stored language with `isLanguage`; keep the `lang → ru → key` fallback and add a dev-only `console.warn` naming each fallback hit.
4. Run codemod pass 1, then pass 2, file by file, committing per area so a regression is bisectable.
5. Rebuild `LanguageSwitcher` and `PublicLocaleToggle` to `.map(LANGUAGES)` — order ru, kk, en (EN after Kazakh, as asked).
6. Translate area by area (Phase 4 order), removing Cyrillic from `en:` slots as you go.

### Tests (per project rule, written with each phase)
- `Translated` completeness: `translations.en` has every `TranslationKey`; no empty strings; `{param}` placeholders identical across ru/kk/en.
- `l()` returns the right member per language; `pickLanguage` is pure.
- `isLanguage` rejects `"de"`, `""`, `null`, and `LanguageProvider` falls back to `ru` for a garbage `localStorage` value.
- **Anti-swap test** (guards the 155 KK-first sites): known strings from `CreatorMaterialsTab` and `CreatorAnnouncementsTab` render Russian under `ru` and Kazakh under `kk` — this is the specific regression the codemod could otherwise introduce silently.
- **No-Kazakh-for-English guard**: representative components rendered under `en` contain none of `әіңғүұқөһ`.
- **Cyrillic invariant**: no `en:` value in `l({...})` and no value in `translations.en` contains `[а-яА-ЯёЁ]`.
- `LANGUAGES`-driven switchers render exactly three options in order ru, kk, en.

## 5. Verification against requirements
| Req | Met? | How |
|---|---|---|
| R1 never KK for EN | ✅ | `Translated` requires `en` (compile error otherwise); `en` seeded from RU, never KK; guard test |
| R2 keep `t()` | ✅ | 615 existing calls untouched; hybrid rule defines when to use which |
| R3 maintainable / extensible | ✅ | Single `LANGUAGES` list drives type + switchers; 4th language = exhaustive compile-time worklist + same codemod |
| R4 measurable done | ✅ | Cyrillic invariant gives an exact remaining list |
| R5 avoid calendar conflict | ✅ | In-place rewrite instead of a 4,000-line shared file; schedule tabs migrated last |

🎨🎨🎨 EXITING CREATIVE PHASE — decision: **hybrid, `l({ru,kk,en})` + retained `t()`**, two-pass codemod, Cyrillic invariant as the completeness metric.
