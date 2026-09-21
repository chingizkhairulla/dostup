import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import ProductPreviewPane from "@/components/creator/ProductPreviewPane";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { PREVIEW_ROUTE, PREVIEW_VIEWPORT_HEIGHT, PREVIEW_VIEWPORT_WIDTH } from "@/lib/productPreview";
import type { Product } from "@/hooks/useProducts";

const product = { id: "preview", title: "SAT Preparation" } as unknown as Product;

function renderPane(props: Partial<{ phoneOnly: boolean }> = {}) {
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

  // AC 8: phone is always the starting viewport, whatever device the seller is on.
  it("opens on the phone viewport", () => {
    const { container } = renderPane();

    expect(screen.getByRole("button", { name: "Телефон" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Компьютер" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(frame(container).style.width).toBe(`${PREVIEW_VIEWPORT_WIDTH.phone}px`);
  });

  // Regression test: the frame used to be told height:"100%" and rely on the
  // surrounding flex layout to give it real space, which is exactly what
  // collapsed to a short scrollable strip in the reported bug. The frame must
  // now always carry its own explicit device height.
  it("gives the frame a real device height, never a percentage that depends on the surrounding layout", () => {
    const { container } = renderPane();

    expect(frame(container).style.height).toBe(`${PREVIEW_VIEWPORT_HEIGHT.phone}px`);
    expect(frame(container).style.height).not.toBe("100%");
  });

  it("reserves a matching box for the frame so it is not clipped by an ancestor", () => {
    const { container } = renderPane();

    const box = frame(container).parentElement as HTMLElement;
    expect(box.style.width).toBe(`${PREVIEW_VIEWPORT_WIDTH.phone}px`);
    expect(box.style.height).toBe(`${PREVIEW_VIEWPORT_HEIGHT.phone}px`);
  });

  // AC 7: the desktop viewport must be a genuinely wide viewport, which is what
  // makes the iframe (rather than a scaled div) the right mechanism.
  it("switches the frame to a real desktop viewport width", async () => {
    const user = userEvent.setup();
    const { container } = renderPane();

    await user.click(screen.getByRole("button", { name: "Компьютер" }));

    expect(frame(container).style.width).toBe(`${PREVIEW_VIEWPORT_WIDTH.desktop}px`);
    expect(frame(container).style.height).toBe(`${PREVIEW_VIEWPORT_HEIGHT.desktop}px`);
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

    expect(frame(container).style.width).toBe(`${PREVIEW_VIEWPORT_WIDTH.phone}px`);
  });

  it("hides the viewport switch where only a phone preview makes sense", () => {
    const { container } = renderPane({ phoneOnly: true });

    expect(screen.queryByRole("button", { name: "Компьютер" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Телефон" })).not.toBeInTheDocument();
    expect(frame(container).style.width).toBe(`${PREVIEW_VIEWPORT_WIDTH.phone}px`);
  });
});
