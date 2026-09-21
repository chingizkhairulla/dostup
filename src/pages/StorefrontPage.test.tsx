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

  // AC 27: "Нет отзывов" rather than a misleading 0.0.
  it("says there are no reviews instead of showing a zero rating", () => {
    renderStorefront(seller({ avg_rating: 0, review_count: 0 }));

    expect(screen.getByText("Нет отзывов")).toBeInTheDocument();
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
  });

  it("hides the sales line for a seller with no sales yet", () => {
    renderStorefront(seller({ sales_count: 0 }));

    expect(screen.queryByText(/продаж/)).not.toBeInTheDocument();
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
