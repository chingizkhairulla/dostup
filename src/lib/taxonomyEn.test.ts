import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORY_NAMES_EN, SUBCATEGORY_NAMES_EN } from "./taxonomyEn";
import { categoryLabel, productCategoryLabel, subcategoryLabel, billingPeriodLabel } from "./catalog";

// The English taxonomy names live in the client, not in a name_en column —
// see memory-bank/creative/creative-taxonomy-english.md. That trade is only
// safe while the map cannot fall behind the seeded rows, which is what the
// first test here checks, by reading the migration itself.

const SEED_MIGRATION = "supabase/migrations/20260825100000_category_taxonomy.sql";

function readRepoFile(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function seededCategorySlugs(): string[] {
  const sql = readRepoFile(SEED_MIGRATION);
  const insert = sql.slice(sql.indexOf("INSERT INTO public.categories"));
  const values = insert.slice(0, insert.indexOf("ON CONFLICT"));
  return [...values.matchAll(/\('([a-z0-9-]+)',\s*'/g)].map((match) => match[1]);
}

function seededSubcategorySlugs(): string[] {
  const sql = readRepoFile(SEED_MIGRATION);
  const insert = sql.slice(sql.indexOf("INSERT INTO public.subcategories"));
  const values = insert.slice(0, insert.indexOf("ON CONFLICT"));
  // Rows look like ('category-slug', 'subcategory-slug', 'Название', ...).
  return [...values.matchAll(/\('[a-z0-9-]+',\s*'([a-z0-9-]+)',\s*'/g)].map((match) => match[1]);
}

describe("the English taxonomy map covers what the database actually holds", () => {
  it("names every seeded category", () => {
    const seeded = seededCategorySlugs();

    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.filter((slug) => !CATEGORY_NAMES_EN[slug])).toEqual([]);
  });

  it("names every seeded subcategory", () => {
    const seeded = seededSubcategorySlugs();

    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.filter((slug) => !SUBCATEGORY_NAMES_EN[slug])).toEqual([]);
  });

  it("holds no Cyrillic, which would mean a name was never translated", () => {
    const untranslated = [
      ...Object.entries(CATEGORY_NAMES_EN),
      ...Object.entries(SUBCATEGORY_NAMES_EN),
    ].filter(([, name]) => /[Ѐ-ӿ]/.test(name));

    expect(untranslated).toEqual([]);
  });
});

describe("labels in each language", () => {
  const category = { slug: "courses", name_ru: "Курсы", name_kk: "Курстар" };
  const subcategory = { slug: "video-courses", name_ru: "видеокурсы", name_kk: "Бейне курстар" };

  it("returns the English name for English", () => {
    expect(categoryLabel(category, "en")).toBe("Courses");
    expect(subcategoryLabel(subcategory, "en")).toBe("video courses");
  });

  it("leaves Russian and Kazakh exactly as the database has them", () => {
    expect(categoryLabel(category, "ru")).toBe("Курсы");
    expect(categoryLabel(category, "kk")).toBe("Курстар");
    expect(subcategoryLabel(subcategory, "kk")).toBe("Бейне курстар");
  });

  it("falls back to Russian — never Kazakh — for a slug the map does not know", () => {
    const unknown = { slug: "quantum-basket-weaving", name_ru: "Плетение", name_kk: "Тоқу" };

    expect(categoryLabel(unknown, "en")).toBe("Плетение");
    expect(subcategoryLabel(unknown, "en")).toBe("Плетение");
  });

  it("labels a product's category by its slug too", () => {
    const product = {
      category_slug: "materials",
      category_name_ru: "Материалы",
      category_name_kk: "Материалдар",
    };

    expect(productCategoryLabel(product, "en")).toBe("Materials");
    expect(productCategoryLabel(product, "ru")).toBe("Материалы");
  });

  it("says the billing period in English", () => {
    expect(billingPeriodLabel("month", "en")).toBe("per month");
    expect(billingPeriodLabel("quarter", "en")).toBe("per quarter");
    expect(billingPeriodLabel("year", "en")).toBe("per year");
    expect(billingPeriodLabel("month", "ru")).toBe("в месяц");
  });
});

describe("product topics stay in Russian on purpose", () => {
  // products.topic stores the chosen label itself as free text, so translating
  // the preset list would put "Mathematics" and "🔢 Математика" in the same
  // column as two different topics and break the Russian keyword matching in
  // aiCategory.ts. This guards the decision against a well-meaning later pass.
  it("keeps the preset topic list Russian", () => {
    const taxonomy = readRepoFile("src/lib/taxonomyData.ts");

    expect(taxonomy).toContain("Математика");
    expect(taxonomy).toContain("Английский язык");
  });
});
