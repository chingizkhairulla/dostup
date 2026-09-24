import { describe, expect, it } from "vitest";
import { translations, type TranslationKey } from "./translations";
import { LANGUAGES } from "./language";

// How "done" is measured for the English rollout.
//
// Comparing en to ru cannot work: plenty of strings are legitimately identical
// in both ("Dostup", "PIN", an email address). What is always true of a
// finished English string, and never true of an untranslated one, is that it
// contains no Cyrillic. That is the invariant these tests hold, so the
// remaining work is always an exact, self-maintaining list.

const CYRILLIC = /[Ѐ-ӿ]/;
const PLACEHOLDER = /\{[a-zA-Z]+\}/g;

const keys = Object.keys(translations.ru) as TranslationKey[];

describe("every language answers every key", () => {
  it.each(LANGUAGES.map((entry) => entry.code))("%s has all of them", (code) => {
    const missing = keys.filter((key) => translations[code][key] === undefined);

    expect(missing).toEqual([]);
  });

  it("no language has stray keys the others do not", () => {
    for (const { code } of LANGUAGES) {
      expect(Object.keys(translations[code]).sort()).toEqual([...keys].sort());
    }
  });

  it("nothing is blank unless it is blank in Russian too", () => {
    const blank: string[] = [];
    for (const { code } of LANGUAGES) {
      for (const key of keys) {
        if (translations[code][key].trim() === "" && translations.ru[key].trim() !== "") {
          blank.push(`${code}.${key}`);
        }
      }
    }

    expect(blank).toEqual([]);
  });
});

describe("placeholders survive translation", () => {
  // A dropped {count} or a renamed {email} shows the reader a literal brace or
  // silently loses the value, and only in one language.
  it("each key uses the same placeholders in every language", () => {
    const mismatched: string[] = [];

    for (const key of keys) {
      const expected = (translations.ru[key].match(PLACEHOLDER) ?? []).sort();
      for (const { code } of LANGUAGES) {
        const actual = (translations[code][key].match(PLACEHOLDER) ?? []).sort();
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          mismatched.push(`${code}.${key}: ${actual.join(",")} ≠ ${expected.join(",")}`);
        }
      }
    }

    expect(mismatched).toEqual([]);
  });
});

describe("the English dictionary is actually English", () => {
  it("contains no Cyrillic anywhere", () => {
    const untranslated = keys
      .filter((key) => CYRILLIC.test(translations.en[key]))
      .map((key) => `${key}: ${translations.en[key]}`);

    expect(untranslated).toEqual([]);
  });

  it("never borrows a Kazakh-only letter, which would mean the wrong fallback", () => {
    const kazakh = /[әіңғүұқөһ]/i;
    const leaked = keys.filter((key) => kazakh.test(translations.en[key]));

    expect(leaked).toEqual([]);
  });
});

describe("the Kazakh dictionary stays Kazakh", () => {
  it("was not overwritten while English was added", () => {
    expect(translations.kk.settings).toBe("Баптаулар");
    expect(translations.kk.back).toBe("Артқа");
    expect(translations.ru.settings).toBe("Настройки");
  });
});
