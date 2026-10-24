// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddStationButtonExample } from "@/components/guide/add-station-button-example";
import { MessageTabsExample } from "@/components/guide/message-tabs-example";
import { MessageComposerExamples } from "@/components/guide/message-composer-examples";
import { TaxiExamples } from "@/components/guide/taxi-examples";
import {
  BuilderMissionProgressExamples,
  ExplorerMissionExamples,
  ExplorerMissionProgressExamples,
} from "@/components/guide/mission-examples";
import { MissionTabsExample } from "@/components/guide/mission-tabs-example";
import { PlanetFiltersExample } from "@/components/guide/planet-filters-example";
import { createPlanetListExamplePlanet } from "@/components/guide/planet-list-example";
import { PlanetListExampleView } from "@/components/guide/planet-list-example-view";
import {
  BuilderOwnStationExample,
  ExplorerOwnStationExample,
  RangerOwnStationExample,
  RangerStationExamples,
} from "@/components/guide/station-examples";
import { StationFormExample } from "@/components/guide/station-form-example";
import { guideStationInit } from "@/components/guide/station-init";
import { StationTabsExample } from "@/components/guide/station-tabs-example";
import { renderWithLocale, tr } from "../helpers";

vi.mock("next/image", async () => (await import("../helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("../helpers")).nextLinkModule);
vi.mock("@/lib/nms-core/system.js", () => ({
  systemAttributes: () => ({ star_type: 0 }),
  planetSeeds: () => ({ planet_seeds: [1, 2], planet_count: 2, moon_count: 0 }),
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ note: "" }))),
  );
});

function selectedTabs() {
  return screen
    .getAllByRole("tab")
    .filter((tab) => tab.getAttribute("aria-selected") === "true")
    .map((tab) => tab.textContent);
}

describe("guide tab and button examples", () => {
  it("illustrates the taxi button, request and read-only member profile with a highlighted friend code", () => {
    const { container } = renderWithLocale(<TaxiExamples />, { locale: "it" });
    expect(screen.getByRole("button", { name: "Richiedi un taxi" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Taxi verso Eissentam" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alleato NMS" })).toHaveClass("member-profile-link");
    const responder = screen.getByRole("button", { name: "Pilota NMS" });
    expect(responder).toHaveClass("member-profile-link");
    expect(responder.closest(".message-thread-children")).not.toBeNull();
    expect(screen.getByText(/clicca sul nome del mittente o di chi ha risposto/)).toBeInTheDocument();
    const code = screen.getByText("ABCD-EFGH-JKLMN");
    expect(code.parentElement).toHaveClass("guide-friend-code-highlight");
    expect(screen.queryByRole("button", { name: "Lascia un messaggio" })).not.toBeInTheDocument();
    expect(container.querySelector(".messages-list")).toHaveAttribute("inert");
    const form = screen.getByText("Modulo per richiedere un taxi").closest("figure")!;
    expect(within(form).getByDisplayValue("10 · Eissentam")).toHaveAttribute("readonly");
    expect(within(form).getByDisplayValue("Hub dell'alleanza · Euclide · 0123456789AB")).toHaveAttribute("readonly");
    expect(within(form).getByRole("checkbox")).toBeChecked();
    expect(within(form).getByRole("button", { name: "Invia richiesta" })).toBeInTheDocument();
    expect(form.querySelector(".guide-taxi-form-example")).toHaveAttribute("inert");
    const figures = Array.from(container.querySelectorAll("figure"));
    expect(figures[1]).toBe(form);
    expect(figures[2].textContent).toContain("Richiesta taxi e risposta");
  });
  it("shows member profile details and a formatted friend code in the guide", () => {
    renderWithLocale(<MessageComposerExamples />);
    const profile = screen.getByText("Profilo del membro").closest("figure")!;
    expect(within(profile).getByText("Esploratore")).toBeInTheDocument();
    expect(within(profile).getByText("PC, PlayStation")).toBeInTheDocument();
    expect(within(profile).getByText("ABCD-EFGH-JKLMN")).toBeInTheDocument();
    expect(profile.querySelector(".member-card-dialog")).toHaveAttribute("inert");
  });

  it("renders an add-station button that does nothing", () => {
    const { container } = renderWithLocale(<AddStationButtonExample />);
    const button = screen.getByRole("button", { name: tr("stations.add_station") });
    expect(button).toHaveClass("station-header-add-pulse");
    const before = container.innerHTML;
    fireEvent.click(button);
    expect(container.innerHTML).toBe(before);
    expect(container.firstElementChild).toHaveAttribute("inert");
  });

  it("keeps the received messages tab selected when another is clicked", () => {
    renderWithLocale(<MessageTabsExample />);
    expect(screen.getByRole("tablist", { name: "Messaggi" })).toBeInTheDocument();
    expect(selectedTabs()).toEqual(["Ricevuti3"]);
    fireEvent.click(screen.getByRole("tab", { name: "Inviati2" }));
    expect(selectedTabs()).toEqual(["Ricevuti3"]);
  });

  it("keeps the all missions tab selected when another is clicked", () => {
    renderWithLocale(<MissionTabsExample />);
    expect(selectedTabs()).toEqual([`${tr("common.all")}9`]);
    fireEvent.click(screen.getByRole("tab", { name: `${tr("missions.status_completed")}2` }));
    expect(selectedTabs()).toEqual([`${tr("common.all")}9`]);
  });

  it("selects the requested station tab and ignores clicks", () => {
    renderWithLocale(<StationTabsExample selectedKey="mine" />);
    expect(selectedTabs()).toEqual([`${tr("stations.my_stations")}3`]);
    fireEvent.click(screen.getByRole("tab", { name: `${tr("stations.filter_all")}12` }));
    expect(selectedTabs()).toEqual([`${tr("stations.my_stations")}3`]);
  });
});

describe("PlanetFiltersExample", () => {
  it("applies a filter as a removable tag and ignores search input", async () => {
    const { user } = renderWithLocale(<PlanetFiltersExample initiallyOpen />);
    expect(screen.queryByRole("button", { name: tr("planet.reset_filters") })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: tr("planet.filter_dissonant") }), "yes");
    const tag = `${tr("planet.dissonant")}: ${tr("planet.dissonant_yes")}`;
    expect(screen.getByText(tag)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: tr("planet.filters") })).toHaveAttribute("data-active", "true");

    const search = screen.getByRole("searchbox", { name: tr("planet.search_almanac_values") });
    await user.type(search, "lush");
    expect(search).toHaveValue("");

    await user.click(screen.getByRole("button", { name: `${tr("planet.remove_filter")}: ${tag}` }));
    expect(screen.queryByText(tag)).not.toBeInTheDocument();
  });
});

describe("mission examples", () => {
  it.each([
    [
      "explorer",
      ExplorerMissionProgressExamples,
      "Mapped",
      ["Planets classified", "Data uploaded"],
      ["Station claimed", "System renamed"],
    ],
    [
      "builder",
      BuilderMissionProgressExamples,
      "Buildings built",
      ["Bases uploaded"],
      ["Station claimed", "System renamed"],
    ],
  ] as const)(
    "pulses only the %s tasks in the progress examples",
    (_specialty, Example, checkedTask, pulsingTasks, rangerTasks) => {
      renderWithLocale(<Example sample={guideStationInit} />);
      const taskExample = screen.getByText("Spunta i task").closest("figure");
      expect(taskExample).not.toBeNull();
      expect(within(taskExample as HTMLElement).getByRole("checkbox", { name: checkedTask })).toBeChecked();
      expect(
        within(taskExample as HTMLElement)
          .getByRole("checkbox", { name: checkedTask })
          .closest("label"),
      ).not.toHaveClass("mission-system-progress-item-pulse");
      for (const taskLabel of pulsingTasks) {
        expect(
          within(taskExample as HTMLElement)
            .getByRole("checkbox", { name: taskLabel })
            .closest("label"),
        ).toHaveClass("mission-system-progress-item-pulse");
      }
      for (const taskLabel of rangerTasks) {
        expect(within(taskExample as HTMLElement).queryByRole("checkbox", { name: taskLabel })).toBeNull();
      }
    },
  );

  it("falls back to the portal as title and the default thumbnail without Almanac name and image", () => {
    const { container } = renderWithLocale(
      <ExplorerMissionExamples sample={{ portal: guideStationInit.portal, galaxy: 0, response: {} }} />,
    );
    expect(
      screen.getAllByRole("button", { name: `${tr("planet.open_planet_details_for")} ${guideStationInit.portal}` }),
    ).toHaveLength(5);
    expect(container.querySelector(".mission-card-planet-thumb img")).toBeNull();
  });

  it("uses the Almanac name and image, with inert actions", async () => {
    const { container } = renderWithLocale(<ExplorerMissionExamples sample={guideStationInit} />);
    const name = guideStationInit.response.name;
    expect(screen.getAllByRole("button", { name: `${tr("planet.open_planet_details_for")} ${name}` })).toHaveLength(5);
    expect(container.querySelector(".mission-card-planet-thumb img")).toHaveAttribute(
      "src",
      `https://nmsalmanac.com/api${guideStationInit.response.pictures.disc}`,
    );

    const claim = screen.getByRole("button", { name: tr("missions.claim") });
    fireEvent.click(claim);
    expect(screen.getByRole("button", { name: tr("missions.claim") })).toBeInTheDocument();

    const [slider] = screen.getAllByRole("slider");
    fireEvent.change(slider, { target: { value: "60" } });
    fireEvent.keyUp(slider);
    await waitFor(() => expect(slider).toHaveValue("60"));
    expect(within(slider.parentElement as HTMLElement).getByText("60%")).toBeInTheDocument();
  });
});

describe("station examples", () => {
  it.each([
    ["explorer", ExplorerOwnStationExample, ["Mapped", "Planets classified", "Data uploaded"], "Station claimed"],
    ["builder", BuilderOwnStationExample, ["Buildings built", "Bases uploaded"], "Station claimed"],
  ] as const)("shows only %s tasks on its own-station example", (_specialty, Example, taskLabels, rangerTask) => {
    renderWithLocale(<Example sample={guideStationInit} />);
    for (const taskLabel of taskLabels) {
      expect(screen.getByRole("checkbox", { name: taskLabel })).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: taskLabel }).closest("label")).toHaveClass(
        "mission-system-progress-item-pulse",
      );
    }
    expect(screen.queryByRole("checkbox", { name: rangerTask })).not.toBeInTheDocument();
  });

  it("keeps the ranger's own-station example on ranger tasks", () => {
    renderWithLocale(<RangerOwnStationExample sample={guideStationInit} />);
    expect(screen.getByRole("checkbox", { name: "Station claimed" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "System renamed" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Mapped" })).not.toBeInTheDocument();
  });

  it("renders inert station cards", () => {
    renderWithLocale(<RangerStationExamples sample={guideStationInit} />);
    const cards = screen.getAllByRole("listitem");
    expect(cards.length).toBeGreaterThan(1);
    const before = cards[0].innerHTML;
    for (const button of within(cards[0]).getAllByRole("button")) fireEvent.click(button);
    expect(cards[0].innerHTML).toBe(before);
  });
});

describe("StationFormExample", () => {
  it("proposes the Almanac name as station name", () => {
    renderWithLocale(<StationFormExample sample={guideStationInit} />);
    expect(screen.getByDisplayValue(`${guideStationInit.response.name} System`)).toBeInTheDocument();
  });

  it("leaves only the suffix without an Almanac name", () => {
    const { container } = renderWithLocale(
      <StationFormExample sample={{ portal: guideStationInit.portal, galaxy: 0, response: {} }} />,
    );
    expect(container.querySelector(".station-name-field input")).toHaveValue(" System");
  });
});

describe("PlanetListExampleView", () => {
  it("keeps the inline card open when an example card is clicked", async () => {
    const planet = await createPlanetListExamplePlanet();
    const { container } = renderWithLocale(
      <PlanetListExampleView planet={planet} planetData={guideStationInit.response} />,
    );
    const cards = container.querySelectorAll(".planet-mission-card");
    expect(cards).toHaveLength(3);
    for (const card of cards) fireEvent.click(card);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it.each([
    ["the planet title", { title: "Custom title" }, "Custom title"],
    ["a generic name", {}, "Pianeta"],
  ])("titles the inline card with %s without a station", async (_label, overrides, heading) => {
    const { station: _station, ...planet } = await createPlanetListExamplePlanet();
    void _station;
    renderWithLocale(
      <PlanetListExampleView planet={{ ...planet, ...overrides }} planetData={guideStationInit.response} />,
    );
    expect(within(screen.getByRole("dialog")).getByRole("heading", { level: 2 })).toHaveTextContent(heading);
  });
});
