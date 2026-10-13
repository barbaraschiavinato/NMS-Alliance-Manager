// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GuideRoute from "@/app/guide/page";
import { GuideContent } from "@/components/guide/guide-content";
import { AddressValidationExample } from "@/components/guide/address-validation-example";
import { PlanetFiltersExample } from "@/components/guide/planet-filters-example";
import { createPlanetListExamplePlanet } from "@/components/guide/planet-list-example";
import { PlanetListExampleView } from "@/components/guide/planet-list-example-view";
import { guideStationInit } from "@/components/guide/station-init";
import { emptyPlanetFilterValues } from "@/components/forms/planet-filters";
import { defaultAlliance } from "../helpers/members";
import { mockFetch, renderPage, t } from "./helpers";

vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("@/lib/nms-core/system.js", async () => (await import("./helpers")).nmsCoreModule);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("guide page", () => {
  it("renders the Italian guide with its live examples", async () => {
    mockFetch({});
    const route = GuideRoute();
    expect(route.type).toBe(GuideContent);
    // GuideContent is an async server component: render the element it resolves to.
    // Il layout fornisce il LocaleProvider esterno, necessario all'Hero.
    renderPage(await GuideContent());

    expect(screen.getByRole("heading", { level: 1, name: /^Guid[ae]\.?$/ })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Indice della guida" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Unisciti a noi/ })).toHaveAttribute("href", "/");
    expect(screen.getAllByRole("heading", { name: "Esempi di card" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("article").length).toBeGreaterThan(5);
  });
});

describe("guide content inside the app", () => {
  it("drops the hero and uses the in-app layout when not standalone", async () => {
    mockFetch({});
    const { container } = renderPage(await GuideContent({ alliance: defaultAlliance, standalone: false }));

    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Unisciti a noi/ })).not.toBeInTheDocument();
    expect(container.querySelector(".guide-root")).toHaveClass("guide-root-in-app");
    expect(screen.getByRole("main")).toHaveClass("content-wrap", "guide-page");
  });
});

describe("guide examples", () => {
  it("toggles the planet filters example and resets the preset filters", async () => {
    const { user } = renderPage(
      <PlanetFiltersExample initialFilters={{ ...emptyPlanetFilterValues, dissonant: "yes" }} />,
    );

    const toggle = screen.getByRole("button", { name: t("planet.filters") });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: t("planet.reset_filters") }));
    expect(screen.queryByRole("button", { name: t("planet.reset_filters") })).not.toBeInTheDocument();
  });

  it("shows every portal validation step", () => {
    renderPage(<AddressValidationExample sample={guideStationInit} />);

    expect(screen.getAllByRole("figure")).toHaveLength(7);
    expect(screen.getByText(/Planet index 7: allowed range is 0–6\./)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(t("planet.checking_nms_almanac")))).toBeInTheDocument();
  });

  it("closes and reopens the inline planet card", async () => {
    const planet = await createPlanetListExamplePlanet();
    const { user } = renderPage(<PlanetListExampleView planet={planet} planetData={guideStationInit.response} />);

    expect(screen.getAllByRole("button", { name: new RegExp(planet.almanacName ?? "") }).length).toBeGreaterThan(0);
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: t("planet.close_planet_details") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mostra di nuovo la scheda pianeta" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
