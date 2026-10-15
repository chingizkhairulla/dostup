import type { Locale } from "date-fns";
import { enGB, kk, ru } from "date-fns/locale";
import type { Language } from "@/lib/language";

// date-fns needs a locale object, not a tag, so `localeTag()` does not help it.
// Typed by Language: a fourth language cannot be added without its dates.
const DATE_LOCALES: Record<Language, Locale> = { ru, kk, en: enGB };

/**
 * The date-fns locale for the reader's language — pass it as
 * `format(date, "d MMMM", { locale: dateLocale(language) })`.
 *
 * A date formatted with the Russian locale written in by hand prints
 * "5 сент" and "понедельник" whatever language is selected, and no search for
 * Cyrillic in the source can find it, because the Russian only exists at run time.
 */
export function dateLocale(language: Language): Locale {
  return DATE_LOCALES[language];
}
