import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import BackButton from "@/components/marketplace/BackButton";
import { LanguageProvider } from "@/contexts/LanguageContext";

const Where = () => <output data-testid="where">{useLocation().pathname}</output>;

function renderAt(entries: string[]) {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route path="*" element={<><BackButton /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

describe("BackButton", () => {
  it("returns to the storefront the product was opened from", async () => {
    renderAt(["/", "/s/sat-academy", "/p/sat"]);

    await userEvent.click(screen.getByRole("button", { name: "Назад" }));

    expect(screen.getByTestId("where")).toHaveTextContent("/s/sat-academy");
  });

  it("returns to the product the storefront was opened from", async () => {
    renderAt(["/", "/p/sat", "/s/sat-academy"]);

    await userEvent.click(screen.getByRole("button", { name: "Назад" }));

    expect(screen.getByTestId("where")).toHaveTextContent("/p/sat");
  });

  it("returns to the marketplace the product was opened from", async () => {
    renderAt(["/", "/p/sat"]);

    await userEvent.click(screen.getByRole("button", { name: "Назад" }));

    expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/);
  });

  // A shared link or a new tab: nothing in the app to go back to, so going
  // "back" must not leave the site.
  it("goes to the marketplace when the page was opened directly", async () => {
    renderAt(["/p/sat"]);

    await userEvent.click(screen.getByRole("button", { name: "Назад" }));

    expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/);
  });
});
