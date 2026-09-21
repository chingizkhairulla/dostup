import { describe, expect, it } from "vitest";
import { PRODUCT_TITLE_CLASS, productTitleSize } from "@/lib/productTitle";

// A long product title set in the same huge display size as a short one stacks
// into many lines and looks broken, so the size steps down with the length.
describe("productTitleSize", () => {
  it("keeps short titles at the full display size", () => {
    expect(productTitleSize("Программирование")).toBe("default");
    expect(productTitleSize("SAT Preparation")).toBe("default");
  });

  it("steps a medium title down one size", () => {
    expect(productTitleSize("Основы веб-разработки для новичков")).toBe("long");
  });

  it("steps a very long title down two sizes", () => {
    expect(
      productTitleSize("Подготовка к SAT для поступления в американские университеты с нуля"),
    ).toBe("xlong");
  });

  it("switches sizes exactly at the thresholds", () => {
    expect(productTitleSize("а".repeat(24))).toBe("default");
    expect(productTitleSize("а".repeat(25))).toBe("long");
    expect(productTitleSize("а".repeat(48))).toBe("long");
    expect(productTitleSize("а".repeat(49))).toBe("xlong");
  });

  // The title is rendered with **bold** markers stripped, so they must not
  // push a short title into a smaller size.
  it("does not count bold markers or surrounding whitespace", () => {
    expect(productTitleSize("  **" + "а".repeat(24) + "**  ")).toBe("default");
  });

  it("tolerates a missing title", () => {
    expect(productTitleSize(null)).toBe("default");
    expect(productTitleSize(undefined)).toBe("default");
    expect(productTitleSize("")).toBe("default");
  });
});

describe("PRODUCT_TITLE_CLASS", () => {
  it("maps every size to its own css class", () => {
    expect(PRODUCT_TITLE_CLASS.default).toBe("public-display");
    expect(PRODUCT_TITLE_CLASS.long).toBe("public-display-long");
    expect(PRODUCT_TITLE_CLASS.xlong).toBe("public-display-xlong");
  });
});
