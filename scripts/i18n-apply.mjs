// Writes English into the `en` slot of `l({ ru, kk, en })` phrases, matching
// them by their exact Russian text.
//
// Only the `en` slot is ever rewritten: Russian and Kazakh are copied through
// character for character. The file is refused outright if any Cyrillic word
// appears in it that was not there before — English replacing Russian can only
// ever remove Cyrillic words, never add one.
//
// Usage: node scripts/i18n-apply.mjs <translations.json> [--write]

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { phraseRegex, readPhrase, CYRILLIC } from "./i18n-phrases.mjs";

const [mapFile] = process.argv.slice(2);
const write = process.argv.includes("--write");

if (!mapFile) {
  console.error("usage: node scripts/i18n-apply.mjs <translations.json> [--write]");
  process.exit(1);
}

const translations = JSON.parse(readFileSync(mapFile, "utf8"));

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) out.push(full);
  }
  return out;
}

let applied = 0;
const unknown = new Set();
const touched = [];

for (const file of sourceFiles("src")) {
  const original = readFileSync(file, "utf8");
  if (!original.includes("l({")) continue;

  let fileApplied = 0;
  const output = original.replace(phraseRegex(), (...args) => {
    const { whole, ru, kk, en } = readPhrase(args);
    const english = translations[ru.text];

    if (!english) {
      if (CYRILLIC.test(en.text)) unknown.add(ru.text);
      return whole;
    }
    if (en.text === english) return whole;

    fileApplied += 1;
    return (
      `l({ ru: ${ru.quote}${ru.text}${ru.quote}, ` +
      `kk: ${kk.quote}${kk.text}${kk.quote}, ` +
      `en: ${en.quote}${english}${en.quote} })`
    );
  });

  if (!fileApplied) continue;

  const wordsBefore = new Set(original.match(/[Ѐ-ӿ]+/g) ?? []);
  const wordsAfter = new Set(output.match(/[Ѐ-ӿ]+/g) ?? []);
  const introduced = [...wordsAfter].filter((word) => !wordsBefore.has(word));
  if (introduced.length) {
    console.error(`REFUSED ${file}: would introduce ${introduced.join(", ")}`);
    continue;
  }

  applied += fileApplied;
  touched.push(`${file}  ${fileApplied}`);
  if (write) writeFileSync(file, output);
}

for (const line of touched) console.log(line);
if (unknown.size) {
  console.log(`\nno translation supplied for ${unknown.size} phrase(s):`);
  for (const phrase of [...unknown].slice(0, 10)) console.log("  " + phrase);
}
console.log(
  `\n${write ? "wrote" : "would write"} ${applied} translation(s) into ${touched.length} file(s)`,
);
