import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { SellerStorefront } from "@/lib/catalog";

const storefront = vi.fn();

vi.mock("@/hooks/useSellerStorefront", () => ({
  useSellerStorefront: () => storefront(),
}));

vi.mock("@/contexts/SimpleAuthContext", () => ({
  useSimpleAuth: () => ({
    status: "guest",
    sessionToken: null,
    profileType: null,
    user: null,
    profiles: [],
    switchProfile: vi.fn(),
  }),
}));

import StorefrontPage from "@/pages/StorefrontPage";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { InstallPromptProvider } from "@/contexts/InstallPromptContext";

function seller(overrides: Partial<SellerStorefront> = {}): SellerStorefront {
  return {
    handle: "sat-academy",
    display_name: "SAT Academy",
    avatar_url: null,
    type: "creator",
    bio: "Мы готовим учеников к SAT",
    created_at: "2026-04-17T00:00:00.000Z",
    avg_rating: 4.8,
    review_count: 243,
    sales_count: 152,
    products: [],
    ...overrides,
  };
}

function renderStorefront(data: SellerStorefront | null, isLoading = false) {
  storefront.mockReturnValue({ data, isLoading });
  return render(
    <LanguageProvider>
      <InstallPromptProvider>
        <MemoryRouter initialEntries={["/s/sat-academy"]}>
          <Routes>
            <Route path="/s/:handle" element={<StorefrontPage />} />
          </Routes>
        </MemoryRouter>
      </InstallPromptProvider>
    </LanguageProvider>,
  );
}

// Round 3: the storefront can be left with the same back button as a product.
describe("StorefrontPage back button", () => {
  it("offers the back button in the sticky header bar", () => {
    renderStorefront(seller());

    const back = screen.getByRole("button", { name: "Назад" });
    expect(screen.getByTestId("header-below")).toContainElement(back);
  });

  it("offers it on the not-found page too, so the user is never stuck", () => {
    renderStorefront(null);

    expect(screen.getByRole("button", { name: "Назад" })).toBeInTheDocument();
  });
});

describe("StorefrontPage", () => {
  it("shows the seller name and public description", () => {
    renderStorefront(seller());

    expect(screen.getByRole("heading", { name: "SAT Academy" })).toBeInTheDocument();
    expect(screen.getByText("Мы готовим учеников к SAT")).toBeInTheDocument();
  });

  // AC 23: the year is derived from the real account creation date.
  it("derives the joined year from created_at", () => {
    renderStorefront(seller());

    expect(screen.getByText("На платформе с 2026 года")).toBeInTheDocument();
  });

  it("uses the year of the actual timestamp, not the current year", () => {
    renderStorefront(seller({ created_at: "2023-11-02T00:00:00.000Z" }));

    expect(screen.getByText("На платформе с 2023 года")).toBeInTheDocument();
  });

  it("shows the rating with a correctly pluralised review count", () => {
    renderStorefront(seller());

    expect(screen.getByText("4.8")).toBeInTheDocument();
    expect(screen.getByText("· 243 отзыва")).toBeInTheDocument();
  });

  it("shows the sales count", () => {
    renderStorefront(seller());

    expect(screen.getByText("152 продажи")).toBeInTheDocument();
  });

  // Round 3: the overall rating is always shown, with empty stars and
  // "нет отзывов" when there are none — never a misleading 0.0.
  it("always shows the overall rating, even with no reviews", () => {
    renderStorefront(seller({ avg_rating: 0, review_count: 0 }));

    const rating = screen.getByTestId("seller-rating");
    expect(rating).toHaveTextContent("Общая оценка");
    expect(rating).toHaveTextContent("нет отзывов");
    expect(rating.querySelectorAll("svg")).toHaveLength(5);
    expect(rating.querySelectorAll("[data-filled]")).toHaveLength(0);
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
  });

  it("fills the stars to the average rating across all the seller's products", () => {
    renderStorefront(seller({ avg_rating: 4.3, review_count: 12 }));

    const rating = screen.getByTestId("seller-rating");
    expect(rating).toHaveTextContent("Общая оценка");
    expect(rating).toHaveTextContent("4.3");
    expect(rating.querySelectorAll("[data-filled]")).toHaveLength(4);
  });

  // Round 3: "если нету писать 0 продаж".
  it("shows 0 sales for a seller with no sales yet", () => {
    renderStorefront(seller({ sales_count: 0 }));

    expect(screen.getByText("0 продаж")).toBeInTheDocument();
  });

  it("omits the joined line when the date is missing", () => {
    renderStorefront(seller({ created_at: null }));

    expect(screen.queryByText(/На платформе с/)).not.toBeInTheDocument();
  });

  it("renders a not-found message for an unknown handle", () => {
    renderStorefront(null);

    expect(screen.queryByRole("heading", { name: "SAT Academy" })).not.toBeInTheDocument();
  });
});
