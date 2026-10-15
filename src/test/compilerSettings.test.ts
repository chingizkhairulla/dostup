import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Three screens once crashed in English because a table keyed { ru, kk } was
// read with `table[language]`. Without `noImplicitAny` that compiles: the
// lookup is silently `any`, and `undefined` at run time. With it, the same
// line is a type error (TS7053). This keeps the flag from being turned off.

describe("compiler settings for the app", () => {
  it("reject an implicit any, so a language table without a language cannot compile", () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "tsconfig.app.json"), "utf8"));
    expect(config.compilerOptions.noImplicitAny).toBe(true);
  });
});
