import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/hooks/useProducts";

const isMobile = vi.fn().mockReturnValue(false);
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => isMobile(),
}));

import ProductEditorLayout from "@/components/creator/ProductEditorLayout";
import { LanguageProvider } from "@/contexts/LanguageContext";

const product = { id: "preview", title: "SAT Preparation" } as unknown as Product;

function renderLayout(previewHidden = false) {
  return render(
    <LanguageProvider>
      <ProductEditorLayout previewProduct={product} previewHidden={previewHidden}>
        <form data-testid="product-form">
          <input aria-label="Название" />
        </form>
      </ProductEditorLayout>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  isMobile.mockReturnValue(false);
});

describe("ProductEditorLayout on desktop", () => {
  // AC 12: the form and the preview sit side by side.
  it("renders the form and the preview together", () => {
    const { container } = renderLayout();

    expect(screen.getByTestId("product-form")).toBeInTheDocument();
    expect(container.querySelector("iframe")).not.toBeNull();
  });

  it("offers no editor/preview tabs, because both are already visible", () => {
    renderLayout();

    expect(screen.queryByRole("button", { name: "Редактор" })).not.toBeInTheDocument();
  });

  it("offers the phone and desktop viewport switch", () => {
    renderLayout();

    expect(screen.getByRole("button", { name: "Телефон" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Компьютер" })).toBeInTheDocument();
  });

  // Cover cropping takes over the dialog, so the preview steps aside.
  it("drops the preview while the cover cropper is open", () => {
    const { container } = renderLayout(true);

    expect(screen.getByTestId("product-form")).toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
  });
});

describe("ProductEditorLayout on mobile", () => {
  beforeEach(() => {
    isMobile.mockReturnValue(true);
  });

  // AC 14: the form must not be squeezed next to a preview on a small screen.
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
    expect(screen.getByRole("button", { name: "Предпросмотр" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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

// Regression: picking a cover photo made the form report "cropping started",
// the parent flipped `previewHidden`, and the layout returned a different tree
// shape. React then unmounted and re-mounted the form, wiping the cropper's
// local state (the picked file included) — so the photo vanished the instant
// it was chosen. The form must survive every layout switch with its state.
describe("ProductEditorLayout keeps the form mounted across layout changes", () => {
  // Stands in for ProductForm: holds its own local state, like useCoverCrop does.
  const StatefulForm = ({ onPick }: { onPick: () => void }) => {
    const [pickedFile, setPickedFile] = useState<string | null>(null);
    return (
      <form>
        <button
          type="button"
          onClick={() => {
            setPickedFile("cover.jpg");
            onPick();
          }}
        >
          pick photo
        </button>
        <output data-testid="picked">{pickedFile ?? "none"}</output>
      </form>
    );
  };

  function Harness() {
    const [cropping, setCropping] = useState(false);
    return (
      <LanguageProvider>
        <ProductEditorLayout previewProduct={product} previewHidden={cropping}>
          <StatefulForm onPick={() => setCropping(true)} />
        </ProductEditorLayout>
      </LanguageProvider>
    );
  }

  it("keeps a picked photo when the cropper opens on desktop", async () => {
    isMobile.mockReturnValue(false);
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "pick photo" }));

    expect(screen.getByTestId("picked")).toHaveTextContent("cover.jpg");
  });

  it("keeps a picked photo when the cropper opens on mobile", async () => {
    isMobile.mockReturnValue(true);
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "pick photo" }));

    expect(screen.getByTestId("picked")).toHaveTextContent("cover.jpg");
  });

  // On a real phone useIsMobile() is false for the first render and flips to
  // true in an effect, so the layout switches shape right after opening.
  it("keeps form state when the screen is detected as mobile after first render", async () => {
    isMobile.mockReturnValue(false);
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);

    await user.click(screen.getByRole("button", { name: "pick photo" }));
    isMobile.mockReturnValue(true);
    rerender(<Harness />);

    expect(screen.getByTestId("picked")).toHaveTextContent("cover.jpg");
  });
});
