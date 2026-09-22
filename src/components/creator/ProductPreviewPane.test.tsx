import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import ProductPreviewPane from "@/components/creator/ProductPreviewPane";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { PREVIEW_ROUTE, PREVIEW_VIEWPORT } from "@/lib/productPreview";
import type { Product } from "@/hooks/useProducts";

const product = { id: "preview", title: "SAT Preparation" } as unknown as Product;

function renderPane(props: Partial<{ phoneOnly: boolean; headerRight: React.ReactNode }> = {}) {
  return render(
    <LanguageProvider>
      <ProductPreviewPane product={product} {...props} />
    </LanguageProvider>,
  );
}

function frame(container: HTMLElement) {
  return container.querySelector("iframe") as HTMLIFrameElement;
}

describe("ProductPreviewPane", () => {
  it("points the frame at the isolated preview route, never at the public product page", () => {
    const { container } = renderPane();

    expect(frame(container).getAttribute("src")).toBe(PREVIEW_ROUTE);
    expect(frame(container).getAttribute("src")).not.toMatch(/^\/p\//);
  });

  // The heading the customer asked for, above the preview itself.
  it("labels the pane with a heading in its top bar", () => {
    renderPane();

    expect(screen.getByText("Предпросмотр")).toBeInTheDocument();
  });

  it("puts the window's close control in the same top bar", () => {
    renderPane({ headerRight: <button type="button">Закрыть</button> });

    expect(screen.getByRole("button", { name: "Закрыть" })).toBeInTheDocument();
  });

  // AC 8: phone is always the starting viewport, whatever device the seller is on.
  it("opens on the phone viewport", () => {
    const { container } = renderPane();

    expect(screen.getByRole("button", { name: "Телефон" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Компьютер" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(frame(container).style.width).toBe(`${PREVIEW_VIEWPORT.phone.width}px`);
  });

  // The frame renders at a real device width and is scaled up; rendering at the
  // on-screen width instead would give the page a viewport no phone has.
  it("renders the phone at a real phone viewport", () => {
    const { container } = renderPane();

    expect(frame(container).style.width).toBe("390px");
    expect(frame(container).style.transform).toMatch(/^scale\(/);
  });

  it("switches the frame to a real desktop viewport", async () => {
    const user = userEvent.setup();
    const { container } = renderPane();

    await user.click(screen.getByRole("button", { name: "Компьютер" }));

    expect(frame(container).style.width).toBe(`${PREVIEW_VIEWPORT.desktop.width}px`);
    expect(screen.getByRole("button", { name: "Компьютер" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("switches back to the phone viewport", async () => {
    const user = userEvent.setup();
    const { container } = renderPane();

    await user.click(screen.getByRole("button", { name: "Компьютер" }));
    await user.click(screen.getByRole("button", { name: "Телефон" }));

    expect(frame(container).style.width).toBe(`${PREVIEW_VIEWPORT.phone.width}px`);
  });

  it("hides the viewport switch where only a phone preview makes sense", () => {
    const { container } = renderPane({ phoneOnly: true });

    expect(screen.queryByRole("button", { name: "Компьютер" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Телефон" })).not.toBeInTheDocument();
    expect(frame(container).style.width).toBe(`${PREVIEW_VIEWPORT.phone.width}px`);
  });

  // Regression from round 1: the frame used to be told height:"100%" and rely on
  // the surrounding flex layout for real space, which collapsed it into a short
  // scrollable strip. Its height must always be its own pixel value.
  it("gives the frame a real pixel height, never a percentage from its surroundings", () => {
    const { container } = renderPane();

    const height = frame(container).style.height;
    expect(height).toMatch(/^\d+(\.\d+)?px$/);
    expect(height).not.toBe("100%");
    expect(parseFloat(height)).toBeGreaterThan(0);
  });

  it("reserves a box matching the frame's scaled size, so nothing is clipped", () => {
    const { container } = renderPane();

    const box = frame(container).parentElement as HTMLElement;
    expect(parseFloat(box.style.width)).toBeGreaterThan(0);
    expect(parseFloat(box.style.height)).toBeGreaterThan(0);
  });
});
