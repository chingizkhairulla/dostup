import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeApi = vi.fn();
vi.mock("@/lib/sessionApi", () => ({
  invokeApi: (...args: unknown[]) => invokeApi(...args),
  creatorCreds: () => ({}),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

import BioSettingsCard from "@/components/account/BioSettingsCard";
import { LanguageProvider } from "@/contexts/LanguageContext";

function renderCard() {
  return render(
    <LanguageProvider>
      <BioSettingsCard />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  invokeApi.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  invokeApi.mockResolvedValue({ bio: "" });
});

describe("BioSettingsCard", () => {
  // AC 32: the seller must be told the description is public.
  // Round 3: the note must be noticeable and sit at the top, above the field.
  it("says, at the top and clearly, that everything here is visible to buyers", async () => {
    renderCard();

    const note = screen.getByTestId("bio-public-note");
    expect(note).toHaveTextContent("Всё, что вы напишете здесь, увидят покупатели на вашей витрине.");
    expect(note).toHaveClass("text-sm");
    expect(note).not.toHaveClass("text-xs");
    expect(note.compareDocumentPosition(screen.getByRole("textbox")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("loads the saved description", async () => {
    invokeApi.mockResolvedValue({ bio: "Мы готовим к SAT" });
    renderCard();

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("Мы готовим к SAT");
    });
  });

  it("shows a character counter against the limit", async () => {
    invokeApi.mockResolvedValue({ bio: "abc" });
    renderCard();

    await waitFor(() => {
      expect(screen.getByText("3 / 500")).toBeInTheDocument();
    });
  });

  it("refuses to accept more than the limit", async () => {
    const user = userEvent.setup();
    renderCard();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());

    const textbox = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.click(textbox);
    await user.paste("x".repeat(600));

    expect(textbox.value).toHaveLength(500);
    expect(screen.getByText("500 / 500")).toBeInTheDocument();
  });

  // AC 31: the seller can change their public description.
  it("saves the description through the profile endpoint", async () => {
    const user = userEvent.setup();
    renderCard();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());

    await user.type(screen.getByRole("textbox"), "Готовим к SAT");
    await user.click(screen.getByRole("button", { name: /Сохранить|Save/ }));

    await waitFor(() => {
      expect(invokeApi).toHaveBeenCalledWith(
        "manage-profile",
        expect.objectContaining({ action: "set_bio", bio: "Готовим к SAT" }),
      );
    });
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("keeps the save button disabled until something actually changes", async () => {
    invokeApi.mockResolvedValue({ bio: "Готовим к SAT" });
    const user = userEvent.setup();
    renderCard();

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("Готовим к SAT");
    });
    const save = screen.getByRole("button", { name: /Сохранить|Save/ });
    expect(save).toBeDisabled();

    await user.type(screen.getByRole("textbox"), "!");
    expect(save).toBeEnabled();
  });

  it("reports a failed save instead of pretending it worked", async () => {
    const user = userEvent.setup();
    renderCard();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());

    await user.type(screen.getByRole("textbox"), "Готовим");
    invokeApi.mockRejectedValueOnce(new Error("bio_too_long"));
    await user.click(screen.getByRole("button", { name: /Сохранить|Save/ }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
