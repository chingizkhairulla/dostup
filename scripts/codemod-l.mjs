// Rewrites the inline two-language ternaries into the three-language helper.
//
//   language === "ru" ? A : B   →   l({ ru: A, kk: B, en: A })
//   language === "kk" ? A : B   →   l({ ru: B, kk: A, en: B })
//
// The two forms are handled in SEPARATE passes on purpose: 155 sites put
// Kazakh first, and a single regex over both would swap Russian and Kazakh on
// those while typechecking stayed green. English is seeded from the RUSSIAN
// side, never the Kazakh one, so an unfinished string shows the language most
// of the audience reads.
//
// Usage: node scripts/codemod-l.mjs [--write] [file ...]

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const write = process.argv.includes("--write");
const explicitFiles = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) out.push(full);
  }
  return out;
}

/**
 * Reads one operand of the ternary starting at `start`: a plain string literal
 * or a template literal, with any surrounding whitespace and line breaks.
 * Returns null for anything else — JSX, a call, a nested ternary — which is
 * left for a human rather than guessed at.
 */
function readOperand(source, start) {
  let i = start;
  while (i < source.length && /\s/.test(source[i])) i += 1;

  const quote = source[i];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;

  let j = i + 1;
  while (j < source.length) {
    if (source[j] === "\\") {
      j += 2;
      continue;
    }
    if (source[j] === quote) break;
    // A template literal with an interpolation is fine — the braces just have
    // to be skipped so a `}` inside cannot end the literal early.
    if (quote === "`" && source[j] === "$" && source[j + 1] === "{") {
      let depth = 1;
      j += 2;
      while (j < source.length && depth > 0) {
        if (source[j] === "{") depth += 1;
        else if (source[j] === "}") depth -= 1;
        j += 1;
      }
      continue;
    }
    j += 1;
  }
  if (j >= source.length) return null;

  return { text: source.slice(i, j + 1), end: j + 1 };
}

function transform(source, firstLanguage) {
  const marker = `language === "${firstLanguage}"`;
  const parts = [];
  let cursor = 0;
  let count = 0;
  let skipped = 0;

  while (true) {
    const at = source.indexOf(marker, cursor);
    if (at === -1) break;

    let q = at + marker.length;
    while (q < source.length && /\s/.test(source[q])) q += 1;
    if (source[q] !== "?") {
      parts.push(source.slice(cursor, at + marker.length));
      cursor = at + marker.length;
      continue;
    }

    const first = readOperand(source, q + 1);
    if (!first) {
      skipped += 1;
      parts.push(source.slice(cursor, at + marker.length));
      cursor = at + marker.length;
      continue;
    }

    let colon = first.end;
    while (colon < source.length && /\s/.test(source[colon])) colon += 1;
    if (source[colon] !== ":") {
      skipped += 1;
      parts.push(source.slice(cursor, at + marker.length));
      cursor = at + marker.length;
      continue;
    }

    const second = readOperand(source, colon + 1);
    if (!second) {
      skipped += 1;
      parts.push(source.slice(cursor, at + marker.length));
      cursor = at + marker.length;
      continue;
    }

    // `first` is whichever language the comparison named.
    const ru = firstLanguage === "ru" ? first.text : second.text;
    const kk = firstLanguage === "ru" ? second.text : first.text;

    parts.push(source.slice(cursor, at));
    parts.push(`l({ ru: ${ru}, kk: ${kk}, en: ${ru} })`);
    cursor = second.end;
    count += 1;
  }

  parts.push(source.slice(cursor));
  return { output: parts.join(""), count, skipped };
}

/**
 * Post-condition from the creative phase: no Russian or Kazakh text was
 * altered. Compared as a SET, not a list — seeding `en` from the Russian side
 * duplicates that literal on purpose, so counts are expected to change while
 * the collection of distinct phrases must not.
 */
function literals(source) {
  // Compared as Cyrillic words rather than whole literals: a ternary sitting
  // inside a template literal legitimately rewrites that literal's shape
  // without touching a single Russian or Kazakh word.
  const found = source.match(/[Ѐ-ӿ]+/g) ?? [];
  return [...new Set(found)].sort();
}

const files = explicitFiles.length ? explicitFiles : sourceFiles("src");
let totalChanged = 0;
let totalSkipped = 0;
const touched = [];

for (const file of files) {
  const original = readFileSync(file, "utf8");
  if (!original.includes('language === "ru"') && !original.includes('language === "kk"')) continue;

  const passOne = transform(original, "ru");
  const passTwo = transform(passOne.output, "kk");
  const changed = passOne.count + passTwo.count;
  const skipped = passOne.skipped + passTwo.skipped;
  if (!changed) {
    totalSkipped += skipped;
    continue;
  }

  const before = literals(original);
  const after = literals(passTwo.output);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    console.error(`REFUSED ${file}: Russian/Kazakh text would have changed`);
    continue;
  }

  totalChanged += changed;
  totalSkipped += skipped;
  touched.push(`${file}  +${changed}${skipped ? ` (${skipped} left by hand)` : ""}`);
  if (write) writeFileSync(file, passTwo.output);
}

for (const line of touched) console.log(line);
console.log(
  `\n${write ? "rewrote" : "would rewrite"} ${totalChanged} site(s) in ${touched.length} file(s); ` +
    `${totalSkipped} left for a human`,
);
