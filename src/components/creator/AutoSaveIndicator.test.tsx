import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AutoSaveIndicator from "@/components/creator/AutoSaveIndicator";
import { LanguageProvider } from "@/contexts/LanguageContext";

const renderIndicator = (status: Parameters<typeof AutoSaveIndicator>[0]["status"]) =>
  render(
    <LanguageProvider>
      <AutoSaveIndicator status={status} />
    </LanguageProvider>,
  );

describe("AutoSaveIndicator", () => {
  it("shows nothing when there is nothing to report", () => {
    const { container } = renderIndicator("idle");
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["saving", "Сохранение…"],
    ["saved", "Сохранено"],
    ["error", "Не удалось сохранить"],
  ] as const)("%s is announced as %s", (status, label) => {
    renderIndicator(status);
    expect(screen.getByRole("status", { name: label })).toBeInTheDocument();
  });

  // Customer rule: fewer words is better, so the state is a bare icon.
  it.each(["saving", "saved", "error"] as const)("%s shows an icon and no visible words", (status) => {
    const { container } = renderIndicator(status);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toBe("");
  });
});
