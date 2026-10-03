import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EDITOR_DIALOG_CLASS } from "@/components/creator/CreatorProductsTab";

// These guard the parts of the change that cannot be executed here: SQL and
// edge functions run against Supabase, not in this test environment. They
// follow the pattern already used by translations.test.ts.
function readRepoFile(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

const MIGRATION = "supabase/migrations/20260917120000_private_products_and_seller_metrics.sql";

describe("new products are private by default", () => {
  // AC 16-17: a new product must not appear on the marketplace on its own.
  // Creation now goes through one shared builder (also used by the autosave), so
  // that is where the private default has to hold.
  it("the shared create payload sends is_active false", () => {
    const payload = readRepoFile("src/lib/productPayload.ts");
    const start = payload.indexOf("export function buildCreatePayload");
    expect(start).toBeGreaterThan(-1);
    const builder = payload.slice(start, start + 500);

    expect(builder).toMatch(/is_active:\s*false/);
    expect(builder).not.toMatch(/is_active:\s*true/);
  });

  it("the editor creates products only through that builder, never with its own payload", () => {
    const tab = readRepoFile("src/components/creator/CreatorProductsTab.tsx");
    const persist = readRepoFile("src/lib/persistProduct.ts");

    expect(persist).toMatch(/deps\.createProduct\(buildCreatePayload\(/);
    expect(tab).not.toMatch(/createProduct\.mutateAsync\(\{/);
  });

  it("publishing is what sets is_active back to true", () => {
    const tab = readRepoFile("src/components/creator/CreatorProductsTab.tsx");
    const start = tab.indexOf("const handleVisibilityChange");
    expect(start).toBeGreaterThan(-1);
    const handler = tab.slice(start, start + 1200);

    expect(handler).toMatch(/is_active:\s*true,\s*is_paused:\s*false/);
    expect(handler).toMatch(/is_active:\s*false/);
  });

  it("the edge function defaults a missing is_active to false", () => {
    const fn = readRepoFile("supabase/functions/manage-products/index.ts");
    expect(fn).toMatch(/is_active:\s*product\.is_active\s*\?\?\s*false/);
  });

  it("the column default is flipped to false", () => {
    const migration = readRepoFile(MIGRATION);
    expect(migration).toMatch(
      /ALTER TABLE public\.products ALTER COLUMN is_active SET DEFAULT false/,
    );
  });
});

describe("seller storefront metrics", () => {
  it("returns the joined date and the three metrics", () => {
    const migration = readRepoFile(MIGRATION);
    for (const column of ["created_at", "avg_rating", "review_count", "sales_count"]) {
      expect(migration).toMatch(new RegExp(`${column}\\s+(timestamptz|numeric|int)`));
    }
  });

  // AC 25: sales must be real confirmed purchases, matching the definition
  // already used by _shared/purchase.ts.
  it("counts only completed purchases as sales", () => {
    const migration = readRepoFile(MIGRATION);
    expect(migration).toMatch(/pu\.status\s*=\s*'completed'/);
  });

  // AC 26: an average over individual reviews, not an average of averages.
  it("averages individual review rows", () => {
    const migration = readRepoFile(MIGRATION);
    expect(migration).toMatch(/avg\(rv\.rating\)/);
    expect(migration).not.toMatch(/avg\(\s*avg/);
  });

  // AC 29: the listed products still come from the public view, so private and
  // paused products stay hidden even though metrics span every product.
  it("lists products from the public catalog view only", () => {
    const migration = readRepoFile(MIGRATION);
    expect(migration).toMatch(/FROM public\.public_products pp/);
  });

  // AC 38: one query, not a fan-out per product.
  it("aggregates with lateral joins rather than per-product queries", () => {
    const migration = readRepoFile(MIGRATION);
    expect(migration.match(/LEFT JOIN LATERAL/g) ?? []).toHaveLength(2);
  });

  // AC 30: no private seller data may leak through the public storefront.
  it("exposes no private profile columns", () => {
    const migration = readRepoFile(MIGRATION);
    const fnBody = migration.slice(migration.indexOf("get_seller_storefront"));
    for (const forbidden of ["pr.email", "pr.phone", "auth_user_id"]) {
      expect(fnBody).not.toContain(forbidden);
    }
  });
});

describe("seller description", () => {
  it("manage-profile can save a bio and rejects an oversized one", () => {
    const fn = readRepoFile("supabase/functions/manage-profile/index.ts");
    expect(fn).toMatch(/action === 'set_bio'/);
    expect(fn).toMatch(/raw\.length > 500/);
  });

  it("only sellers may set a public description", () => {
    const fn = readRepoFile("supabase/functions/manage-profile/index.ts");
    const setBio = fn.slice(fn.indexOf("action === 'set_bio'"));
    expect(setBio).toMatch(/row\.type !== 'creator' && row\.type !== 'school'/);
  });

  it("the profile row carries bio so settings can load the current value", () => {
    const shared = readRepoFile("supabase/functions/_shared/profiles.ts");
    expect(shared).toMatch(/PROFILE_COLUMNS[\s\S]{0,200}bio/);
  });

  it("the database caps the description length too", () => {
    const migration = readRepoFile(MIGRATION);
    expect(migration).toMatch(/char_length\(bio\) <= 500/);
  });
});

// Regression: the editor window used to size itself with only max-h-[90vh]
// below the `lg` breakpoint (1024px), which is a cap, not a definite height.
// A flex container without a definite main-axis size gives flex-1 children
// nothing to grow into, so the live-preview frame collapsed into a sliver that
// needed scrolling — reported as "only a rectangular strip is visible" on a
// real phone. The two-pane window must keep a definite height at every size.
describe("editor window sizing", () => {
  const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean);
  const hasDefiniteHeight = (classes: string) =>
    tokens(classes).some((token) => /^h-\[\d/.test(token));

  it("gives the two-pane window a definite height at every size, not just a cap", () => {
    expect(hasDefiniteHeight(EDITOR_DIALOG_CLASS)).toBe(true);
    // One height for every breakpoint: no `lg:`/`sm:` override may shrink it.
    expect(tokens(EDITOR_DIALOG_CLASS).some((t) => /^\w+:h-/.test(t))).toBe(false);
  });

  it("lets the two panes reach the window edges", () => {
    expect(tokens(EDITOR_DIALOG_CLASS)).toContain("p-0");
  });

  // Round 3: the window covers the whole screen, so there is no outside to
  // click by accident, and the dialog's own centring transform is cancelled.
  it("covers the whole screen at every size", () => {
    const t = tokens(EDITOR_DIALOG_CLASS);
    for (const token of ["left-0", "top-0", "h-[100dvh]", "w-screen", "max-w-none", "translate-x-0", "translate-y-0", "rounded-none", "sm:rounded-none"]) {
      expect(t).toContain(token);
    }
    expect(t.some((token) => /^\w+:max-w-/.test(token))).toBe(false);
  });
});
