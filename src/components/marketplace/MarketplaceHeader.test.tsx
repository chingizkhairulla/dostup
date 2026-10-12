import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/SimpleAuthContext", () => ({
  useSimpleAuth: () => ({
    status: "guest",
    sessionToken: null,
    profileType: null,
    user: null,
    profiles: [],
    switchProfile: vi.fn(),
  }),
}));

import MarketplaceHeader from "@/components/marketplace/MarketplaceHeader";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { InstallPromptProvider } from "@/contexts/InstallPromptContext";

function renderHeader() {
  return render(
    <LanguageProvider>
      <InstallPromptProvider>
        <MemoryRouter>
          <MarketplaceHeader />
        </MemoryRouter>
      </InstallPromptProvider>
    </LanguageProvider>,
  );
}

describe("signed-out header", () => {
  it("shows RU / KK / EN before the sign-in button", () => {
    renderHeader();
    const toggle = screen.getByRole("group");
    const signIn = screen.getByRole("link", { name: /войти|кіру|sign in/i });

    expect(toggle).toHaveTextContent("RU/KK/EN");
    expect(toggle.compareDocumentPosition(signIn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // Customer request: the language toggle sat flush against "Войти" (the
  // header's 4px desktop gap). It moves a little left, leaving a small space.
  it("keeps a small space between the language toggle and sign-in", () => {
    renderHeader();
    expect(screen.getByRole("group").className).toMatch(/(^|\s)mr-3(\s|$)/);
  });
});

describe("hero headline spacing", () => {
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  // Customer request: more space between "Buy. Learn. Sell." — English only.
  it("widens word spacing for English", () => {
    expect(css).toMatch(/:lang\(en\)\s+\.hero-headline\s*\{[^}]*word-spacing:\s*0\.\d+em/);
  });

  it("leaves Russian and Kazakh headlines as they were", () => {
    const rules = [...css.matchAll(/([^{}]*\.hero-headline[^{}]*)\{([^}]*)\}/g)];
    const widened = rules.filter(([, , body]) => /word-spacing/.test(body)).map(([, sel]) => sel.trim());
    expect(widened).toEqual([":lang(en) .hero-headline"]);
  });
});
