import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sessionApi", () => ({
  studentCreds: () => ({}),
  invokeApi: vi.fn().mockResolvedValue({ prefs: null }),
}));

import { LanguageProvider } from "@/contexts/LanguageContext";
import NotFound from "@/pages/NotFound";
import NotificationPreferences from "@/components/NotificationPreferences";
import SlotCreationWizard from "@/components/schedule/SlotCreationWizard";

// Three screens kept their texts in a table keyed { ru, kk } and read it with
// `table[language]`. With English selected that is `undefined`, and the first
// `t.title` threw — the page did not show Russian, it did not render at all.
// Nothing caught it: the project compiles without `strict`, so indexing by a
// language the table lacks is not a type error.

function inEnglish(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LanguageProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe("screens that used to crash in English", () => {
  beforeEach(() => {
    localStorage.setItem("language", "en");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shows the 404 page", () => {
    inEnglish(<NotFound />);
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go back/i })).toBeInTheDocument();
  });

  it("shows the lesson reminder settings", async () => {
    inEnglish(<NotificationPreferences userId="user-1" />);
    expect(await screen.findByText("Lesson reminder settings")).toBeInTheDocument();
    expect(screen.getByText("24 hours before the lesson")).toBeInTheDocument();
  });

  it("opens the slot wizard", () => {
    inEnglish(<SlotCreationWizard open onOpenChange={() => {}} language="en" onCreateSlots={() => {}} />);
    expect(screen.getAllByText("Choose time").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mon").length).toBeGreaterThan(0);
  });
});
