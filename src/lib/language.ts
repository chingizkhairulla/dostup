// The single place that knows which languages the platform speaks.
//
// Everything else — the type, the switchers, the translation objects, the date
// formats — derives from LANGUAGES, so adding a fourth language is one entry
// here plus whatever the compiler then points at, rather than another hunt
// through forty files.

export const LANGUAGES = [
  { code: "ru", label: "Русский", short: "RU", locale: "ru-RU" },
  { code: "kk", label: "Қазақша", short: "KK", locale: "kk-KZ" },
  { code: "en", label: "English", short: "EN", locale: "en-GB" },
] as const;

export type Language = (typeof LANGUAGES)[number]["code"];

/**
 * A phrase in every language the platform speaks. Every field is required, so
 * a site that forgets English cannot compile — which is the whole point: the
 * old `language === "ru" ? <ru> : <kk>` shape silently served Kazakh to
 * English readers.
 */
export type Translated = { [K in Language]: string };

const LANGUAGE_CODES: readonly string[] = LANGUAGES.map((entry) => entry.code);

export const DEFAULT_LANGUAGE: Language = "ru";

/** Guards values coming from storage, URLs or old clients. */
export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && LANGUAGE_CODES.includes(value);
}

/** Falls back to Russian for anything unrecognised. */
export function toLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

/**
 * The language this device last chose, as LanguageContext stores it — for code
 * outside React (server calls that need to say which language to answer in).
 * Anything unrecognised, or a blocked storage, is Russian.
 */
export function storedLanguage(): Language {
  try {
    return toLanguage(localStorage.getItem("language"));
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/** Picks one phrase. Pure, so non-React code can use it too. */
export function pickLanguage(language: Language, phrase: Translated): string {
  return phrase[language];
}

/** BCP 47 tag for Intl / toLocaleDateString. */
export function localeTag(language: Language): string {
  return LANGUAGES.find((entry) => entry.code === language)?.locale ?? "ru-RU";
}

/**
 * Counted phrases. Russian and Kazakh are handled by the existing
 * one/few/many wording; English only ever needs one/other, so callers give
 * both and Intl decides which English form applies.
 */
export function pluralForm(language: Language, count: number): Intl.LDMLPluralRule {
  return new Intl.PluralRules(localeTag(language)).select(count);
}
