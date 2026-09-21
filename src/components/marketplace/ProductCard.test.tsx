import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ProductCard from "@/components/marketplace/ProductCard";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { CatalogProduct } from "@/lib/catalog";

function makeProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "product-1",
    slug: "sat-prep",
    title: "SAT Preparation",
    headline: "Интенсив",
    image_url: "https://example.com/cover.jpg",
    price: 49000,
    has_schedule: false,
    created_at: "2026-01-01T00:00:00.000Z",
    category_slug: "online-lessons",
    category_emoji: "📚",
    seller_handle: "sat-academy",
    seller_display_name: "SAT Academy",
    seller_avatar_url: null,
    avg_rating: 4.8,
    review_count: 12,
    ...overrides,
  } as CatalogProduct;
}

function renderCard(product: CatalogProduct) {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    </LanguageProvider>,
  );
}

describe("ProductCard", () => {
  it("links the card to the product", () => {
    const { container } = renderCard(makeProduct());

    const productLink = Array.from(container.querySelectorAll("a")).find(
      (a) => a.getAttribute("href") === "/p/sat-prep",
    );
    expect(productLink).toBeDefined();
  });

  // AC 20: the seller block is its own link, and only that block.
  it("links the seller block to the storefront", () => {
    const { container } = renderCard(makeProduct());

    const sellerLink = Array.from(container.querySelectorAll("a")).find(
      (a) => a.getAttribute("href") === "/s/sat-academy",
    );
    expect(sellerLink).toBeDefined();
    expect(sellerLink).toHaveTextContent("SAT Academy");
  });

  // The whole card used to be one <a>, so a seller link inside it would have
  // been an anchor nested in an anchor: invalid html and broken routing.
  it("never nests one link inside another", () => {
    const { container } = renderCard(makeProduct());

    expect(container.querySelectorAll("a a")).toHaveLength(0);
    expect(container.firstElementChild?.tagName).not.toBe("A");
  });

  it("exposes exactly two navigation targets: the product and the seller", () => {
    const { container } = renderCard(makeProduct());

    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs.sort()).toEqual(["/p/sat-prep", "/s/sat-academy"]);
  });

  it("encodes a handle that needs escaping", () => {
    const { container } = renderCard(makeProduct({ seller_handle: "a b&c" }));

    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toContain("/s/a%20b%26c");
  });

  it("shows the seller as plain text when there is no handle to link to", () => {
    const { container } = renderCard(makeProduct({ seller_handle: null }));

    expect(screen.getByText("SAT Academy")).toBeInTheDocument();
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual(["/p/sat-prep"]);
  });

  it("falls back to the product id when the product has no slug", () => {
    const { container } = renderCard(makeProduct({ slug: null }));

    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toContain("/p/product-1");
  });
});
