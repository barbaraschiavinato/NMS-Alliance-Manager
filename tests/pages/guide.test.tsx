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
  it("documents archive and restore with their actual icons in the general buttons table", async () => {
    mockFetch({});
    const { container } = renderPage(await GuideContent({ alliance: defaultAlliance, standalone: false }));
    const generalButtons = container.querySelector("#pulsanti-comuni")!;
    for (const [label, icon] of [
      ["Archivia", ".lucide-archive"],
      ["Togli dall'archivio", ".lucide-archive-restore"],
    ]) {
      const row = within(generalButtons as HTMLElement)
        .getByText(label)
        .closest("tr")!;
      expect(row.querySelector(icon)).toBeInTheDocument();
      expect(row.textContent).toContain("moderatori e gli amministratori");
    }
  });
  it("lists station and mission detail links with their shared icon, distinct colors and every specialty", async () => {
    mockFetch({});
    const { container } = renderPage(await GuideContent({ alliance: defaultAlliance, standalone: false }));
    const legend = container.querySelector("#legenda")!;
    for (const [label, color] of [
      ["Apri scheda stazione", "#6cb4ff"],
      ["Apri scheda missione", "#72d1c4"],
    ]) {
      const row = within(legend as HTMLElement)
        .getByText(label)
        .closest("tr")!;
      expect(row.querySelector(".guide-icon")).toHaveStyle({ color });
      expect(row.querySelector(".lucide-external-link")).toBeInTheDocument();
      for (const specialty of ["Ranger", "Esploratore", "Costruttore"]) {
        expect(within(row).getByLabelText(specialty)).toBeInTheDocument();
      }
    }
  });
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

  it("uses explorer and builder tasks in the matching third-method examples", async () => {
    mockFetch({});
    const { container } = renderPage(await GuideContent({ alliance: defaultAlliance, standalone: false }));

    const thirdMethods = [...container.querySelectorAll(".guide-station-instructions")].filter((paragraph) =>
      paragraph.textContent?.includes("Terzo metodo"),
    );
    expect(thirdMethods).toHaveLength(2);
    const explorerExample = thirdMethods[0].closest("li");
    const builderExample = thirdMethods[1].closest("li");
    expect(explorerExample).not.toBeNull();
    expect(builderExample).not.toBeNull();

    const mapped = t("system.mapped", undefined, "it");
    const stationClaimed = t("system.station_claimed", undefined, "it");
    const buildingsBuilt = t("system.buildings_built", undefined, "it");
    expect(within(explorerExample as HTMLElement).getByRole("checkbox", { name: mapped })).toBeInTheDocument();
    expect(
      within(explorerExample as HTMLElement)
        .getByRole("checkbox", { name: mapped })
        .closest("label"),
    ).toHaveClass("mission-system-progress-item-pulse");
    expect(
      within(explorerExample as HTMLElement).queryByRole("checkbox", { name: stationClaimed }),
    ).not.toBeInTheDocument();

    expect(within(builderExample as HTMLElement).getByRole("checkbox", { name: buildingsBuilt })).toBeInTheDocument();
    expect(
      within(builderExample as HTMLElement)
        .getByRole("checkbox", { name: buildingsBuilt })
        .closest("label"),
    ).toHaveClass("mission-system-progress-item-pulse");
    expect(
      within(builderExample as HTMLElement).queryByRole("checkbox", { name: stationClaimed }),
    ).not.toBeInTheDocument();
  });

  it("explains the fourth method with the station link and mission creation icon", async () => {
    mockFetch({});
    const { container } = renderPage(await GuideContent({ alliance: defaultAlliance, standalone: false }));

    const fourthMethods = [...container.querySelectorAll(".guide-numbered-list-spaced")].filter((item) =>
      item.textContent?.includes("Quarto metodo"),
    );
    expect(fourthMethods).toHaveLength(2);

    for (const method of fourthMethods) {
      expect(method.textContent).toContain("missione disponibile per la tua specializzazione");
      expect(method.textContent).toContain("puoi crearti una missione.");
      expect(method.querySelector('[aria-label="Crea una missione"]')).not.toBeNull();
      expect(method.textContent).not.toContain("ti verrà assegnata automaticamente");
    }
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
