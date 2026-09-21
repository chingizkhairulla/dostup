import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// The description card itself is covered by BioSettingsCard.test.tsx; here we
// only care about which roles are offered it.
vi.mock("@/components/account/BioSettingsCard", () => ({
  default: () => <div data-testid="bio-settings-card" />,
}));

vi.mock("@/contexts/SimpleAuthContext", () => ({
  useSimpleAuth: () => ({
    logout: vi.fn(),
    profileType: null,
    profiles: [],
    switchProfile: vi.fn(),
    setProfileName: vi.fn(),
    applySession: vi.fn(),
    removeProfile: vi.fn(),
    status: "authenticated",
    sessionToken: "token",
    user: { id: "user-1" },
  }),
}));

vi.mock("@/hooks/usePWADetection", () => ({ usePWADetection: () => false }));
vi.mock("@/lib/sessionApi", () => ({
  invokeApi: vi.fn().mockResolvedValue({}),
  creatorCreds: () => ({}),
}));

import { AccountSettingsView } from "@/components/account/AccountSettingsView";
import { LanguageProvider } from "@/contexts/LanguageContext";

function renderSettings(role: "buyer" | "creator" | "school" | "teacher") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <MemoryRouter>
          <AccountSettingsView role={role} displayName="SAT Academy" />
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe("public description in account settings", () => {
  it("is offered to an individual creator", () => {
    renderSettings("creator");

    expect(screen.getByTestId("bio-settings-card")).toBeInTheDocument();
  });

  // AC 33: an online school is a separate seller profile type and must get the
  // same capability, without a second implementation.
  it("is offered to an online school", () => {
    renderSettings("school");

    expect(screen.getByTestId("bio-settings-card")).toBeInTheDocument();
  });

  it("is not offered to a buyer", () => {
    renderSettings("buyer");

    expect(screen.queryByTestId("bio-settings-card")).not.toBeInTheDocument();
  });

  it("is not offered to a teacher", () => {
    renderSettings("teacher");

    expect(screen.queryByTestId("bio-settings-card")).not.toBeInTheDocument();
  });
});
