import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// On a phone the section buttons collapse to icons and the trash counter
// becomes a badge on the icon. It sat at -top-1 -right-1, outside the button,
// inside a row with overflow-hidden — so the row cut it off. It also used
// Tailwind's orange-500 rather than the brand token the orange guard checks.

const source = readFileSync(resolve(process.cwd(), "src/components/materials/MaterialsSectionsNav.tsx"), "utf8");
const badges = [...source.matchAll(/<span className="([^"]*rounded-full[^"]*)">\s*\{trashCount\}/g)].map((m) => m[1]);

describe("the trash counter", () => {
  it("exists in both the full and the icon-only button", () => {
    expect(badges).toHaveLength(2);
  });

  it("stays inside its button, so the row cannot cut it off", () => {
    for (const classes of badges) expect(classes).not.toMatch(/(^|\s)-(top|right|left|bottom)-/);
  });

  it("uses the brand orange with its white text", () => {
    for (const classes of badges) {
      expect(classes).toMatch(/\bbg-primary\b/);
      expect(classes).toMatch(/\btext-primary-foreground\b/);
      expect(classes).not.toMatch(/orange-\d00/);
    }
  });
});
