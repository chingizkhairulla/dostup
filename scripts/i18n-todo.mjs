// Lists how much English is still missing from the inline phrases, per file,
// so "done" is a number rather than an impression.
//
// A phrase counts as untranslated when its `en` slot still holds Cyrillic —
// the invariant chosen in memory-bank/creative/creative-i18n-architecture.md,
// because comparing `en` to `ru` would wrongly flag the many phrases that are
// legitimately identical in both ("Dostup", "PIN", an email address).
//
// Usage: node scripts/i18n-todo.mjs [--all]

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { phraseRegex, readPhrase, CYRILLIC } from "./i18n-phrases.mjs";

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) out.push(full);
  }
  return out;
}

const rows = [];
let done = 0;
let todo = 0;

for (const file of sourceFiles("src")) {
  const source = readFileSync(file, "utf8");
  if (!source.includes("l({")) continue;

  let fileTodo = 0;
  for (const match of source.matchAll(phraseRegex())) {
    const { en } = readPhrase(match);
    if (CYRILLIC.test(en.text)) fileTodo += 1;
    else done += 1;
  }
  todo += fileTodo;
  if (fileTodo) rows.push({ file, fileTodo });
}

rows.sort((a, b) => b.fileTodo - a.fileTodo);

const show = process.argv.includes("--all") ? rows : rows.slice(0, 15);
for (const row of show) {
  console.log(String(row.fileTodo).padStart(4) + " left  " + row.file);
}
if (!process.argv.includes("--all") && rows.length > show.length) {
  console.log(`     … and ${rows.length - show.length} more files`);
}

console.log(`\n${done} translated, ${todo} still Russian, across ${rows.length} files with work left`);
