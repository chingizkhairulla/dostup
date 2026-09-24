// Where the translated phrases actually live, so "which screens still need
// looking at" is a list of files rather than a hand-wave.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { phraseRegex } from "./i18n-phrases.mjs";

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
for (const file of sourceFiles("src")) {
  const source = readFileSync(file, "utf8");
  if (!source.includes("l({")) continue;
  const count = [...source.matchAll(phraseRegex())].length;
  if (count) rows.push({ file: file.replace(/\\/g, "/"), count });
}

rows.sort((a, b) => b.count - a.count);
let total = 0;
for (const row of rows) {
  total += row.count;
  console.log(String(row.count).padStart(4) + "  " + row.file);
}
console.log(`\n${total} phrases across ${rows.length} files`);
