// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider, useLocale } from "@/components/providers/locale-provider";
import { LanguageSelector } from "@/components/shared/language-selector";

function Probe() {
  const { locale, t, tv, systemLabel } = useLocale();
  return (
    <div>
      <p data-testid="locale">{locale}</p>
      <p data-testid="text">{t("missions.claim")}</p>
      <p data-testid="values">{t("planet.planet_number", { number: 3 })}</p>
      <p data-testid="fallback">{t("an untranslated sentence")}</p>
      <p data-testid="almanac">{tv("3 plants")}</p>
      <p data-testid="system">{systemLabel({ system: "Alpha · 2 species" })}</p>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("LocaleProvider", () => {
  it("throws when useLocale is used outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow("useLocale must be used inside LocaleProvider");
  });

  it("translates with a fixed Italian locale", () => {
    render(
      <LocaleProvider fixedLocale="it">
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("it");
    expect(screen.getByTestId("text")).toHaveTextContent("Prendi in carico");
    expect(screen.getByTestId("values")).toHaveTextContent("Pianeta 3");
    expect(screen.getByTestId("fallback")).toHaveTextContent("an untranslated sentence");
    expect(screen.getByTestId("almanac")).toHaveTextContent("3 piante");
    expect(screen.getByTestId("system")).toHaveTextContent("Alpha · 2 specie");
    expect(document.documentElement.lang).toBe("it");
  });

  it("translates with a fixed English locale", () => {
    render(
      <LocaleProvider fixedLocale="en">
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("text")).toHaveTextContent("Claim");
    expect(screen.getByTestId("values")).toHaveTextContent("Planet 3");
    expect(screen.getByTestId("almanac")).toHaveTextContent("3 plants");
    expect(document.documentElement.lang).toBe("en");
  });

  it("picks English from the browser languages when nothing is saved", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-GB", "it"]);
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
  });

  it("falls back to Italian for non-English browsers", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE", "it-IT"]);
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("it");
  });

  it("prefers the saved choice over the browser language", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
    window.localStorage.setItem("nms-alliance-locale", "it");
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("text")).toHaveTextContent("Prendi in carico");
  });

  it("ignores an invalid saved value", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
    window.localStorage.setItem("nms-alliance-locale", "fr");
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
  });

  it("switches locale through the language selector and remembers it", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["it-IT"]);
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <LanguageSelector />
        <Probe />
      </LocaleProvider>,
    );
    const select = screen.getByRole("combobox", { name: "Lingua / Language" });
    expect(select).toHaveValue("it");

    await user.selectOptions(select, "en");

    expect(screen.getByTestId("text")).toHaveTextContent("Claim");
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("en");
    expect(window.localStorage.getItem("nms-alliance-locale")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("follows locale changes made in another tab", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["it-IT"]);
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("it");
    window.localStorage.setItem("nms-alliance-locale", "en");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "nms-alliance-locale" }));
    });
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
  });
});
