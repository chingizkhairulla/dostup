import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import PublicLocaleToggle from "@/components/marketplace/PublicLocaleToggle";
import { translations } from "@/lib/translations";

beforeEach(() => {
  localStorage.clear();
});

function Probe() {
  const { language, t, l } = useLanguage();
  return (
    <div>
      <span data-testid="language">{language}</span>
      <span data-testid="t">{t("settings")}</span>
      <span data-testid="l">{l({ ru: "Расписание", kk: "Кесте", en: "Schedule" })}</span>
      <span data-testid="params">{t("sellerJoinedYear", { year: 2024 })}</span>
    </div>
  );
}

function renderWithLanguage(node: React.ReactNode) {
  return render(<LanguageProvider>{node}</LanguageProvider>);
}

describe("which language the app starts in", () => {
  it("is Russian when nothing is stored", () => {
    renderWithLanguage(<Probe />);

    expect(screen.getByTestId("language")).toHaveTextContent("ru");
  });

  it("is whatever was stored, when that is a language we speak", () => {
    localStorage.setItem("language", "en");
    renderWithLanguage(<Probe />);

    expect(screen.getByTestId("language")).toHaveTextContent("en");
  });

  it("falls back to Russian for a stored value we do not recognise", () => {
    // An old build, a hand-edited value, a half-written migration: none of
    // these may index the dictionaries with undefined.
    localStorage.setItem("language", "de");
    renderWithLanguage(<Probe />);

    expect(screen.getByTestId("language")).toHaveTextContent("ru");
    expect(screen.getByTestId("t")).toHaveTextContent(translations.ru.settings);
  });
});

describe("the two ways to reach a phrase", () => {
  it("t() reads the dictionaries and fills placeholders", () => {
    localStorage.setItem("language", "en");
    renderWithLanguage(<Probe />);

    expect(screen.getByTestId("t")).toHaveTextContent("Settings");
    expect(screen.getByTestId("params")).toHaveTextContent("On the platform since 2024");
  });

  it("l() gives English readers English, not Kazakh", () => {
    localStorage.setItem("language", "en");
    renderWithLanguage(<Probe />);

    expect(screen.getByTestId("l")).toHaveTextContent("Schedule");
  });

  it("l() still serves Russian and Kazakh correctly", () => {
    localStorage.setItem("language", "kk");
    renderWithLanguage(<Probe />);

    expect(screen.getByTestId("l")).toHaveTextContent("Кесте");
  });
});

describe("the settings language switcher", () => {
  it("offers all three, with English after Kazakh", () => {
    renderWithLanguage(<LanguageSwitcher />);

    const buttons = screen.getAllByRole("button").map((button) => button.textContent);
    expect(buttons).toEqual(["Русский", "Қазақша", "English"]);
  });

  it("switches the interface to English and remembers it", async () => {
    const user = userEvent.setup();
    renderWithLanguage(
      <>
        <LanguageSwitcher />
        <Probe />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByTestId("language")).toHaveTextContent("en");
    expect(screen.getByTestId("t")).toHaveTextContent("Settings");
    expect(localStorage.getItem("language")).toBe("en");
  });
});

describe("the header toggle a signed-out visitor sees", () => {
  it("shows RU / KK / EN", () => {
    renderWithLanguage(<PublicLocaleToggle />);

    const buttons = screen.getAllByRole("button").map((button) => button.textContent);
    expect(buttons).toEqual(["RU", "KK", "EN"]);
  });

  it("switches to English when EN is pressed", async () => {
    const user = userEvent.setup();
    renderWithLanguage(
      <>
        <PublicLocaleToggle />
        <Probe />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "EN" }));

    expect(screen.getByTestId("language")).toHaveTextContent("en");
    expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "RU" })).toHaveAttribute("aria-pressed", "false");
  });
});
