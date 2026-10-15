// Wraps Russian text written straight into the source in l({ ru, kk, en }).
//
// i18n-raw.mjs finds the strings; this rewrites them, given English for each.
// It reuses i18n-raw's own definition of "raw", so the two cannot disagree
// about what is left.
//
//   node scripts/i18n-wrap.mjs --keys                 what still needs English (JSON skeleton)
//   node scripts/i18n-wrap.mjs <dictionary.json>          dry run: what would change
//   node scripts/i18n-wrap.mjs <dictionary.json> --write  rewrite the files
//   … --file <substring>                              limit to matching files
//
// The dictionary maps the Russian text to English:
//   { "Сохранить": "Save", "Удалено ${count} файлов": "Deleted ${count} files" }
// or, where Kazakh is known too, { "Сохранить": { "en": "Save", "kk": "Сақтау" } }.
// For a template the key is its source between the backticks, and the English
// must use the same ${…} expressions.
//
// Kazakh: taken from the dictionary, else from any phrase or t() entry already
// in the repository with exactly this Russian text, else the Russian itself —
// which is what a Kazakh reader was shown before, so nothing gets worse.
//
// What it will not touch, and lists instead:
//   - a string used as data: compared with ===, a `case`, .includes() and the like
//   - a template that contains another Russian string (word order needs a person)
//   - JSX text with an HTML entity

import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { isExcluded, rawCyrillic, sourceFiles } from "./i18n-raw.mjs";
import { phraseRegex, readPhrase } from "./i18n-phrases.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const dictionaryPath = args.find((arg) => arg.endsWith(".json"));
const only = option("--file");

const collapse = (text) => text.replace(/\s+/g, " ").trim();

/** Russian → { kk, en } for every phrase the repository already translates. */
function knownTranslations() {
  const known = new Map();
  const remember = (ru, kk, en) => {
    if (!ru || known.has(ru)) return;
    if (/[Ѐ-ӿ]/.test(en)) return; // an `en` still holding Russian teaches nothing
    known.set(ru, { kk, en });
  };

  for (const file of sourceFiles("src")) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("l({")) continue;
    for (const match of source.matchAll(phraseRegex())) {
      const phrase = readPhrase(match);
      if (phrase.ru.quote === "`" && phrase.ru.text.includes("${")) continue;
      remember(phrase.ru.text, phrase.kk.text, phrase.en.text);
    }
  }

  // The t() dictionaries: three sibling objects ru / kk / en of plain strings.
  const path = "src/lib/translations.ts";
  const tree = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const strings = (object) => {
    const out = new Map();
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property) || !ts.isStringLiteralLike(property.initializer)) continue;
      out.set(property.name.getText(tree).replace(/^["']|["']$/g, ""), property.initializer.text);
    }
    return out;
  };
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const slot = (name) =>
        node.properties.find(
          (property) =>
            ts.isPropertyAssignment(property) &&
            property.name.getText(tree) === name &&
            ts.isObjectLiteralExpression(property.initializer),
        );
      const [ru, kk, en] = ["ru", "kk", "en"].map(slot);
      if (ru && kk && en) {
        const [ruMap, kkMap, enMap] = [ru, kk, en].map((property) => strings(property.initializer));
        for (const [key, text] of ruMap) {
          if (text.includes("{")) continue; // {param} placeholders are filled by t(), not by l()
          if (kkMap.has(key) && enMap.has(key)) remember(text, kkMap.get(key), enMap.get(key));
        }
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return known;
}

const DATA_METHODS = new Set(["includes", "startsWith", "endsWith", "indexOf", "match", "test", "replace", "split"]);

/** Why this string is data rather than text, or null when it is text. */
function usedAsData(node) {
  const parent = node.parent;
  if (ts.isBinaryExpression(parent)) {
    const kind = parent.operatorToken.kind;
    const equality = [
      ts.SyntaxKind.EqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ];
    if (equality.includes(kind)) return "compared with ===";
  }
  if (ts.isCaseClause(parent)) return "a case label";
  if (ts.isPropertyAssignment(parent) && parent.name === node) return "a property name";
  if (ts.isLiteralTypeNode(parent)) return "a type";
  if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)) {
    if (DATA_METHODS.has(parent.expression.name.text)) return `an argument of .${parent.expression.name.text}()`;
  }
  return null;
}

function isConsoleArgument(node) {
  const parent = node.parent;
  return (
    ts.isCallExpression(parent) &&
    ts.isPropertyAccessExpression(parent.expression) &&
    ts.isIdentifier(parent.expression.expression) &&
    parent.expression.expression.text === "console"
  );
}

const quote = (text) => JSON.stringify(text);
const tick = (body) => "`" + body + "`";

function phraseSource(ru, kk, en, template) {
  const wrap = template ? tick : quote;
  return `l({ ru: ${wrap(ru)}, kk: ${wrap(kk)}, en: ${wrap(en)} })`;
}

const known = knownTranslations();
const dictionary = dictionaryPath ? JSON.parse(readFileSync(dictionaryPath, "utf8")) : {};

function lookUp(key) {
  const entry = dictionary[key];
  const fromRepo = known.get(key);
  if (entry === undefined && !fromRepo) return null;
  const en = typeof entry === "string" ? entry : entry?.en ?? fromRepo?.en;
  const kk = (typeof entry === "object" && entry?.kk) || fromRepo?.kk || key;
  return en ? { en, kk } : null;
}

const missing = new Map();
const manual = [];
let wrapped = 0;
let filesChanged = 0;

const files = sourceFiles("src").filter((file) => !isExcluded(file) && (!only || file.includes(only)));

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const hits = rawCyrillic(file, source);
  if (!hits.length) continue;

  const range = (hit) => [hit.node.getStart(hit.tree), hit.node.getEnd()];
  const contains = (outer, inner) => {
    const [a, b] = range(outer);
    const [c, d] = range(inner);
    return outer !== inner && a <= c && d <= b;
  };

  const edits = [];
  for (const hit of hits) {
    const { node, tree } = hit;
    const where = `${file}:${hit.line}`;

    if (hits.some((other) => contains(other, hit) || contains(hit, other))) {
      manual.push(`${where}  nested Russian — by hand: ${hit.text}`);
      continue;
    }
    const data = hit.kind === "jsx" ? null : usedAsData(node);
    if (data) {
      manual.push(`${where}  ${data}: ${hit.text}`);
      continue;
    }

    if (hit.kind === "jsx") {
      const raw = node.getFullText(tree);
      if (/&[a-z#0-9]+;/i.test(raw)) {
        manual.push(`${where}  JSX text with an entity: ${hit.text}`);
        continue;
      }
      const key = collapse(raw);
      const found = lookUp(key);
      if (!found) {
        missing.set(key, (missing.get(key) ?? 0) + 1);
        continue;
      }
      const lead = raw.match(/^\s*/)[0].length;
      const trail = raw.match(/\s*$/)[0].length;
      const start = node.getFullStart();
      edits.push({
        start: start + lead,
        end: start + raw.length - trail,
        text: `{${phraseSource(key, found.kk, found.en, false)}}`,
      });
      continue;
    }

    const template = hit.kind === "template";
    const key = template ? node.getText(tree).slice(1, -1) : node.text;
    const found = lookUp(key);
    if (!found) {
      missing.set(key, (missing.get(key) ?? 0) + 1);
      continue;
    }

    let text = phraseSource(key, found.kk, found.en, template);
    if (isConsoleArgument(node)) text = template ? tick(found.en) : quote(found.en); // logs are for developers
    else if (ts.isJsxAttribute(node.parent)) text = `{${text}}`;
    edits.push({ start: node.getStart(tree), end: node.getEnd(), text });
  }

  if (!edits.length) continue;
  wrapped += edits.length;
  filesChanged += 1;

  if (flag("--write")) {
    let out = source;
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    }
    writeFileSync(file, out);
  }
}

if (flag("--keys")) {
  const skeleton = {};
  for (const key of [...missing.keys()].sort((a, b) => a.localeCompare(b, "ru"))) skeleton[key] = "";
  console.log(JSON.stringify(skeleton, null, 1));
} else {
  for (const line of manual) console.log("by hand  " + line);
  for (const [key, count] of missing) console.log(`no English yet (${count}×)  ${key}`);
  console.log(
    `\n${flag("--write") ? "wrapped" : "would wrap"} ${wrapped} strings in ${filesChanged} files; ` +
      `${missing.size} distinct texts lack English; ${manual.length} left for a person`,
  );
}
