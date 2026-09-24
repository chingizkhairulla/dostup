// One definition of "how an l({ ru, kk, en }) phrase looks in source", shared
// by the extract/apply/report scripts.
//
// The string bodies are spelled per quote character with the quote itself
// excluded (`[^"\\]`, `[^'\\]`, ...). An earlier version used a lazy `.*?`
// that allowed the quote through, which let a multi-line phrase pair its `l({`
// with a `})` much further down the file — a mis-pairing that would have
// rewritten the wrong span. Hence the explicit alternation.

const DOUBLE = String.raw`"((?:[^"\\]|\\.)*)"`;
const SINGLE = String.raw`'((?:[^'\\]|\\.)*)'`;
const BACKTICK = String.raw`\x60((?:[^\x60\\]|\\.)*)\x60`;

const ANY_STRING = `(?:${DOUBLE}|${SINGLE}|${BACKTICK})`;

// Nine capture groups: three per slot, one of which is non-empty.
const PATTERN =
  String.raw`l\(\{\s*ru:\s*` +
  ANY_STRING +
  String.raw`\s*,\s*kk:\s*` +
  ANY_STRING +
  String.raw`\s*,\s*en:\s*` +
  ANY_STRING +
  String.raw`\s*,?\s*\}\)`;

export function phraseRegex() {
  return new RegExp(PATTERN, "gs");
}

/** Picks the group that actually matched, and reports which quote it used. */
function slot(groups, offset) {
  for (let i = 0; i < 3; i += 1) {
    const value = groups[offset + i];
    if (value !== undefined) return { text: value, quote: ['"', "'", "`"][i] };
  }
  return { text: "", quote: '"' };
}

/** Turns one regex match into { ru, kk, en } with their quote characters. */
export function readPhrase(match) {
  return {
    whole: match[0],
    ru: slot(match, 1),
    kk: slot(match, 4),
    en: slot(match, 7),
  };
}

export const CYRILLIC = /[Ѐ-ӿ]/;
