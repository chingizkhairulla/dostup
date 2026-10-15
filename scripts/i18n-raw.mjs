// Finds Russian (or Kazakh) text that is written straight into the source
// instead of going through l({ ru, kk, en }) or the t() dictionaries — the
// text an English reader still sees in Cyrillic.
//
// i18n-todo.mjs only looks inside l({…}); it cannot see a string that never
// went through l() in the first place, which is how "0 still Russian" was
// once reported with ~600 Russian lines left. This walks the real syntax tree
// (TypeScript's own parser), so comments are ignored for free and a string is
// judged by where it sits, not by what a pattern guesses.
//
// A Cyrillic string is fine when it sits in the `ru` or `kk` slot of an object
// that also has an `en` slot, or in a `keywords` list (search terms are
// matched against whatever the reader types, in any language). Regular
// expressions are matching logic, not text anyone reads, so they are not
// reported. Everything else is.
//
// Usage: node scripts/i18n-raw.mjs [--all] [--file <substring>] [--json] [--kk]
//   --kk lists phrases that show Russian to Kazakh readers instead.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export const CYRILLIC = /[Ѐ-ӿ]/;

// Files whose Russian is deliberate. Each has a reason; see memory-bank/tasks.md.
export const EXCLUDED = [
  // The dictionaries — Cyrillic is their content.
  "src/lib/translations.ts",
  // Staff-only screens; the moderator side is Russian by plan.
  "src/pages/ModeratorDashboard.tsx",
  "src/components/account/ModeratorSettingsDialog.tsx",
  // Russian keyword matching — logic, not interface text.
  "src/lib/aiCategory.ts",
  // Preset topics are stored as free text in products.topic (creative C2).
  "src/lib/taxonomyData.ts",
];

// Files nothing imports: no reader can reach their text, so translating them
// would be work on dead code. src/test/noRawRussian.test.ts fails the moment
// one of them is imported again, which is when it has to be translated.
export const UNREACHABLE = [
  "src/components/creator/ProductScheduleManager.tsx",
  "src/components/creator/AnnouncementEditor.tsx",
  "src/pages/CheckoutPage.tsx",
  "src/pages/SetupPasswordPage.tsx",
  "src/pages/AuthPage.tsx",
];

// Single strings that are Cyrillic on purpose.
export const ALLOWED = [
  // A language is named in itself, whatever the interface language is.
  { file: "src/lib/language.ts", text: "Русский" },
  { file: "src/lib/language.ts", text: "Қазақша" },
  // Not shown to anyone: it recognises the server's own (Russian) error text.
  { file: "src/hooks/useProductTeachers.ts", text: "уже добавлен" },
  // A placeholder old rows hold instead of a name: matched, never shown.
  { file: "src/lib/personName.ts", text: "Ученик" },
];

export function isExcluded(file) {
  const normalised = file.replace(/\\/g, "/");
  return [...EXCLUDED, ...UNREACHABLE].includes(normalised);
}

export function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.|\.d\.ts$/.test(entry)) out.push(full.replace(/\\/g, "/"));
  }
  return out;
}

function propertyName(node) {
  if (!node.name) return null;
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) return node.name.text;
  return null;
}

/** True when the node sits in the ru/kk slot of an object that also has en. */
function inTranslatedSlot(node) {
  for (let current = node; current.parent; current = current.parent) {
    const parent = current.parent;
    if (!ts.isPropertyAssignment(parent) || parent.initializer !== current) continue;

    const name = propertyName(parent);
    if (name === "keywords") return true;

    const object = parent.parent;
    if ((name === "ru" || name === "kk") && ts.isObjectLiteralExpression(object)) {
      if (object.properties.some((property) => propertyName(property) === "en")) return true;
    }
  }
  return false;
}

/**
 * Every Cyrillic string, template or JSX text outside a translated slot.
 * `node` and `tree` are returned too, so a rewriting script can reuse the
 * exact same definition of "raw" instead of keeping its own.
 */
export function rawCyrillic(file, source = readFileSync(file, "utf8")) {
  const normalisedFile = file.replace(/\\/g, "/");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];

  const report = (node, text, kind) => {
    if (!CYRILLIC.test(text)) return;
    if (inTranslatedSlot(node)) return;
    const clean = text.replace(/\s+/g, " ").trim();
    if (ALLOWED.some((entry) => entry.file === normalisedFile && entry.text === clean)) return;
    const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
    found.push({ file: normalisedFile, line: line + 1, kind, text: clean, node, tree });
  };

  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      report(node, node.text, "string");
    } else if (ts.isTemplateExpression(node)) {
      const text = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join("…");
      report(node, text, "template");
    } else if (ts.isJsxText(node)) {
      report(node, node.text, "jsx");
    }
    ts.forEachChild(node, visit);
  };

  visit(tree);
  return found;
}

/**
 * Dates pinned to Russian: `{ locale: ru }` handed to date-fns, or
 * `.toLocaleDateString("ru-RU")`. They print "5 сентября" in every language,
 * and there is no Cyrillic in the source for rawCyrillic() to find. Inside the
 * `ru` slot of a phrase the Russian locale is, of course, correct.
 */
export function pinnedRussianDates(file, source = readFileSync(file, "utf8")) {
  const normalisedFile = file.replace(/\\/g, "/");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];

  const report = (node) => {
    if (inTranslatedSlot(node)) return;
    const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
    found.push({ file: normalisedFile, line: line + 1, node, tree });
  };

  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      propertyName(node) === "locale" &&
      ts.isIdentifier(node.initializer) &&
      node.initializer.text === "ru"
    ) {
      report(node.initializer);
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      /^toLocale\w*String$/.test(node.expression.name.text) &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      /^ru(-RU)?$/.test(node.arguments[0].text)
    ) {
      report(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };

  visit(tree);
  return found;
}

const KAZAKH_ONLY = /[әіңғүұқөһӘІҢҒҮҰҚӨҺ]/;
const RUSSIAN_WORD = /[А-Яа-яЁё]{3,}/;

// Phrases whose Kazakh is legitimately the same as the Russian: loanwords
// Kazakh uses as they are, and labels that are only a word plus a number.
export const KAZAKH_SAME_AS_RUSSIAN = new Set([
  "Email", "Kaspi", "PIN", "мин", "файл", "Файл", "Масштаб", "Слот", "слот", "курс", "Автор",
  "Медиа ${i + 1}", "Код ${putRes.status}", "код ${xhr.status}",
]);

/**
 * Phrases that show Russian to a Kazakh reader: an object with ru, kk and en
 * whose `kk` is exactly its `ru`, holds Russian words and no Kazakh-only
 * letter. Compared as source text, so a template counts the same as a string.
 */
export function kazakhGaps(file, source = readFileSync(file, "utf8")) {
  const normalisedFile = file.replace(/\\/g, "/");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];

  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const slot = (name) => node.properties.find((property) => ts.isPropertyAssignment(property) && propertyName(property) === name);
      const ru = slot("ru");
      const kk = slot("kk");
      const en = slot("en");
      if (ru && kk && en) {
        const ruText = ru.initializer.getText(tree);
        const kkText = kk.initializer.getText(tree);
        const plain = ruText.replace(/^[`"']|[`"']$/g, "");
        if (
          ruText === kkText &&
          RUSSIAN_WORD.test(ruText) &&
          !KAZAKH_ONLY.test(kkText) &&
          !KAZAKH_SAME_AS_RUSSIAN.has(plain)
        ) {
          const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
          found.push({ file: normalisedFile, line: line + 1, ru: plain, node: kk.initializer, tree });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(tree);
  return found;
}

function main() {
  const args = process.argv.slice(2);
  const only = args.includes("--file") ? args[args.indexOf("--file") + 1] : null;
  const files = sourceFiles("src").filter((file) => !isExcluded(file) && (!only || file.includes(only)));

  if (args.includes("--kk")) {
    const gaps = files.flatMap((file) => kazakhGaps(file).map(({ node, tree, ...gap }) => gap));
    if (args.includes("--json")) return console.log(JSON.stringify(gaps, null, 1));
    const perFile = new Map();
    for (const gap of gaps) perFile.set(gap.file, (perFile.get(gap.file) ?? 0) + 1);
    for (const [file, count] of [...perFile].sort((a, b) => b[1] - a[1])) console.log(String(count).padStart(4) + "  " + file);
    if (only) for (const gap of gaps) console.log(`${gap.file}:${gap.line}  ${gap.ru}`);
    console.log(`\n${gaps.length} phrases show Russian to Kazakh readers, across ${perFile.size} files`);
    process.exitCode = gaps.length ? 1 : 0;
    return;
  }

  const rows = [];
  const all = [];
  for (const file of files) {
    const found = rawCyrillic(file).map(({ node, tree, ...hit }) => hit);
    if (found.length) rows.push({ file, count: found.length });
    all.push(...found);
  }

  if (args.includes("--json")) {
    console.log(JSON.stringify(all, null, 1));
    return;
  }

  if (only) {
    for (const hit of all) console.log(`${hit.file}:${hit.line}  [${hit.kind}]  ${hit.text}`);
  }

  rows.sort((a, b) => b.count - a.count);
  const show = args.includes("--all") || only ? rows : rows.slice(0, 25);
  for (const row of show) console.log(String(row.count).padStart(4) + "  " + row.file);
  if (rows.length > show.length) console.log(`     … and ${rows.length - show.length} more files`);

  console.log(`\n${all.length} raw Cyrillic strings across ${rows.length} files`);
  process.exitCode = all.length ? 1 : 0;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/i18n-raw.mjs")) main();
