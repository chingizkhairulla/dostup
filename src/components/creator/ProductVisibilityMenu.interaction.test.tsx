import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ProductVisibilityMenu, {
  type VisibilityState,
} from "@/components/creator/ProductVisibilityMenu";
import { LanguageProvider } from "@/contexts/LanguageContext";

function renderMenu(state: VisibilityState) {
  const onSelect = vi.fn();
  render(
    <LanguageProvider>
      <ProductVisibilityMenu state={state} onSelect={onSelect} />
    </LanguageProvider>,
  );
  return { onSelect };
}

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Видимость/ }));
  return user;
}

describe("ProductVisibilityMenu", () => {
  it("replaces the old preview button with a single visibility control", () => {
    renderMenu("published");

    expect(screen.getByRole("button", { name: /Видимость/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Предпросмотр/ })).not.toBeInTheDocument();
  });

  // One control covering both underlying flags, rather than two competing systems.
  it("offers all three states in one menu", async () => {
    renderMenu("published");
    await openMenu();

    expect(await screen.findByRole("menuitem", { name: /Приватный/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Опубликован/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Приостановлен/ })).toBeInTheDocument();
  });

  // Customer rule: as simple as possible — fewer words is better. Each state is
  // just its one-word label, with no explanatory sentence under it.
  it("lists each state by its label only, with no explanatory text", async () => {
    renderMenu("published");
    await openMenu();

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent?.trim())).toEqual([
      "Приватный",
      "Опубликован",
      "Приостановлен",
    ]);
  });

  it("publishes a private product", async () => {
    const { onSelect } = renderMenu("private");
    const user = await openMenu();

    await user.click(await screen.findByRole("menuitem", { name: /Опубликован/ }));

    expect(onSelect).toHaveBeenCalledWith("published");
  });

  it("takes a published product private", async () => {
    const { onSelect } = renderMenu("published");
    const user = await openMenu();

    await user.click(await screen.findByRole("menuitem", { name: /Приватный/ }));

    expect(onSelect).toHaveBeenCalledWith("private");
  });

  it("pauses a published product", async () => {
    const { onSelect } = renderMenu("published");
    const user = await openMenu();

    await user.click(await screen.findByRole("menuitem", { name: /Приостановлен/ }));

    expect(onSelect).toHaveBeenCalledWith("paused");
  });

  it("does not fire a pointless update when the current state is re-selected", async () => {
    const { onSelect } = renderMenu("published");
    const user = await openMenu();

    await user.click(await screen.findByRole("menuitem", { name: /Опубликован/ }));

    expect(onSelect).not.toHaveBeenCalled();
  });
});
