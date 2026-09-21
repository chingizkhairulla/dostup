import { describe, expect, it } from "vitest";
import { sellerReviewsLabel, sellerSalesLabel } from "@/lib/catalog";

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
