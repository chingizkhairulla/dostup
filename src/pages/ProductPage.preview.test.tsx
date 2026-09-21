import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Product } from "@/hooks/useProducts";

const product = {
  id: "product-1",
  creator_id: "creator-1",
  title: "SAT Preparation",
  headline: "Интенсив",
  description: "Описание курса",
  price: 49000,
  image_url: null,
  video_url: null,
  media: [],
  has_schedule: false,
  is_active: true,
  slug: "sat-prep",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  kaspi_link: "https://kaspi.kz/pay/x",
  kaspi_phone: null,
  telegram_link: null,
  faq: [],
  access_duration_days: null,
  is_paused: false,
  paused_message: null,
  author_name: "SAT Academy",
  seller_handle: "sat-academy",
  seller_avatar_url: null,
  category_slug: "online-lessons",
  payment_type: "one_time",
  recurring_interval: null,
  has_free_trial: false,
  trial_days: null,
  pricing_options: [],
} as unknown as Product;

// Signed in: this is exactly the state in which the old preview leaked the
// platform navigation, so the header must be the real one, not a stub.
vi.mock("@/contexts/SimpleAuthContext", () => ({
  useSimpleAuth: () => ({
    user: { id: "user-1" },
    profileType: "creator",
    profiles: [],
    switchProfile: vi.fn(),
    status: "authenticated",
    sessionToken: "session-token",
  }),
}));

vi.mock("@/hooks/useProducts", () => ({
  useProduct: (id?: string) => ({ data: id ? product : null, isLoading: false }),
  useProductProgram: () => ({ data: [] }),
}));

const invokeApi = vi.fn().mockResolvedValue({});
vi.mock("@/lib/sessionApi", () => ({
  invokeApi: (...args: unknown[]) => invokeApi(...args),
  creatorCreds: () => ({}),
}));

import ProductPage from "@/pages/ProductPage";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { InstallPromptProvider } from "@/contexts/InstallPromptContext";

// Mounted on real routes so `useParams` behaves as it does in the app.
function renderPage(ui: ReactNode, route = "/preview/product") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <InstallPromptProvider>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path="/p/:productId" element={ui} />
              <Route path="/preview/product" element={ui} />
            </Routes>
          </MemoryRouter>
        </InstallPromptProvider>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  invokeApi.mockClear();
});

describe("ProductPage in preview mode", () => {
  it("renders the product itself", () => {
    renderPage(<ProductPage isPreview previewProduct={product} />);

    expect(screen.getByRole("heading", { name: "SAT Preparation" })).toBeInTheDocument();
    expect(screen.getByText("Интенсив")).toBeInTheDocument();
  });

  // AC 1-5: from inside the preview there must be no way back into the platform.
  it("exposes no links at all, so there is nothing to navigate with", () => {
    const { container } = renderPage(<ProductPage isPreview previewProduct={product} />);

    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("renders no global header and no footer", () => {
    const { container } = renderPage(<ProductPage isPreview previewProduct={product} />);

    expect(container.querySelector("header")).toBeNull();
    expect(container.querySelector("footer")).toBeNull();
  });

  it("renders no back control", () => {
    renderPage(<ProductPage isPreview previewProduct={product} />);

    expect(screen.queryByText("Назад")).not.toBeInTheDocument();
  });

  it("still shows the seller, but not as a link to their storefront", () => {
    renderPage(<ProductPage isPreview previewProduct={product} />);

    expect(screen.getAllByText("SAT Academy").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /SAT Academy/ })).not.toBeInTheDocument();
  });

  it("issues no network calls, so a draft preview never touches the backend", () => {
    renderPage(<ProductPage isPreview previewProduct={product} />);

    expect(invokeApi).not.toHaveBeenCalled();
  });

  it("renders the empty state when there is no draft yet", () => {
    renderPage(<ProductPage isPreview previewProduct={null} />);

    expect(
      screen.getByText("Заполните форму, чтобы увидеть предпросмотр"),
    ).toBeInTheDocument();
  });
});

// The contrast case: without isPreview the very same component must still
// render the chrome, otherwise the tests above would pass trivially.
describe("ProductPage in normal mode", () => {
  it("renders the global header with the platform navigation", () => {
    const { container } = renderPage(<ProductPage />, "/p/sat-prep");

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("renders the back control and the seller storefront link", () => {
    renderPage(<ProductPage />, "/p/sat-prep");

    expect(screen.getByText("Назад")).toBeInTheDocument();
    const sellerLink = screen.getAllByRole("link").find(
      (link) => link.getAttribute("href") === "/s/sat-academy",
    );
    expect(sellerLink).toBeDefined();
  });
});

// Regression: the title shared one flex row with the Share/Report buttons and
// was `flex-1` (basis 0), so flex-wrap never wrapped it. On a phone it was
// squeezed to ~55px and `break-words` chopped "Программирование" into a column
// of syllables. The title must own its row, with the actions underneath.
describe("ProductPage title layout", () => {
  const withTitle = (title: string) => ({ ...product, title }) as Product;

  function titleAndActions(title: string) {
    const { container } = renderPage(<ProductPage isPreview previewProduct={withTitle(title)} />);
    const heading = container.querySelector("h1") as HTMLElement;
    return { heading, container };
  }

  it("puts the share and report actions after the title, not beside it", () => {
    const { heading } = titleAndActions("Программирование");
    const actions = heading.nextElementSibling as HTMLElement;

    expect(actions).not.toBeNull();
    expect(actions).toHaveTextContent("Поделиться");
    expect(actions).toHaveTextContent("Пожаловаться");
  });

  it("does not put the title in a flex row alongside the actions", () => {
    const { heading } = titleAndActions("Программирование");
    const parent = heading.parentElement as HTMLElement;

    expect(parent.className).not.toMatch(/\bflex\b/);
    expect(heading.className).not.toMatch(/\bflex-1\b/);
  });

  it("keeps a short title at the full display size", () => {
    const { heading } = titleAndActions("Программирование");
    expect(heading).toHaveClass("public-display");
  });

  it("steps a long title down so it does not stack into huge lines", () => {
    const { heading } = titleAndActions("Основы веб-разработки для новичков");
    expect(heading).toHaveClass("public-display-long");
    expect(heading).not.toHaveClass("public-display");
  });

  it("steps a very long title down further", () => {
    const { heading } = titleAndActions(
      "Подготовка к SAT для поступления в американские университеты с нуля",
    );
    expect(heading).toHaveClass("public-display-xlong");
  });

  it("still breaks a single unbreakable word instead of overflowing", () => {
    const { heading } = titleAndActions("Электроэнцефалографическаядиагностика");
    expect(heading.className).toMatch(/break-words/);
  });
});

// Regression found in a real browser: below `lg` the page grid had no column
// template, so its single track was `auto` and grew to the width of the longest
// unbreakable word in the title (overflow-wrap does not shrink min-content).
// The whole column, cover image included, then ran off the right edge of the
// phone. The track has to be allowed to shrink to the viewport.
describe("ProductPage column can shrink to the viewport", () => {
  it("uses a shrinkable single column below the desktop breakpoint", () => {
    const { container } = renderPage(
      <ProductPage
        isPreview
        previewProduct={{ ...product, title: "Электроэнцефалографическаядиагностика" } as Product}
      />,
    );
    const grid = (container.querySelector("h1") as HTMLElement).closest(".grid") as HTMLElement;

    expect(grid).not.toBeNull();
    expect(grid.className).toMatch(/(^|\s)grid-cols-1(\s|$)/);
  });
});
