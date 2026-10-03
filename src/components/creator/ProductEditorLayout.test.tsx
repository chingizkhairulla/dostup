import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/hooks/useProducts";

const isDesktop = vi.fn().mockReturnValue(true);
vi.mock("@/hooks/use-mobile", () => ({
  useIsDesktop: () => isDesktop(),
  useIsMobile: () => !isDesktop(),
  useMediaQuery: () => isDesktop(),
}));

import ProductEditorLayout from "@/components/creator/ProductEditorLayout";
import { LanguageProvider } from "@/contexts/LanguageContext";

const product = { id: "preview", title: "SAT Preparation" } as unknown as Product;

function renderLayout(
  props: Partial<{
    title: React.ReactNode;
    footer: React.ReactNode;
    headerRight: React.ReactNode;
  }> = {},
) {
  return render(
    <LanguageProvider>
      <ProductEditorLayout
        previewProduct={product}
        title={<span>Создать продукт</span>}
        footer={<button type="button">Сохранить</button>}
        {...props}
      >
        <form data-testid="product-form">
          <input aria-label="Название" />
        </form>
      </ProductEditorLayout>
    </LanguageProvider>,
  );
}

const root = (container: HTMLElement) => container.firstElementChild as HTMLElement;
const leftPane = (container: HTMLElement) =>
  screen.getByTestId("product-form").closest(".flex.min-h-0.min-w-0.flex-col") as HTMLElement;

beforeEach(() => {
  isDesktop.mockReturnValue(true);
});

describe("ProductEditorLayout on desktop", () => {
  it("renders the form and the preview together", () => {
    const { container } = renderLayout();

    expect(screen.getByTestId("product-form")).toBeInTheDocument();
    expect(container.querySelector("iframe")).not.toBeNull();
  });

  // Round 3: the customer asked for sections on 40 % and the preview on 60 %.
  it("splits the window into a 40/60 grid", () => {
    const { container } = renderLayout();

    expect(root(container).className).toMatch(/\bgrid\b/);
    expect(root(container).className).toMatch(/grid-cols-\[minmax\(0,2fr\)_minmax\(0,3fr\)\]/);
  });

  it("offers no editor/preview tabs, because both are already visible", () => {
    renderLayout();

    expect(screen.queryByRole("button", { name: "Редактор" })).not.toBeInTheDocument();
  });

  it("shows the window title in the left pane's top bar", () => {
    renderLayout();

    expect(screen.getByText("Создать продукт")).toBeInTheDocument();
  });

  it("shows the preview heading and the viewport switch in the right pane", () => {
    renderLayout();

    expect(screen.getByText("Предпросмотр")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Телефон" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Компьютер" })).toBeInTheDocument();
  });

  it("places the close control at the top right, in the preview's bar", () => {
    renderLayout({ headerRight: <button type="button">Закрыть</button> });

    expect(screen.getByRole("button", { name: "Закрыть" })).toBeInTheDocument();
  });
});

describe("the save button is pinned below the sections", () => {
  it("renders the footer outside the scrolling area, so it cannot scroll away", () => {
    renderLayout();

    const save = screen.getByRole("button", { name: "Сохранить" });
    const scrollArea = screen.getByTestId("product-form").closest(".overflow-y-auto");

    expect(scrollArea).not.toBeNull();
    expect(scrollArea?.contains(save)).toBe(false);
  });

  it("puts the footer last in the left pane, under the sections", () => {
    const { container } = renderLayout();

    const pane = leftPane(container);
    const save = screen.getByRole("button", { name: "Сохранить" });
    const footer = save.parentElement as HTMLElement;

    expect(footer.parentElement).toBe(pane);
    expect(pane.lastElementChild).toBe(footer);
  });

  it("aligns the button to the right, as a compact button rather than a full-width bar", () => {
    renderLayout();

    const footer = screen.getByRole("button", { name: "Сохранить" }).parentElement as HTMLElement;
    expect(footer.className).toMatch(/justify-end/);
  });
});

// Measured in a real browser: centring the scroll container itself pushes the
// first section above the scroll origin once sections expand, where it can
// never be reached. Auto margins centre when short and clip nothing when tall.
describe("sections are centred without becoming unreachable", () => {
  it("centres the sections with auto margins", () => {
    renderLayout();

    const wrapper = screen.getByTestId("product-form").parentElement as HTMLElement;
    expect(wrapper.className).toMatch(/\bmy-auto\b/);
  });

  it("does not centre by justifying the scrolling container", () => {
    renderLayout();

    const scrollArea = screen.getByTestId("product-form").closest(".overflow-y-auto") as HTMLElement;
    expect(scrollArea.className).not.toMatch(/justify-center/);
    expect(scrollArea.className).not.toMatch(/content-center/);
  });
});

describe("ProductEditorLayout on a small screen", () => {
  beforeEach(() => {
    isDesktop.mockReturnValue(false);
  });

  it("shows the form first, with the preview behind a tab", () => {
    const { container } = renderLayout();

    expect(screen.getByTestId("product-form")).toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("button", { name: "Редактор" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("swaps to the preview when the preview tab is chosen", async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();

    await user.click(screen.getByRole("button", { name: "Предпросмотр" }));

    expect(container.querySelector("iframe")).not.toBeNull();
  });

  it("keeps the tabs reachable while the preview is showing", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole("button", { name: "Предпросмотр" }));

    expect(screen.getByRole("button", { name: "Редактор" })).toBeVisible();
  });

  it("keeps the form mounted while the preview is showing, so edits are not lost", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.type(screen.getByLabelText("Название"), "SAT");
    await user.click(screen.getByRole("button", { name: "Предпросмотр" }));
    await user.click(screen.getByRole("button", { name: "Редактор" }));

    expect(screen.getByLabelText("Название")).toHaveValue("SAT");
  });

  it("offers no desktop viewport on a phone", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole("button", { name: "Предпросмотр" }));

    expect(screen.queryByRole("button", { name: "Компьютер" })).not.toBeInTheDocument();
  });
});

// Regression (round 1): returning a differently shaped tree per mode made React
// remount the form and wipe its local state — a picked cover photo vanished.
// The cropper is now its own window (round 3), so the remaining mode change is
// the screen size flipping between the phone and desktop layouts.
describe("the form survives every layout change", () => {
  const StatefulForm = () => {
    const [pickedFile, setPickedFile] = useState<string | null>(null);
    return (
      <form>
        <button type="button" onClick={() => setPickedFile("cover.jpg")}>
          pick photo
        </button>
        <output data-testid="picked">{pickedFile ?? "none"}</output>
      </form>
    );
  };

  function Harness() {
    return (
      <LanguageProvider>
        <ProductEditorLayout
          previewProduct={product}
          title={<span>Создание продукта</span>}
          footer={<button type="button">Создать</button>}
        >
          <StatefulForm />
        </ProductEditorLayout>
      </LanguageProvider>
    );
  }

  it("keeps form state when the screen is detected as desktop only after first render", async () => {
    isDesktop.mockReturnValue(false);
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);

    await user.click(screen.getByRole("button", { name: "pick photo" }));
    isDesktop.mockReturnValue(true);
    rerender(<Harness />);

    expect(screen.getByTestId("picked")).toHaveTextContent("cover.jpg");
  });

  it("keeps form state when a desktop window shrinks to the phone layout", async () => {
    isDesktop.mockReturnValue(true);
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);

    await user.click(screen.getByRole("button", { name: "pick photo" }));
    isDesktop.mockReturnValue(false);
    rerender(<Harness />);

    expect(screen.getByTestId("picked")).toHaveTextContent("cover.jpg");
  });
});

// Found by screenshotting: in the stacked layout neither pane filled the window,
// so the Save button floated mid-screen and the preview stage measured zero.
// Grid stretches its items; a flex column does not without flex-1.
describe("both panes fill the window", () => {
  it("stretches the sections pane, so its footer sits at the window bottom", () => {
    const { container } = renderLayout();
    const pane = leftPane(container);

    expect(pane.className).toMatch(/\bflex-1\b/);
  });

  it("stretches the preview pane, so its stage has a real height to measure", () => {
    isDesktop.mockReturnValue(true);
    const { container } = renderLayout();
    const previewPane = container.querySelector("iframe")?.closest(".flex.min-h-0") as HTMLElement;

    expect(previewPane.className).toMatch(/\bflex-1\b/);
  });
});
