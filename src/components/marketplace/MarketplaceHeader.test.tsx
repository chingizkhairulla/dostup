import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/SimpleAuthContext", () => ({
  useSimpleAuth: () => ({
    status: "guest",
    sessionToken: null as string | null,
    profileType: null as string | null,
    user: null as { id: string } | null,
    profiles: [] as unknown[],
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
});
