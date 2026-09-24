// Helpers for the "white text on orange" rule (the customer's: black on orange
// looks bad, so every orange surface carries white text).
//
// Tailwind applies a class only in the state its prefix names, so the rule has
// to be checked per prefix: `focus:bg-accent` is only wrong if the *focus*
// text colour is dark. Comparing whole class strings instead would flag
// perfectly correct code such as
//   "hover:bg-accent text-muted-foreground hover:text-white"
// where the dark colour belongs to the resting state and never meets orange.

/** Class names whose background is the brand orange at full opacity. */
const SOLID_ORANGE_BACKGROUNDS = [
  "bg-primary",
  "bg-accent",
  "bg-[#FF6B00]",
  "bg-[#E86200]",
  "bg-orange-500",
  "bg-orange-600",
  "bg-orange-700",
  "gradient-primary",
  "bg-gradient-primary",
];

/**
 * Text colours that are dark enough to be the thing the customer objected to.
 * `text-muted-foreground` counts: it is grey, and grey on orange is the same
 * complaint as black on orange.
 */
const DARK_TEXT = [
  "text-foreground",
  "text-black",
  "text-muted-foreground",
  "text-secondary-foreground",
  "text-card-foreground",
  "text-popover-foreground",
];

const DARK_TEXT_PATTERNS = [
  /^text-\[#[0-9a-fA-F]{3,8}\]$/, // any arbitrary hex colour — checked for darkness below
  /^text-(gray|slate|zinc|neutral|stone)-(600|700|800|900|950)$/,
];

/** Relative luminance per WCAG 2.x. */
function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function parseHex(hex: string): [number, number, number] | null {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (full.length !== 6) return null;
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return null;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function isDarkArbitraryColour(className: string): boolean {
  const match = className.match(/^text-\[(#[0-9a-fA-F]{3,8})\]$/);
  if (!match) return false;
  const rgb = parseHex(match[1]);
  if (!rgb) return false;
  // Anything below mid-grey is "dark" for this purpose; white and near-white
  // arbitrary colours (some components spell white as #fff) are fine.
  return relativeLuminance(...rgb) < 0.5;
}

/**
 * Splits `data-[state=open]:bg-accent` into its prefix and base class.
 * The split is the last `:` at bracket depth zero, so arbitrary variants such
 * as `[&:has([aria-selected])]:bg-accent` survive intact.
 */
export function splitVariant(className: string): { prefix: string; base: string } {
  let depth = 0;
  let splitAt = -1;
  for (let i = 0; i < className.length; i += 1) {
    const char = className[i];
    if (char === "[" || char === "(") depth += 1;
    else if (char === "]" || char === ")") depth -= 1;
    else if (char === ":" && depth === 0) splitAt = i;
  }
  if (splitAt === -1) return { prefix: "", base: className };
  return { prefix: className.slice(0, splitAt + 1), base: className.slice(splitAt + 1) };
}

function isSolidOrangeBackground(base: string): boolean {
  // `bg-accent/10` and friends are tints, not the solid brand surface.
  if (base.includes("/")) return false;
  return SOLID_ORANGE_BACKGROUNDS.includes(base);
}

function isDarkText(base: string): boolean {
  if (base.includes("/")) return false;
  if (DARK_TEXT.includes(base)) return true;
  if (isDarkArbitraryColour(base)) return true;
  return DARK_TEXT_PATTERNS.some((pattern) => pattern.test(base) && !base.startsWith("text-[#"));
}

function isWhiteText(base: string): boolean {
  if (base === "text-white" || base === "text-primary-foreground" || base === "text-accent-foreground") {
    return true;
  }
  const match = base.match(/^text-\[(#[0-9a-fA-F]{3,8})\]$/);
  if (!match) return false;
  const rgb = parseHex(match[1]);
  return rgb ? relativeLuminance(...rgb) >= 0.5 : false;
}

export interface OrangeFinding {
  /** The variant the clash happens in; "" means the resting state. */
  prefix: string;
  background: string;
  text: string;
}

/**
 * Finds, inside one class string, every state where a solid orange background
 * meets dark text.
 */
export function findDarkTextOnOrange(classString: string): OrangeFinding[] {
  const tokens = classString.split(/\s+/).filter(Boolean);
  const backgrounds = new Map<string, string>();
  const texts = new Map<string, string>();

  for (const token of tokens) {
    const { prefix, base } = splitVariant(token);
    if (isSolidOrangeBackground(base)) backgrounds.set(prefix, token);
    if (isDarkText(base)) texts.set(prefix, token);
  }

  const findings: OrangeFinding[] = [];
  for (const [prefix, background] of backgrounds) {
    const text = texts.get(prefix);
    if (text) findings.push({ prefix, background, text });
  }
  return findings;
}

/**
 * Finds solid orange backgrounds that set no text colour for the same state.
 * Those inherit whatever colour the surrounding text has, which is dark
 * everywhere in this app — `dropdown-menu`'s SubTrigger was exactly this bug.
 * Only meaningful for components that render their own label, so callers pass
 * the class strings they know carry text.
 */
export function findOrangeWithoutTextColour(classString: string): OrangeFinding[] {
  const tokens = classString.split(/\s+/).filter(Boolean);
  const backgrounds = new Map<string, string>();
  const coloured = new Set<string>();

  for (const token of tokens) {
    const { prefix, base } = splitVariant(token);
    if (isSolidOrangeBackground(base)) backgrounds.set(prefix, token);
    if (base.startsWith("text-") && (isWhiteText(base) || isDarkText(base))) coloured.add(prefix);
  }

  const findings: OrangeFinding[] = [];
  for (const [prefix, background] of backgrounds) {
    if (!coloured.has(prefix)) findings.push({ prefix, background, text: "(none)" });
  }
  return findings;
}

/**
 * Pulls Tailwind-looking string literals out of a source file: both "..." and
 * `...` forms, since several components build classes in template literals.
 */
export function extractClassStrings(source: string): string[] {
  const literals = [
    ...source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g),
    ...source.matchAll(/`((?:[^`\\]|\\.)*)`/gs),
  ].map((match) => match[1]);

  return literals.filter((literal) => /\b(?:bg|text|gradient)-/.test(literal));
}
