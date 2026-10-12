import { describe, expect, it } from "vitest";
import {
  pricingOptionLabel,
  sellerReviewsLabel,
  sellerSalesLabel,
  trialDays,
} from "@/lib/catalog";

// Russian plural agreement is the kind of thing that silently ships wrong:
// 1 отзыв, 2 отзыва, 5 отзывов — and the teens are the exception to the rule.
describe("sellerReviewsLabel", () => {
  it.each([
    [1, "1 отзыв"],
    [2, "2 отзыва"],
    [3, "3 отзыва"],
    [4, "4 отзыва"],
    [5, "5 отзывов"],
    [10, "10 отзывов"],
    [21, "21 отзыв"],
    [22, "22 отзыва"],
    [25, "25 отзывов"],
    [101, "101 отзыв"],
    [243, "243 отзыва"],
  ])("formats %i in Russian", (count, expected) => {
    expect(sellerReviewsLabel(count, "ru")).toBe(expected);
  });

  it.each([
    [11, "11 отзывов"],
    [12, "12 отзывов"],
    [13, "13 отзывов"],
    [14, "14 отзывов"],
    [111, "111 отзывов"],
    [112, "112 отзывов"],
  ])("uses the genitive plural for the teens (%i)", (count, expected) => {
    expect(sellerReviewsLabel(count, "ru")).toBe(expected);
  });

  it("uses the invariant Kazakh form", () => {
    expect(sellerReviewsLabel(1, "kk")).toBe("1 пікір");
    expect(sellerReviewsLabel(5, "kk")).toBe("5 пікір");
  });
});

describe("sellerSalesLabel", () => {
  it.each([
    [1, "1 продажа"],
    [2, "2 продажи"],
    [5, "5 продаж"],
    [11, "11 продаж"],
    [21, "21 продажа"],
    [152, "152 продажи"],
  ])("formats %i in Russian", (count, expected) => {
    expect(sellerSalesLabel(count, "ru")).toBe(expected);
  });

  it("uses the invariant Kazakh form", () => {
    expect(sellerSalesLabel(3, "kk")).toBe("3 сатылым");
  });
});

// The product and checkout pages used to build these in Russian only, so an
// English visitor read "5 000 ₸ / в месяц" and "Попробовать бесплатно (7 дней)".
describe("pricingOptionLabel", () => {
  const monthly = { price: 5000, payment_type: "recurring", recurring_interval: "1m" };

  it("names the period in every language", () => {
    expect(pricingOptionLabel(monthly, "ru")).toMatch(/\/ в месяц$/);
    expect(pricingOptionLabel(monthly, "kk")).toMatch(/\/ айына$/);
    expect(pricingOptionLabel(monthly, "en")).toMatch(/\/ per month$/);
  });

  it("covers every interval the editor offers", () => {
    const en = (recurring_interval: string, access_duration_days?: number) =>
      pricingOptionLabel({ price: 100, payment_type: "recurring", recurring_interval, access_duration_days }, "en");
    expect(en("7d")).toMatch(/every 7 days$/);
    expect(en("14d")).toMatch(/every 14 days$/);
    expect(en("3m")).toMatch(/every 3 months$/);
    expect(en("1y")).toMatch(/per year$/);
    expect(en("custom", 45)).toMatch(/every 45 days$/);
  });

  it("marks a one-time price", () => {
    const once = { price: 100, payment_type: "one_time" };
    expect(pricingOptionLabel(once, "ru")).toMatch(/\(разово\)$/);
    expect(pricingOptionLabel(once, "en")).toMatch(/\(one-time\)$/);
  });

  it("never leaves Russian in the English label", () => {
    for (const recurring_interval of ["7d", "14d", "1m", "3m", "1y", "custom", "unknown"]) {
      expect(pricingOptionLabel({ price: 100, payment_type: "recurring", recurring_interval }, "en")).not.toMatch(
        /[а-яё]/i,
      );
    }
  });
});

describe("trialDays", () => {
  // The old code said "дня" only for exactly 3, so 2, 4 and 22 read wrong.
  it("uses all three Russian forms", () => {
    expect(trialDays(1, "ru")).toBe("1 день");
    expect(trialDays(3, "ru")).toBe("3 дня");
    expect(trialDays(4, "ru")).toBe("4 дня");
    expect(trialDays(7, "ru")).toBe("7 дней");
    expect(trialDays(11, "ru")).toBe("11 дней");
    expect(trialDays(22, "ru")).toBe("22 дня");
  });

  it("speaks Kazakh and English", () => {
    expect(trialDays(7, "kk")).toBe("7 күн");
    expect(trialDays(1, "en")).toBe("1 day");
    expect(trialDays(7, "en")).toBe("7 days");
  });
});
