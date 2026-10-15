import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sourceFiles } from "../../scripts/i18n-raw.mjs";

// "Создано 1 слотов", "1 slots": a number written straight in front of a noun
// whose form depends on it. Russian needs one / few / many (pluralRu, countRu),
// English one / other (countEn). This fails on the shape, not on a list of the
// sites found so far.

// «элем.» is left out on purpose: an abbreviation reads the same after any number.
const RUSSIAN_PLURAL_NOUN =
  /ru:\s*`[^`]*\$\{[^}]+\}\s(слотов|файлов|дней|уроков|учеников|материалов|участников|покупателей|продуктов)/;
const ENGLISH_PLURAL_NOUN =
  /en:\s*`[^`]*\$\{[^}]+\}\s(slots|files|days|lessons|students|materials|items|participants|buyers|products)\b/;

const lines = sourceFiles("src").flatMap((file) =>
  readFileSync(file, "utf8")
    .split("\n")
    .map((text, index) => ({ text, where: `${file}:${index + 1}` })),
);

describe("counted phrases", () => {
  it("never put a bare number before a Russian noun in the plural", () => {
    expect(lines.filter(({ text }) => RUSSIAN_PLURAL_NOUN.test(text)).map(({ where }) => where)).toEqual([]);
  });

  it("never put a bare number before an English noun in the plural", () => {
    expect(lines.filter(({ text }) => ENGLISH_PLURAL_NOUN.test(text)).map(({ where }) => where)).toEqual([]);
  });
});

describe("the day heading on the schedule", () => {
  it("is not title-cased word by word («Записи На 13 Октября»)", () => {
    // The code already upper-cases the first letter of the date; a
    // `capitalize` class on the heading also capitalised every other word.
    const capitalised = sourceFiles("src")
      .filter((file) => /ScheduleTab\.tsx$/.test(file))
      .flatMap((file) => {
        const source = readFileSync(file, "utf8").split("\n");
        return source
          .map((text, index) => ({ text, index }))
          .filter(({ text }) => text.includes('ru: "Записи на "'))
          .filter(({ index }) => source.slice(Math.max(0, index - 3), index).some((line) => /\bcapitalize\b/.test(line)))
          .map(({ index }) => `${file}:${index + 1}`);
      });
    expect(capitalised).toEqual([]);
  });
});
