import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The customer asked for two settings sections to be renamed: the install
// section to "Скачать приложение" and the notifications one to "Уведомления".
// Both labels are shared with the moderator dialog, so they live in
// translations and are asserted there as well as on screen.

vi.mock("@/components/account/BioSettingsCard", () => ({
  default: () => <div data-testid="bio-settings-card" />,
}));

vi.mock("@/contexts/SimpleAuthContext", () => ({
  useSimpleAuth: () => ({
    logout: vi.fn(),
    profileType: null as string | null,
    profiles: [] as unknown[],
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
import { translations } from "@/lib/translations";

function renderSettings() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <MemoryRouter>
          <AccountSettingsView role="buyer" displayName="Алдияр" />
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("the renamed settings sections", () => {
  it("names the install section «Скачать приложение», not «Приложение»", () => {
    expect(translations.ru.appSettings).toBe("Скачать приложение");
    expect(translations.kk.appSettings).toBe("Қолданбаны жүктеп алу");
  });

  it("names the notifications section «Уведомления», not «Настройки уведомлений»", () => {
    expect(translations.ru.notificationSettings).toBe("Уведомления");
    expect(translations.kk.notificationSettings).toBe("Хабарландырулар");
  });

  it("shows both new names in the settings list", () => {
    renderSettings();

    expect(screen.getAllByText("Скачать приложение").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Уведомления").length).toBeGreaterThan(0);
    expect(screen.queryByText("Настройки уведомлений")).not.toBeInTheDocument();
  });

  it("shows the Kazakh names when the language is Kazakh", () => {
    localStorage.setItem("language", "kk");
    renderSettings();

    expect(screen.getAllByText("Қолданбаны жүктеп алу").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Хабарландырулар").length).toBeGreaterThan(0);
  });
});

describe("settings search still reaches the renamed sections", () => {
  it("finds the install section by «скачать»", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.type(screen.getByPlaceholderText(translations.ru.searchSettings), "скачать");

    expect(screen.getAllByText("Скачать приложение").length).toBeGreaterThan(0);
    // The other sections drop out of the list. (The open section's own pane
    // keeps rendering on the right, so this checks a section that is only ever
    // drawn in the list.)
    expect(screen.queryByText("Уведомления")).not.toBeInTheDocument();
  });

  it("finds the notifications section by «уведомл»", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.type(screen.getByPlaceholderText(translations.ru.searchSettings), "уведомл");

    expect(screen.getAllByText("Уведомления").length).toBeGreaterThan(0);
    expect(screen.queryByText("Скачать приложение")).not.toBeInTheDocument();
  });
});
