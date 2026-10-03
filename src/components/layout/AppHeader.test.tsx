import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import AppHeader from "@/components/layout/AppHeader";
import { InstallPromptProvider } from "@/contexts/InstallPromptContext";
import { LanguageProvider } from "@/contexts/LanguageContext";

function renderHeader(below?: React.ReactNode) {
  return render(
    <LanguageProvider>
      <InstallPromptProvider>
        <MemoryRouter>
          <AppHeader below={below} />
        </MemoryRouter>
      </InstallPromptProvider>
    </LanguageProvider>,
  );
}

afterEach(() => {
  document.documentElement.style.removeProperty("--public-sticky-offset");
});

describe("AppHeader", () => {
  // Round 3: the back button stays in view while scrolling because it rides in
  // the header's own sticky wrapper; no separate offset to keep in sync.
  it("renders the `below` bar inside the same sticky wrapper as the header", () => {
    renderHeader(<button type="button">Назад</button>);

    const bar = screen.getByTestId("header-below");
    const sticky = bar.parentElement as HTMLElement;
    expect(sticky).toHaveClass("sticky", "top-0");
    expect(sticky.querySelector("header")).not.toBeNull();
    expect(bar).toContainElement(screen.getByRole("button", { name: "Назад" }));
    // Aligned with the page content, which uses the same container.
    expect(bar.firstElementChild).toHaveClass("public-container");
  });

  it("renders no extra bar when there is nothing to put in it", () => {
    renderHeader();

    expect(screen.queryByTestId("header-below")).not.toBeInTheDocument();
  });

  it("publishes its height for sticky content further down the page", () => {
    renderHeader(<span>x</span>);

    expect(document.documentElement.style.getPropertyValue("--public-sticky-offset")).toMatch(/^\d+px$/);
  });

  it("withdraws the height when it unmounts", () => {
    const { unmount } = renderHeader();
    unmount();

    expect(document.documentElement.style.getPropertyValue("--public-sticky-offset")).toBe("");
  });
});
