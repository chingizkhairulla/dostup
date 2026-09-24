import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  isLanguage,
  localeTag,
  pickLanguage,
  pluralForm,
  toLanguage,
} from "./language";

describe("the list of languages the platform speaks", () => {
  it("is Russian, Kazakh and English, with English last", () => {
    expect(LANGUAGES.map((entry) => entry.code)).toEqual(["ru", "kk", "en"]);
  });

  it("carries the native name of each, since that is what a switcher shows", () => {
    expect(LANGUAGES.map((entry) => entry.label)).toEqual(["Русский", "Қазақша", "English"]);
    expect(LANGUAGES.map((entry) => entry.short)).toEqual(["RU", "KK", "EN"]);
  });
});

describe("guarding a stored language", () => {
  it("accepts the three we speak", () => {
    expect(isLanguage("ru")).toBe(true);
    expect(isLanguage("kk")).toBe(true);
    expect(isLanguage("en")).toBe(true);
  });

  it("rejects anything else, including the shapes storage can really hold", () => {
    expect(isLanguage("de")).toBe(false);
    expect(isLanguage("")).toBe(false);
    expect(isLanguage(null)).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
    expect(isLanguage(42)).toBe(false);
    expect(isLanguage("RU")).toBe(false);
  });

  it("falls back to Russian rather than indexing translations with rubbish", () => {
    expect(toLanguage("kk")).toBe("kk");
    expect(toLanguage("klingon")).toBe("ru");
    expect(toLanguage(null)).toBe("ru");
    expect(DEFAULT_LANGUAGE).toBe("ru");
  });
});

describe("picking one phrase out of three", () => {
  const phrase = { ru: "Расписание", kk: "Кесте", en: "Schedule" };

  it("returns the asked-for language, never a neighbour", () => {
    expect(pickLanguage("ru", phrase)).toBe("Расписание");
    expect(pickLanguage("kk", phrase)).toBe("Кесте");
    // The bug this whole helper exists to prevent: English must not get Kazakh.
    expect(pickLanguage("en", phrase)).toBe("Schedule");
  });
});

describe("locale-aware formatting", () => {
  it("maps each language to its BCP 47 tag", () => {
    expect(localeTag("ru")).toBe("ru-RU");
    expect(localeTag("kk")).toBe("kk-KZ");
    expect(localeTag("en")).toBe("en-GB");
  });

  it("gives English the one/other split and Russian its own", () => {
    expect(pluralForm("en", 1)).toBe("one");
    expect(pluralForm("en", 2)).toBe("other");
    expect(pluralForm("en", 5)).toBe("other");

    expect(pluralForm("ru", 1)).toBe("one");
    expect(pluralForm("ru", 3)).toBe("few");
    expect(pluralForm("ru", 7)).toBe("many");
  });
});
