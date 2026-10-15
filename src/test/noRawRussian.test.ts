import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXCLUDED, UNREACHABLE, isExcluded, pinnedRussianDates, rawCyrillic, sourceFiles } from "../../scripts/i18n-raw.mjs";

// The measurable "done" for English across the platform.
//
// languageSlots.test.ts checks the phrases that go through l({ ru, kk, en }).
// It cannot see text that never went through l() at all — plain JSX, a toast,
// a placeholder — and that is exactly where ~600 Russian strings sat while the
// phrase count read "0 still Russian". This one reads the syntax tree and
// fails on any Cyrillic an English reader could be shown.

const scan = (source: string) => rawCyrillic("src/example.tsx", source).map((hit) => hit.text);

describe("the scanner", () => {
  it("sees Russian in JSX text, attributes, strings and templates", () => {
    expect(scan(`const a = <p>Привет</p>;`)).toEqual(["Привет"]);
    expect(scan(`const a = <input placeholder="Поиск" />;`)).toEqual(["Поиск"]);
    expect(scan(`toast.error("Ошибка");`)).toEqual(["Ошибка"]);
    expect(scan("const a = `Удалено ${count} файлов`;")).toEqual(["Удалено … файлов"]);
  });

  it("accepts Russian and Kazakh in a phrase that also has English", () => {
    expect(scan(`l({ ru: "Привет", kk: "Сәлем", en: "Hello" });`)).toEqual([]);
    expect(scan("l({ ru: `Файлов: ${n}`, kk: `Файл: ${n}`, en: `Files: ${n}` });")).toEqual([]);
    expect(scan(`const T = { ru: { ok: "Готово" }, kk: { ok: "Дайын" }, en: { ok: "Done" } };`)).toEqual([]);
  });

  it("rejects a Russian/Kazakh pair with no English beside it", () => {
    // The shape Phase 4 missed: an option table keyed { ru, kk } and nothing else.
    expect(scan(`const T = { ru: { ok: "Готово" }, kk: { ok: "Дайын" } };`)).toEqual(["Готово", "Дайын"]);
  });

  it("ignores comments, search keywords and matching patterns", () => {
    expect(scan(`// Комментарий\nconst a = 1; /* ещё один */`)).toEqual([]);
    expect(scan(`const s = { keywords: ["профиль", "profile"] };`)).toEqual([]);
    expect(scan(`const banned = /(спам|spam)/i;`)).toEqual([]);
  });

  it("still sees Russian nested inside an English-looking phrase", () => {
    expect(scan(`l({ ru: "а", kk: "ә", en: "Ошибка" });`)).toEqual(["Ошибка"]);
  });
});

describe("Russian written straight into the interface", () => {
  it("is gone from every screen a reader can reach", () => {
    const left = sourceFiles("src")
      .filter((file) => !isExcluded(file))
      .flatMap((file) => rawCyrillic(file))
      .map((hit) => `${hit.file}:${hit.line}  ${hit.text}`);

    if (left.length) console.log(`[i18n] ${left.length} raw Cyrillic strings left`);
    expect(left).toEqual([]);
  });

  it("is not printed by dates pinned to the Russian locale", () => {
    // `format(date, "d MMMM", { locale: ru })` prints "5 сентября" in every
    // language. The scan above cannot see it — there is no Cyrillic in the
    // source, only at run time — so the shape itself is forbidden, except
    // inside the Russian slot of a phrase, where the Russian locale is right.
    const pinned = sourceFiles("src")
      .filter((file) => !isExcluded(file))
      .flatMap((file) => pinnedRussianDates(file))
      .map((hit) => `${hit.file}:${hit.line}`);

    expect(pinned).toEqual([]);
  });

  it("recognises a pinned date, and leaves the Russian slot alone", () => {
    const count = (source: string) => pinnedRussianDates("src/example.tsx", source).length;

    expect(count(`format(day, "d MMMM", { locale: ru });`)).toBe(1);
    expect(count(`day.toLocaleDateString("ru-RU");`)).toBe(1);
    expect(count(`format(day, "d MMMM", { locale: dateLocale(language) });`)).toBe(0);
    expect(count("l({ ru: `на ${format(day, \"d MMM\", { locale: ru })}`, kk: \"\", en: \"\" });")).toBe(0);
  });

  it("only excludes files that exist", () => {
    // A renamed file would otherwise drop out of the exclusion list silently
    // and its replacement would be scanned — or not — by accident.
    const all = sourceFiles("src");
    expect([...EXCLUDED, ...UNREACHABLE].filter((file) => !all.includes(file))).toEqual([]);
  });

  it("skips unused files only while nothing imports them", () => {
    // These five are skipped because no screen leads to them. The moment one
    // is wired back in, its Russian becomes visible and this fails.
    const sources = sourceFiles("src").map((file) => ({ file, text: readFileSync(file, "utf8") }));

    const importedAgain = UNREACHABLE.filter((unused) => {
      const name = unused.replace(/^.*\//, "").replace(/\.tsx?$/, "");
      const pattern = new RegExp(`from\\s+['"][^'"]*/${name}['"]|import\\(\\s*['"][^'"]*/${name}['"]`);
      return sources.some((source) => source.file !== unused && pattern.test(source.text));
    });

    expect(importedAgain).toEqual([]);
  });
});
