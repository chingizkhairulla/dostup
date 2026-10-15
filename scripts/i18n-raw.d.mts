// Types for i18n-raw.mjs, so the test that imports it stays typed.

export interface RawHit {
  file: string;
  line: number;
  kind: "string" | "template" | "jsx";
  text: string;
}

export const CYRILLIC: RegExp;
export const EXCLUDED: string[];
export const UNREACHABLE: string[];
export const ALLOWED: { file: string; text: string }[];
export function isExcluded(file: string): boolean;
export function sourceFiles(dir: string): string[];
export function rawCyrillic(file: string, source?: string): RawHit[];
export function pinnedRussianDates(file: string, source?: string): { file: string; line: number }[];
export const KAZAKH_SAME_AS_RUSSIAN: Set<string>;
export function kazakhGaps(file: string, source?: string): { file: string; line: number; ru: string }[];
