import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";

type Variant = NonNullable<Parameters<typeof buttonVariants>[0]>["variant"];

const SECONDARY: Variant[] = ["outline", "secondary", "ghost", "toggle"];
const ALL: Variant[] = [
  "default",
  "destructive",
  "outline",
  "secondary",
  "ghost",
  "link",
  "cta",
  "success",
  "toggle",
];

// Customer rule: when there are several buttons and one is orange by default,
// the others light up PALE orange on hover — never a solid orange flood.
describe("secondary buttons hover pale orange", () => {
  it.each(SECONDARY)("%s lights up pale orange", (variant) => {
    expect(buttonVariants({ variant })).toMatch(/hover:bg-primary\/10\b/);
  });

  // `accent` is solid orange with white text in this theme, so any hover:*accent*
  // here would flood the button with orange.
  it.each(SECONDARY)("%s does not flood solid orange through the accent colour", (variant) => {
    const classes = buttonVariants({ variant });
    expect(classes).not.toMatch(/hover:bg-accent/);
    expect(classes).not.toMatch(/hover:text-accent-foreground/);
  });

  // White text on a pale-orange background would be unreadable, so the hover
  // state must not force white text onto these buttons.
  it.each(SECONDARY)("%s does not force white text on the pale hover", (variant) => {
    expect(buttonVariants({ variant })).not.toMatch(/hover:text-(white|primary-foreground)/);
  });
});

// Customer rule: if a button is (or turns) solid orange, its text is white.
describe("solid orange buttons carry white text", () => {
  it.each(ALL)("%s never has solid orange with a non-white label", (variant) => {
    const classes = buttonVariants({ variant });
    const solidOrange = /(^|\s)(hover:)?bg-primary(?!\/)(\s|$)|gradient-primary/.test(classes);
    if (solidOrange) {
      expect(classes).toMatch(/text-primary-foreground/);
    }
  });

  it("the default and cta buttons are the solid orange ones", () => {
    expect(buttonVariants({ variant: "default" })).toMatch(/bg-primary /);
    expect(buttonVariants({ variant: "cta" })).toMatch(/gradient-primary/);
  });
});

describe("other button kinds keep their own meaning", () => {
  it("destructive stays red and success stays green on hover", () => {
    expect(buttonVariants({ variant: "destructive" })).toMatch(/hover:bg-destructive/);
    expect(buttonVariants({ variant: "success" })).toMatch(/hover:bg-success/);
  });
});
