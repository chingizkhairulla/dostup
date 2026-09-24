import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractClassStrings,
  findDarkTextOnOrange,
  findOrangeWithoutTextColour,
  splitVariant,
} from "@/lib/orangeSurfaces";

// The customer's rule: wherever the background is the brand orange, the text on
// it is white — black reads badly on orange. These guard it at the source level;
// the runtime scanner (scripts/audit-orange.mjs) covers what static reading
// cannot see, namely inherited colours.

function readRepoFile(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function sourceFiles(dir: string, extensions = [".tsx", ".ts"]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(resolve(process.cwd(), dir))) {
    const full = join(dir, entry);
    if (statSync(resolve(process.cwd(), full)).isDirectory()) {
      out.push(...sourceFiles(full, extensions));
    } else if (extensions.some((ext) => entry.endsWith(ext)) && !entry.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

describe("the parser behind the rule", () => {
  it("splits a variant off at the last colon outside brackets", () => {
    expect(splitVariant("bg-accent")).toEqual({ prefix: "", base: "bg-accent" });
    expect(splitVariant("focus:bg-accent")).toEqual({ prefix: "focus:", base: "bg-accent" });
    expect(splitVariant("data-[state=open]:bg-accent")).toEqual({
      prefix: "data-[state=open]:",
      base: "bg-accent",
    });
    expect(splitVariant("[&:has([aria-selected])]:bg-accent")).toEqual({
      prefix: "[&:has([aria-selected])]:",
      base: "bg-accent",
    });
  });

  it("only complains when the dark text shares the orange background's state", () => {
    // Real shape from CreatorMaterialsTab: grey at rest, orange + white on hover.
    expect(
      findDarkTextOnOrange("hover:bg-accent text-muted-foreground hover:text-white"),
    ).toEqual([]);
    // Real shape from HeaderControls: solid orange on mobile, tinted on desktop.
    expect(
      findDarkTextOnOrange("bg-accent text-white md:bg-accent/10 md:text-foreground"),
    ).toEqual([]);
    // The thing we are actually guarding against.
    expect(findDarkTextOnOrange("bg-primary text-foreground")).toHaveLength(1);
    expect(
      findDarkTextOnOrange("data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"),
    ).toHaveLength(1);
  });

  it("treats tints as not-a-solid-surface", () => {
    expect(findDarkTextOnOrange("bg-primary/10 text-foreground")).toEqual([]);
    expect(findDarkTextOnOrange("bg-[#FF6B00]/10 text-[#1F2328]")).toEqual([]);
  });

  it("judges arbitrary hex text colours by their luminance", () => {
    expect(findDarkTextOnOrange("bg-[#FF6B00] text-[#1F2328]")).toHaveLength(1);
    expect(findDarkTextOnOrange("bg-[#FF6B00] text-[#ffffff]")).toEqual([]);
  });

  it("spots an orange surface that sets no text colour at all for that state", () => {
    expect(findOrangeWithoutTextColour("focus:bg-accent")).toHaveLength(1);
    expect(findOrangeWithoutTextColour("focus:bg-accent focus:text-accent-foreground")).toEqual([]);
  });
});

describe("the orange token itself", () => {
  it("defines white as the colour that sits on it, in every theme block", () => {
    const css = readRepoFile("src/index.css");
    const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf(".dark {"));
    const darkBlock = css.slice(css.indexOf(".dark {"));

    expect(rootBlock).toMatch(/--primary-foreground:\s*0 0% 100%/);
    expect(rootBlock).toMatch(/--accent-foreground:\s*0 0% 100%/);
    expect(darkBlock).toMatch(/--primary-foreground:\s*0 0% 100%/);
    expect(darkBlock).toMatch(/--accent-foreground:\s*0 0% 100%/);
  });
});

describe("components that paint an orange surface", () => {
  it("keeps white text on the button variants that are orange", () => {
    const button = readRepoFile("src/components/ui/button.tsx");
    const defaultVariant = button.match(/default:\s*"([^"]*)"/)?.[1] ?? "";
    const ctaVariant = button.match(/cta:\s*"([^"]*)"/)?.[1] ?? "";

    expect(defaultVariant).toContain("bg-primary");
    expect(defaultVariant).toContain("text-primary-foreground");
    expect(ctaVariant).toContain("gradient-primary");
    expect(ctaVariant).toContain("text-primary-foreground");
  });

  it("keeps white text on the orange badge", () => {
    const badge = readRepoFile("src/components/ui/badge.tsx");
    const defaultVariant = badge.match(/default:\s*"([^"]*)"/)?.[1] ?? "";

    expect(defaultVariant).toContain("bg-primary");
    expect(defaultVariant).toContain("text-primary-foreground");
  });
});

describe("no dark text on an orange background, anywhere in src", () => {
  it("finds no class string that puts a dark colour on the brand orange", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles("src")) {
      for (const classString of extractClassStrings(readRepoFile(file))) {
        for (const finding of findDarkTextOnOrange(classString)) {
          offenders.push(`${file}: ${finding.background} + ${finding.text}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("interactive ui primitives state their text colour on orange", () => {
  // These render their own label directly on the surface they colour, so an
  // orange background with no text colour inherits the page's dark text.
  const LABEL_BEARING_UI = [
    "src/components/ui/dropdown-menu.tsx",
    "src/components/ui/context-menu.tsx",
    "src/components/ui/menubar.tsx",
    "src/components/ui/select.tsx",
    "src/components/ui/command.tsx",
    "src/components/ui/navigation-menu.tsx",
    "src/components/ui/toggle.tsx",
    "src/components/ui/dialog.tsx",
  ];

  it.each(LABEL_BEARING_UI)("%s always pairs an orange state with a text colour", (file) => {
    const uncoloured: string[] = [];

    for (const classString of extractClassStrings(readRepoFile(file))) {
      for (const finding of findOrangeWithoutTextColour(classString)) {
        uncoloured.push(`${finding.prefix}${finding.background}`);
      }
    }

    expect(uncoloured).toEqual([]);
  });
});
