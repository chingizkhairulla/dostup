import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

// The regression this file exists for.
//
// 155 of the 730 rewritten sites were written Kazakh-first
// (`language === "kk" ? <kk> : <ru>`), so the codemod had to invert their
// operands. Getting that wrong would have put Kazakh in the `ru` slot and
// Russian in the `kk` slot on those 155 phrases — and nothing would have
// complained: it typechecks, it renders, and it only shows up as Russian
// speakers suddenly reading Kazakh. These tests check the slots by their
// alphabets instead of trusting the rewrite.

const KAZAKH_ONLY = /[әіңғүұқөһӘІҢҒҮҰҚӨҺ]/;
const CYRILLIC = /[Ѐ-ӿ]/;
const LATIN_WORD = /[A-Za-z]{2,}/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(resolve(process.cwd(), dir))) {
    const full = join(dir, entry);
    if (statSync(resolve(process.cwd(), full)).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) out.push(full);
  }
  return out;
}

interface Phrase {
  file: string;
  ru: string;
  kk: string;
  en: string;
}

/** Pulls out every `l({ ru: "…", kk: "…", en: "…" })` written on one line. */
function phrases(): Phrase[] {
  const found: Phrase[] = [];
  const pattern =
    /l\(\{\s*ru:\s*"((?:[^"\\]|\\.)*)",\s*kk:\s*"((?:[^"\\]|\\.)*)",\s*en:\s*"((?:[^"\\]|\\.)*)"\s*\}\)/g;

  for (const file of sourceFiles("src")) {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const match of source.matchAll(pattern)) {
      found.push({ file, ru: match[1], kk: match[2], en: match[3] });
    }
  }
  return found;
}

const all = phrases();

describe("the three-language phrases", () => {
  it("exist in quantity — the rewrite really happened", () => {
    expect(all.length).toBeGreaterThan(400);
  });

  it("never put a Kazakh-only letter in the Russian slot", () => {
    // Kazakh has letters Russian does not (ә, і, ң, ғ, ү, ұ, қ, ө, һ). Finding
    // one in `ru` means that phrase's operands were swapped.
    const swapped = all
      .filter((phrase) => KAZAKH_ONLY.test(phrase.ru))
      .map((phrase) => `${phrase.file}: ru="${phrase.ru}"`);

    expect(swapped).toEqual([]);
  });

  it("keeps Russian and Kazakh distinct where the original distinguished them", () => {
    // A handful are legitimately identical in both ("Email", "PIN", "файл").
    // What must never happen is the Kazakh slot holding the Russian text while
    // the Russian slot holds something else.
    const suspicious = all
      .filter((phrase) => phrase.ru !== phrase.kk)
      .filter((phrase) => CYRILLIC.test(phrase.kk) && !KAZAKH_ONLY.test(phrase.kk))
      .filter((phrase) => phrase.kk === phrase.en && phrase.ru !== phrase.en)
      .map((phrase) => `${phrase.file}: kk="${phrase.kk}" looks like the Russian one`);

    expect(suspicious).toEqual([]);
  });

  it("seeds English from Russian, never from Kazakh", () => {
    // Until a phrase is translated, `en` holds the Russian text — the language
    // most of the audience reads. It must never hold the Kazakh text.
    const wrongFallback = all
      .filter((phrase) => phrase.en === phrase.kk && phrase.en !== phrase.ru)
      .filter((phrase) => KAZAKH_ONLY.test(phrase.en))
      .map((phrase) => `${phrase.file}: en="${phrase.en}"`);

    expect(wrongFallback).toEqual([]);
  });
});

describe("how much English is still missing", () => {
  // The measurable definition of done from the creative phase: an English slot
  // still holding Cyrillic has not been translated yet. This test does not
  // fail the build on the remaining ones — it records the number so progress
  // is visible and cannot be quietly overstated.
  it("reports the outstanding count", () => {
    const untranslated = all.filter((phrase) => CYRILLIC.test(phrase.en));
    const done = all.length - untranslated.length;

    console.log(
      `[i18n] inline phrases: ${done}/${all.length} translated, ${untranslated.length} still showing Russian to English readers`,
    );

    expect(untranslated.length).toBeLessThanOrEqual(all.length);
  });

  it("has fully translated the files already marked done", () => {
    // Files move into this list as their English is written. Once a file is
    // here, a new untranslated phrase in it fails the build.
    const TRANSLATED_FILES = ["src/components/materials/MaterialsProtectionNotice.tsx"];

    const regressions = all
      .filter((phrase) => TRANSLATED_FILES.some((file) => phrase.file.replace(/\\/g, "/") === file))
      .filter((phrase) => CYRILLIC.test(phrase.en) && LATIN_WORD.test(phrase.ru) === false)
      .map((phrase) => `${phrase.file}: en="${phrase.en}"`);

    expect(regressions).toEqual([]);
  });
});
