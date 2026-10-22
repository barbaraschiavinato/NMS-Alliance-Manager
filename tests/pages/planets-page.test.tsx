// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlanetDestination } from "@/components/cards/planet-destination-card";
import { PlanetsPage } from "@/components/pages/planets-page";
import { defaultAlliance, makeMember } from "../helpers/members";
import { mockFetch, renderPage, t } from "./helpers";

vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);
vi.mock("@/lib/nms-core/system.js", async () => (await import("./helpers")).nmsCoreModule);

const member = makeMember({ publicId: "me", nmsName: "Me" });

function planet(overrides: Partial<PlanetDestination> = {}): PlanetDestination {
  return {
    id: "1234567890AB:0",
    portal: "1234567890AB",
    planetPortal: "1234567890AB",
    planetNumber: 1,
    galaxy: 0,
    title: "Alpha mission",
    almanacName: "Verdant",
    almanacSearchIndex: "Verdant Lush humid",
    almanacFacts: [
      { label: "common.planet_type_label", value: "Lush" },
      { label: "planet.size", value: "Large" },
      { label: "planet.water", value: "Ocean" },
      { label: "planet.weather", value: "Humid" },
      { label: "planet.sentinels", value: "Low" },
    ],
    systemFacts: [
      { label: "planet.star", value: "Yellow" },
      { label: "common.economy", value: "Trading" },
      { label: "common.conflict", value: "Low" },
      { label: "common.race", value: "Gek" },
    ],
    planetType: "Lush",
    economyStars: 2,
    plants: ["Star Bulb"],
    minerals: ["Copper"],
    valuables: ["Gold"],
    dissonant: false,
    paradise: true,
    blackMarket: false,
    station: {
      id: "me:1234567890AB:0",
      portal: "1234567890AB",
      galaxy: 0,
      name: "Home Base",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

const frozen = planet({
  id: "2234567890AC:0",
  portal: "2234567890AC",
  planetPortal: "2234567890AC",
  planetNumber: 2,
  almanacName: "Glacia",
  almanacSearchIndex: "Glacia Frozen",
  almanacFacts: [
    { label: "common.planet_type_label", value: "Frozen" },
    { label: "planet.size", value: "Moon" },
  ],
  systemFacts: [
    { label: "planet.star", value: "Red" },
    { label: "common.race", value: "Unknown" },
  ],
  planetType: "Frozen",
  economyStars: undefined,
  plants: [],
  minerals: ["Dioxite"],
  valuables: [],
  dissonant: true,
  paradise: false,
  blackMarket: true,
  station: undefined,
});

function renderPlanets(props: Partial<Parameters<typeof PlanetsPage>[0]> = {}) {
  return renderPage(
    <PlanetsPage
      alliance={defaultAlliance}
      almanacLookupFailed={false}
      currentMember={member}
      missionCount={0}
      planets={[planet(), frozen]}
      stationCount={0}
      {...props}
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("PlanetsPage", () => {
  it("renders an embedded system without page chrome or changing the global planet counter", () => {
    mockFetch({});
    window.localStorage.setItem("nms-planet-count", "123");
    const before = { ...window.localStorage };
    const { container } = renderPlanets({ embedded: true });
    expect(screen.getByRole("heading", { name: "Home Base" })).toBeInTheDocument();
    expect(screen.getByText("Verdant")).toBeInTheDocument();
    expect(container.querySelector(".app-shell")).toBeNull();
    expect(container.querySelector("main")).toBeNull();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: t("planet.open_station_in_stations", { station: "Home Base" }) }),
    ).not.toBeInTheDocument();
    expect({ ...window.localStorage }).toEqual(before);
  });

  it("paginates 20 systems without splitting their planets and searches across all pages", async () => {
    mockFetch({});
    const planets = Array.from({ length: 21 }, (_, index) => {
      const portal = `1${index.toString(16).toUpperCase().padStart(11, "0")}`;
      return planet({
        id: `${portal}:0`,
        portal,
        planetPortal: portal,
        almanacName: `World ${index}`,
        almanacSearchIndex: `UniqueWorld${index}`,
        station: { id: `station-${index}`, portal, galaxy: 0, name: `Station ${index}` },
      });
    });
    planets.push({
      ...planets[0],
      id: "moon",
      planetPortal: `2${planets[0].planetPortal.slice(1)}`,
      almanacName: "Companion",
    });
    const { user, container } = renderPlanets({ planets });
    expect(container.querySelectorAll(".planet-station-group")).toHaveLength(20);
    expect(screen.getByText("Companion")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Station 20" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(container.querySelectorAll(".planet-station-group")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Station 20" })).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox"), "UniqueWorld0");
    expect(screen.getByRole("heading", { name: "Station 0" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  it("groups the planets by station and stores the planet count", async () => {
    mockFetch({});
    renderPlanets();

    expect(screen.getByRole("heading", { name: "Home Base" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: new RegExp(t("planet.no_associated_station")) })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: t("planet.black_market") })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: t("planet.open_station_in_stations", { station: "Home Base" }) }),
    ).toHaveAttribute("href", "/stations/me%3A1234567890AB%3A0?from=planets");
    expect(
      screen.getByRole("link", { name: t("planet.open_station_in_stations", { station: "Home Base" }) }),
    ).not.toHaveClass("station-create-mission-pulse");
    expect(screen.getByText(t("planet.paradise"))).toBeInTheDocument();
    expect(screen.getByText(t("planet.dissonant"))).toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem("nms-planet-count")).toBe("2"));
  });

  it("pulses the station link when a mission can be created from that station", () => {
    mockFetch({});
    renderPlanets({
      planets: [
        planet({
          station: {
            id: "me:1234567890AB:0",
            portal: "1234567890AB",
            galaxy: 0,
            name: "Home Base",
            canCreateMission: true,
          },
        }),
      ],
    });

    expect(
      screen.getByRole("link", { name: t("planet.open_station_in_stations", { station: "Home Base" }) }),
    ).toHaveClass("station-create-mission-pulse");
  });

  it("does not pulse the station link when a mission cannot be created from that station", () => {
    mockFetch({});
    renderPlanets({
      planets: [
        planet({
          station: {
            id: "me:1234567890AB:0",
            portal: "1234567890AB",
            galaxy: 0,
            name: "Home Base",
            canCreateMission: false,
          },
        }),
      ],
    });

    expect(
      screen.getByRole("link", { name: t("planet.open_station_in_stations", { station: "Home Base" }) }),
    ).not.toHaveClass("station-create-mission-pulse");
  });

  it("searches the almanac values", async () => {
    mockFetch({});
    const { user } = renderPlanets();

    await user.type(screen.getByRole("searchbox", { name: t("planet.search_almanac_values") }), "glacia");
    expect(screen.getByText("Glacia")).toBeInTheDocument();
    expect(screen.queryByText("Verdant")).not.toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: t("planet.search_almanac_values") }));
    await user.type(screen.getByRole("searchbox", { name: t("planet.search_almanac_values") }), "home base");
    expect(screen.getByText("Verdant")).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: t("planet.search_almanac_values") }));
    await user.type(screen.getByRole("searchbox", { name: t("planet.search_almanac_values") }), "zzz");
    expect(screen.getByText(t("planet.no_planets_match_search"))).toBeInTheDocument();
  });

  it("filters with the filter panel and clears the filters", async () => {
    mockFetch({});
    const { user } = renderPlanets();

    const toggle = screen.getByRole("button", { name: t("planet.filters") });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const type = screen.getByRole("combobox", { name: t("planet.filter_planet_type") });
    expect(
      within(type)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([t("planet.all_planet_types"), "Frozen", "Lush"]);
    await user.selectOptions(type, "Lush");
    expect(screen.queryByText("Glacia")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `${t("planet.remove_filter")}: ${t("planet.planet_type")}: Lush` }),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: t("planet.filter_dissonant") }), "yes");
    expect(screen.getByText(t("planet.no_planets_match_filters"))).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: `${t("planet.remove_filter")}: ${t("planet.dissonant")}: ${t("planet.dissonant_yes")}`,
      }),
    );
    expect(screen.getByText("Verdant")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t("planet.reset_filters") }));
    expect(screen.getByText("Glacia")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("planet.reset_filters") })).not.toBeInTheDocument();
  });

  it.each([
    ["planet.filter_star", "Red", "Glacia"],
    ["planet.filter_economy", "Trading", "Verdant"],
    ["planet.filter_race", "Gek", "Verdant"],
    ["planet.filter_size", "Moon", "Glacia"],
    ["planet.filter_water", "Ocean", "Verdant"],
    ["planet.filter_weather", "Humid", "Verdant"],
    ["planet.filter_conflict", "Low", "Verdant"],
    ["planet.filter_sentinels", "Low", "Verdant"],
    ["planet.filter_plants", "Star Bulb", "Verdant"],
    ["planet.filter_minerals", "Dioxite", "Glacia"],
    ["planet.filter_valuables", "Gold", "Verdant"],
    ["planet.filter_economy_stars", "2", "Verdant"],
    ["planet.filter_paradise", "yes", "Verdant"],
    ["planet.filter_pirate_system", "yes", "Glacia"],
  ])("filters by %s", async (label, value, visible) => {
    mockFetch({});
    const { user } = renderPlanets();

    await user.click(screen.getByRole("button", { name: t("planet.filters") }));
    await user.selectOptions(screen.getByRole("combobox", { name: t(label) }), value);

    expect(screen.getByText(visible)).toBeInTheDocument();
    expect(screen.queryByText(visible === "Glacia" ? "Verdant" : "Glacia")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("planet.reset_filters") })).toBeInTheDocument();
  });

  it("removes each active filter tag", async () => {
    mockFetch({});
    const { user } = renderPlanets();
    await user.click(screen.getByRole("button", { name: t("planet.filters") }));

    for (const [label, value] of [
      ["planet.filter_star", "Yellow"],
      ["planet.filter_economy", "Trading"],
      ["planet.filter_economy_stars", "2"],
      ["planet.filter_race", "Gek"],
      ["planet.filter_size", "Large"],
      ["planet.filter_paradise", "yes"],
      ["planet.filter_pirate_system", "no"],
      ["planet.filter_water", "Ocean"],
      ["planet.filter_weather", "Humid"],
      ["planet.filter_conflict", "Low"],
      ["planet.filter_sentinels", "Low"],
      ["planet.filter_plants", "Star Bulb"],
      ["planet.filter_minerals", "Copper"],
      ["planet.filter_valuables", "Gold"],
      ["planet.filter_dissonant", "no"],
    ]) {
      await user.selectOptions(screen.getByRole("combobox", { name: t(label) }), value);
    }
    expect(screen.getByText("Verdant")).toBeInTheDocument();

    const removeButtons = screen.getAllByRole("button", { name: new RegExp(`^${t("planet.remove_filter")}:`) });
    expect(removeButtons).toHaveLength(15);
    for (const button of removeButtons) await user.click(button);
    expect(screen.queryByRole("button", { name: t("planet.reset_filters") })).not.toBeInTheDocument();
    expect(screen.getByText("Glacia")).toBeInTheDocument();
  });

  it("opens the planet card on the selected planet", async () => {
    mockFetch({ "/api/missions/planet": { planet: { lines: { headline: { word: "Verdant" } } } } });
    const { user } = renderPlanets();

    await user.click(screen.getByRole("button", { name: /Verdant/ }));
    const dialog = await screen.findByRole("dialog", { name: "Home Base" });
    expect(await within(dialog).findByRole("heading", { name: /Verdant/ })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: t("planet.close_planet_details") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("warns about a partial almanac lookup and keeps the stored count", () => {
    mockFetch({});
    window.localStorage.setItem("nms-planet-count", "9");
    renderPlanets({ almanacLookupFailed: true, planets: [] });

    expect(screen.getByText(t("planet.almanac_partial_lookup_failed"))).toBeInTheDocument();
    expect(screen.getByText(t("planet.no_verified_mission_planets"))).toBeInTheDocument();
    expect(window.localStorage.getItem("nms-planet-count")).toBe("9");
  });

  it("shows the empty archive message", () => {
    mockFetch({});
    renderPlanets({ planets: [] });
    expect(screen.getByText(t("planet.no_mission_planets"))).toBeInTheDocument();
  });

  it("sorts every filter option", async () => {
    const barren = planet({
      id: "3234567890AD:0",
      portal: "3234567890AD",
      planetPortal: "3234567890AD",
      almanacName: "Dusty",
      almanacFacts: [
        { label: "planet.size", value: "Small" },
        { label: "planet.water", value: "Dry" },
        { label: "planet.weather", value: "Arid" },
        { label: "planet.sentinels", value: "Aggressive" },
      ],
      systemFacts: [
        { label: "planet.star", value: "Blue" },
        { label: "common.economy", value: "Mining" },
        { label: "common.conflict", value: "High" },
        { label: "common.race", value: "Korvax" },
      ],
      planetType: "Barren",
      economyStars: 1,
      plants: ["Cactus Flesh"],
      minerals: ["Ammonia"],
      valuables: ["Ancient Bones"],
    });
    mockFetch({});
    const { user } = renderPlanets({ planets: [planet(), frozen, barren] });
    await user.click(screen.getByRole("button", { name: t("planet.filters") }));

    const values = (label: string) =>
      within(screen.getByRole("combobox", { name: t(label) }))
        .getAllByRole("option")
        .slice(1)
        .map((option) => option.getAttribute("value"));
    expect(values("planet.filter_economy")).toEqual(["Mining", "Trading"]);
    expect(values("planet.filter_economy_stars")).toEqual(["1", "2"]);
    expect(values("planet.filter_star")).toEqual(["Blue", "Red", "Yellow"]);
    expect(values("planet.filter_race")).toEqual(["Gek", "Korvax", "Unknown"]);
    expect(values("planet.filter_water")).toEqual(["Dry", "Ocean"]);
    expect(values("planet.filter_weather")).toEqual(["Arid", "Humid"]);
    expect(values("planet.filter_conflict")).toEqual(["High", "Low"]);
    expect(values("planet.filter_sentinels")).toEqual(["Aggressive", "Low"]);
    expect(values("planet.filter_plants")).toEqual(["Cactus Flesh", "Star Bulb"]);
    expect(values("planet.filter_minerals")).toEqual(["Ammonia", "Copper", "Dioxite"]);
    expect(values("planet.filter_valuables")).toEqual(["Ancient Bones", "Gold"]);
  });

  it("orders untitled planets by portal and searches planets without an almanac name", async () => {
    const untitled = (portal: string, planetNumber: number) =>
      planet({
        id: `${portal}:0`,
        portal,
        planetPortal: portal,
        planetNumber,
        title: undefined,
        almanacName: undefined,
        almanacSearchIndex: "",
        station: undefined,
      });
    mockFetch({});
    const { user } = renderPlanets({ planets: [untitled("BBBB00000000", 2), untitled("AAAA00000000", 1)] });

    const first = screen.getByText(t("planet.planet_number", { number: 1 }));
    const second = screen.getByText(t("planet.planet_number", { number: 2 }));
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.type(screen.getByRole("searchbox", { name: t("planet.search_almanac_values") }), "bbbb");
    expect(screen.queryByText(t("planet.planet_number", { number: 1 }))).not.toBeInTheDocument();
    expect(screen.getByText(t("planet.planet_number", { number: 2 }))).toBeInTheDocument();
  });

  it("titles the planet card with the system label, the mission title or a fallback", async () => {
    mockFetch({ "/api/missions/planet": { planet: { lines: { headline: { word: "Verdant" } } } } });
    const { user } = renderPlanets({
      planets: [planet({ station: undefined, system: "Sol · Euclid" }), { ...frozen, title: undefined }],
    });

    await user.click(screen.getByRole("button", { name: /Verdant/ }));
    let dialog = await screen.findByRole("dialog", { name: "Alpha mission" });
    expect(await within(dialog).findByText("Sol · Euclid")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: t("planet.close_planet_details") }));

    await user.click(screen.getByRole("button", { name: /Glacia/ }));
    dialog = await screen.findByRole("dialog", { name: t("planet.mission_planet") });
    expect(dialog).toBeInTheDocument();
  });

  it("lets an admin save the alliance settings and the own profile", async () => {
    const admin = makeMember({ publicId: "admin", nmsName: "Chief", role: "admin" });
    mockFetch({
      "GET /api/alliance": defaultAlliance,
      "PATCH /api/alliance": { ...defaultAlliance, name: "Renamed Alliance" },
      "PATCH /api/profile": { ...admin, nmsName: "Captain" },
    });
    const { user } = renderPlanets({ currentMember: admin });

    await user.click(screen.getByRole("button", { name: t("admin.alliance_settings") }));
    const settings = screen.getByRole("dialog", { name: t("admin.alliance") });
    await waitFor(() =>
      expect(within(settings).getByRole("textbox", { name: t("admin.alliance_name") })).toHaveValue("Test Alliance"),
    );
    await user.click(within(settings).getByRole("button", { name: t("admin.save_settings") }));
    await waitFor(() => expect(screen.getAllByText("Renamed Alliance").length).toBeGreaterThan(0));
    await user.click(within(settings).getByRole("button", { name: t("common.close") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t("profile.my_profile") }));
    let profile = screen.getByRole("dialog", { name: t("profile.my_nms_profile") });
    await user.click(within(profile).getAllByRole("button", { name: t("common.close") })[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t("profile.my_profile") }));
    profile = screen.getByRole("dialog", { name: t("profile.my_nms_profile") });
    await user.click(within(profile).getByRole("button", { name: t("profile.save_profile") }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: `Captain · ${t("admin.administrator")}` })).toBeInTheDocument(),
    );
  });
});
