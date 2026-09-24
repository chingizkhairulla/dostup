// Dumps the phrases whose English slot still holds Russian, grouped by the
// distinct Russian text — the same sentence usually appears in several files,
// and translating it once is both faster and more consistent.
//
// Usage: node scripts/i18n-extract.mjs <out.json> [--files a,b,c]

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CYRILLIC = /[Ѐ-ӿ]/;
const PHRASE =
  /l\(\{\s*ru:\s*(["'`])((?:[^\\]|\\.)*?)\1,\s*kk:\s*(["'`])((?:[^\\]|\\.)*?)\3,\s*en:\s*(["'`])((?:[^\\]|\\.)*?)\5\s*\}\)/gs;

const outFile = process.argv[2] ?? "i18n-todo.json";
const filesArg = process.argv.find((arg) => arg.startsWith("--files="));
const onlyFiles = filesArg ? filesArg.slice("--files=".length).split(",") : null;

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) out.push(full);
  }
  return out;
}

const byRussian = new Map();

for (const file of sourceFiles("src")) {
  const normalised = file.replace(/\\/g, "/");
  if (onlyFiles && !onlyFiles.some((wanted) => normalised.includes(wanted))) continue;

  const source = readFileSync(file, "utf8");
  if (!source.includes("l({")) continue;

  for (const match of source.matchAll(PHRASE)) {
    const [, , ru, , kk, , en] = match;
    if (!CYRILLIC.test(en)) continue;

    const existing = byRussian.get(ru);
    if (existing) {
      existing.count += 1;
      if (!existing.files.includes(normalised)) existing.files.push(normalised);
    } else {
      byRussian.set(ru, { ru, kk, en: "", count: 1, files: [normalised] });
    }
  }
}

const entries = [...byRussian.values()].sort((a, b) => b.count - a.count);
writeFileSync(outFile, JSON.stringify(entries, null, 2), "utf8");

console.log(
  `${entries.length} distinct phrase(s) need English, covering ` +
    `${entries.reduce((sum, entry) => sum + entry.count, 0)} occurrence(s) → ${outFile}`,
);
