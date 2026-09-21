import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/hooks/useProducts";

vi.mock("@/contexts/SimpleAuthContext", () => ({
  useSimpleAuth: () => ({
    user: null,
    profileType: null,
    profiles: [],
    switchProfile: vi.fn(),
    status: "guest",
    sessionToken: null,
  }),
}));

vi.mock("@/hooks/useProducts", () => ({
  useProduct: () => ({ data: null, isLoading: false }),
  useProductProgram: () => ({ data: [] }),
}));

vi.mock("@/lib/sessionApi", () => ({
  invokeApi: vi.fn().mockResolvedValue({}),
  creatorCreds: () => ({}),
}));

import ProductPreviewRoute from "@/pages/ProductPreviewRoute";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { InstallPromptProvider } from "@/contexts/InstallPromptContext";
import { dataMessage } from "@/lib/productPreview";

const draft = {
  id: "preview",
  title: "SAT Preparation",
  headline: "Интенсив",
  price: 49000,
  media: [],
  faq: [],
  pricing_options: [],
  author_name: "SAT Academy",
  seller_handle: "sat-academy",
  is_paused: false,
} as unknown as Product;

function renderRoute() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <InstallPromptProvider>
          <MemoryRouter initialEntries={["/preview/product"]}>
            <ProductPreviewRoute />
          </MemoryRouter>
        </InstallPromptProvider>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProductPreviewRoute", () => {
  it("announces itself to the parent frame on mount", () => {
    const postMessage = vi.spyOn(window.parent, "postMessage");

    renderRoute();

    expect(postMessage).toHaveBeenCalledWith(
      { source: "dostup-preview", type: "ready" },
      window.location.origin,
    );
  });

  it("starts empty and renders the draft once the parent sends it", async () => {
    renderRoute();

    expect(
      screen.getByText("Заполните форму, чтобы увидеть предпросмотр"),
    ).toBeInTheDocument();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: dataMessage(draft),
        origin: window.location.origin,
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "SAT Preparation" })).toBeInTheDocument();
    });
  });

  it("ignores draft data sent from another origin", async () => {
    renderRoute();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: dataMessage(draft),
        origin: "https://evil.example",
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Заполните форму, чтобы увидеть предпросмотр"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: "SAT Preparation" })).not.toBeInTheDocument();
  });

  it("swallows clicks on internal links so the preview cannot be navigated", async () => {
    renderRoute();

    const anchor = document.createElement("a");
    anchor.setAttribute("href", "/dashboard");
    document.body.appendChild(anchor);

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    anchor.remove();
  });

  it("leaves external links alone", () => {
    renderRoute();

    const anchor = document.createElement("a");
    anchor.setAttribute("href", "https://kaspi.kz/pay/x");
    document.body.appendChild(anchor);

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    anchor.remove();
  });
});
