// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StationCard } from "@/components/cards/station-card";
import {
  cachedPlanetImageUrl,
  cachedPlanetTitle,
  cachedPlanetType,
  parsePlanetSystemStatuses,
  parseStations,
  stationOwnerName,
  type CachedPlanet,
  type StationCardProps,
  type StationEntry,
} from "@/components/cards/station-card/parts";
import { canCreateMissionFromStation } from "@/lib/missions/station-mission-availability";
import type { AllianceMember } from "@/lib/members/member-types";
import type { Locale } from "@/lib/translations";
import { makeMember } from "../../helpers/members";
import { renderWithLocale } from "../helpers";

vi.mock("next/image", async () => (await import("../helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("../helpers")).nextLinkModule);
vi.mock("@/lib/nms-core/system.js", () => ({
  systemAttributes: (address: bigint) => ({ star_type: 1, gas_giant: address === BigInt("0x03EA02304626") }),
  planetSeeds: () => ({ planet_seeds: [1, 2, 3], planet_count: 3, moon_count: 0 }),
}));

const portal = "0123456789AB";
const renderedAt = Date.parse("2026-10-11T12:00:00.000Z");

function station(overrides: Partial<StationEntry> = {}): StationEntry {
  return {
    portal,
    galaxy: 0,
    ownerId: "owner",
    ownerName: "Owner Name",
    planet: null,
    hasMissions: false,
    canOpenOwnSpecialtyMission: false,
    hasAssignedMission: false,
    missionStatus: "none",
    availableSpecialties: [],
    ...overrides,
  };
}

function planet(response: Record<string, unknown>, galaxy = 0): CachedPlanet {
  return { galaxy, response };
}

const lushPlanet = planet({
  lines: {
    headline: { word: "Verdant World" },
    band: {
      type: { word: "Lush" },
      weather: { word: "Humid" },
      water: { word: "Abundant" },
      star: { word: "Yellow" },
      economy: { word: "Fuel Generation", stars: 2 },
      conflict: { word: "Low" },
      race: { word: "Gek" },
    },
  },
  pictures: { disc: "/planets/v.png" },
});

function renderStation(overrides: Partial<StationCardProps> = {}, locale: Locale = "en") {
  const props: StationCardProps = {
    station: station(),
    member: makeMember({ publicId: "viewer", specialty: "explorer", role: "user", simpleView: false }),
    canSeeAll: false,
    canCreateMissions: false,
    renderedAt,
    planetStatuses: {},
    planetStatusesLoaded: true,
    savingStatusKeys: [],
    onToggleStatus: vi.fn(),
    onOpenStation: vi.fn(),
    onOpenProfile: vi.fn(),
    onCreateMission: vi.fn(),
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onViewNote: vi.fn(),
    ...overrides,
  };
  return {
    props,
    ...renderWithLocale(
      <ul>
        <StationCard {...props} />
      </ul>,
      { locale },
    ),
  };
}

describe("StationCard variants", () => {
  it("renders the extended card with the portal code under the title", () => {
    renderStation();
    const item = screen.getByRole("listitem");
    expect(item).toHaveClass("station-card-extended");
    expect(within(item).getByText(portal, { selector: ".station-card-title-copy > code" })).toBeInTheDocument();
  });

  it("renders the simple card with the portal code under the title too", () => {
    renderStation({ member: makeMember({ publicId: "viewer", simpleView: true }) });
    const item = screen.getByRole("listitem");
    expect(item).not.toHaveClass("station-card-extended");
    expect(within(item).getByText(portal, { selector: ".station-card-title-copy > code" })).toBeInTheDocument();
  });
});

describe.each([
  ["extended", false],
  ["simple", true],
])("StationCard (%s)", (_variant, simpleView) => {
  const viewer = (overrides: Partial<AllianceMember> = {}) =>
    makeMember({ publicId: "viewer", specialty: "explorer", role: "user", simpleView, ...overrides });
  const moderator = () => viewer({ role: "moderator" });

  it.each([false, true])("shows the hub ribbon instead of New, existing missions %s", (hasMissions) => {
    renderStation({
      member: viewer(),
      isAllianceHub: true,
      station: station({ hasMissions, createdAt: "2026-10-10T00:00:00.000Z" }),
    });
    expect(screen.getByText("Alliance hub")).toHaveClass("station-hub-ribbon");
    expect(screen.queryByText("New")).not.toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveClass("station-is-new");
  });

  it.each([
    ["007902304626", "Black hole"],
    ["007A02304626", "Atlas Interface"],
    ["03EA02304626", "Gas giant"],
  ])("flags the special system at %s with %s", async (featurePortal, label) => {
    renderStation({ member: viewer(), station: station({ portal: featurePortal }) });
    expect(await screen.findByText(label)).toHaveClass("system-feature");
  });

  it("shows no special system badge for an ordinary system", async () => {
    renderStation({ member: viewer() });
    await screen.findByText("3 planets · green star");
    expect(document.querySelector(".system-feature")).toBeNull();
  });

  it("shows the station name and system info, and the title links to the station detail", async () => {
    const target = station({ name: "Haven" });
    const { props } = renderStation({ member: viewer(), station: target });
    const title = screen.getAllByText("Haven")[0].closest("a");
    expect(title).toHaveClass("station-card-title");
    expect(title).toHaveAttribute("href", `/stations/owner%3A${portal}%3A0`);
    expect(await screen.findByText("3 planets · green star")).toBeInTheDocument();
    expect(screen.getByText("No Almanac data")).toBeInTheDocument();
    expect(screen.getByLabelText("Glyphs entered: 12 of 12")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open station details" })).not.toBeInTheDocument();
    expect(props.onOpenStation).not.toHaveBeenCalled();
  });

  it("opens the planet dialog from the title when already showing the station detail", async () => {
    const target = station({ name: "Haven" });
    const { user, props } = renderStation({ member: viewer(), station: target, showDetailLink: false });
    const title = screen.getAllByText("Haven")[0].closest("button");
    expect(title).toHaveClass("station-card-title");
    expect(document.querySelector("a.station-card-title")).toBeNull();
    await user.click(title as HTMLElement);
    expect(props.onOpenStation).toHaveBeenCalledWith(target);
  });

  it("names the station after the cached planet and shows its Almanac facts", async () => {
    const target = station({ planet: lushPlanet });
    const { user, props, container } = renderStation({ member: viewer(), station: target });
    expect(screen.getAllByText("Verdant World").length).toBeGreaterThan(0);
    expect(container.querySelector("img.station-card-planet-image")).toHaveAttribute(
      "src",
      "https://nmsalmanac.com/api/planets/v.png",
    );
    expect(screen.getByText("Star").parentElement).toHaveTextContent("Star Yellow");
    expect(screen.getByText("Economy").parentElement).toHaveTextContent("Economy Fuel Generation ★★☆");
    expect(screen.getByRole("img", { name: "Economy level: 2/3" })).toHaveClass("planet-economy-stars");
    expect(screen.getByRole("img", { name: "Low" })).toHaveClass("planet-conflict-dots");
    expect(screen.getByRole("img", { name: "Gek" })).toHaveClass("planet-race");
    for (const label of ["Type", "Weather", "Water"]) expect(screen.queryByText(label)).not.toBeInTheDocument();
    for (const value of ["Lush", "Humid", "Abundant"]) expect(screen.queryByText(value)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open details for Verdant World" }));
    expect(props.onOpenStation).toHaveBeenCalledWith(target);
  });

  it("translates planet facts into Italian", () => {
    renderStation({ member: viewer(), station: station({ planet: lushPlanet }) }, "it");
    expect(screen.getByText("Stella").parentElement).toHaveTextContent("Stella Gialla");
    expect(screen.getByText("Economia").parentElement).toHaveTextContent("Economia Generazione di carburante ★★☆");
    expect(screen.getByText("Conflitto")).toBeInTheDocument();
    expect(screen.getByText("Razza")).toBeInTheDocument();
    for (const text of ["Meteo", "Acqua", "Tipo", "Lussureggiante"])
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apri la scheda di Verdant World" })).toBeInTheDocument();
    expect(screen.getByText("SCOPRITORE")).toBeInTheDocument();
  });

  it("falls back to the planet type, then a generic name", () => {
    const { unmount } = renderStation({
      member: viewer(),
      station: station({ planet: planet({ lines: { band: { type: { word: "Barren" } } } }) }),
    });
    expect(screen.getAllByText("Barren").length).toBeGreaterThan(0);
    unmount();
    renderStation({ member: viewer(), station: station({ planet: planet({}) }) });
    expect(screen.getAllByText("Unnamed planet").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Open details for this planet" })).toHaveTextContent("Planet data");
  });

  it("flags new stations without missions", () => {
    const { unmount } = renderStation({
      member: viewer(),
      station: station({ createdAt: "2026-10-10T00:00:00.000Z" }),
    });
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveClass("station-is-new");
    unmount();
    renderStation({ member: viewer(), station: station({ createdAt: "2026-09-01T00:00:00.000Z" }) });
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });

  it("warns about stations in other galaxies", () => {
    renderStation({ member: viewer(), station: station({ galaxy: 2 }) });
    expect(screen.getByText("Calypso")).toHaveClass("mission-galaxy-alert");
  });

  it("opens the owner profile with the station as message context", async () => {
    const target = station({ name: "Haven", galaxy: 1 });
    const { user, props } = renderStation({ member: viewer(), station: target });
    await user.click(screen.getByRole("button", { name: "Owner Name" }));
    expect(props.onOpenProfile).toHaveBeenCalledWith({
      memberId: "owner",
      messageContext: { type: "planet", portal, galaxy: 1, subjectLabel: "Haven" },
    });
  });

  it.each([
    ["the cached planet title", lushPlanet, "Verdant World"],
    ["the cached planet type", planet({ lines: { band: { type: { word: "Barren" } } } }), "Barren"],
  ])("labels the owner message context with %s for unnamed stations", async (_label, cached, subjectLabel) => {
    const { user, props } = renderStation({ member: viewer(), station: station({ planet: cached }) });
    await user.click(screen.getByRole("button", { name: "Owner Name" }));
    expect(props.onOpenProfile).toHaveBeenCalledWith({
      memberId: "owner",
      messageContext: { type: "planet", portal, galaxy: 0, subjectLabel },
    });
  });

  it("hides e-mail owner names and falls back to initials when the avatar fails", () => {
    const { container } = renderStation({
      member: viewer(),
      station: station({ ownerName: "x@example.com", ownerImage: "https://example.com/o.png" }),
    });
    const image = container.querySelector(".station-owner-link img");
    expect(image).toHaveAttribute("src", "https://example.com/o.png");
    fireEvent.error(image as Element);
    expect(screen.getByRole("button", { name: "Former member" })).toHaveTextContent("FOFormer member");
  });

  it("lets the owner tick ranger tasks, edit and delete a station without missions", async () => {
    const target = station({ ownerId: "viewer" });
    const { user, props } = renderStation({
      member: viewer(),
      station: target,
      planetStatuses: { [`0:${portal}`]: ["station_claimed"] },
    });
    expect(screen.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"))).toEqual([
      "Station claimed",
      "System renamed",
    ]);
    expect(screen.getByRole("checkbox", { name: "Station claimed" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "System renamed" }));
    expect(props.onToggleStatus).toHaveBeenCalledWith(target, "renamed", true);

    await user.click(screen.getByRole("button", { name: `Edit station ${portal}` }));
    expect(props.onEdit).toHaveBeenCalledWith(target);
    await user.click(
      screen.getByRole("button", { name: `Remove portal ${portal} in Euclide from Owner Name's archive` }),
    );
    expect(props.onRemove).toHaveBeenCalledWith(target);
  });

  it("disables the task checkboxes while saving", () => {
    renderStation({ member: viewer(), station: station({ ownerId: "viewer" }), savingStatusKeys: [`0:${portal}`] });
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
  });

  it("hides tasks until statuses load, and from non-owners", () => {
    const { unmount } = renderStation({
      member: viewer(),
      station: station({ ownerId: "viewer" }),
      planetStatusesLoaded: false,
    });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    unmount();
    renderStation({ member: viewer() });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit station|Remove portal/ })).not.toBeInTheDocument();
  });

  it("gives moderators every task, edit, delete and mission creation", async () => {
    const target = station({ availableSpecialties: ["ranger"] });
    const { user, props } = renderStation({
      canSeeAll: true,
      canCreateMissions: true,
      member: moderator(),
      station: target,
    });
    expect(screen.getAllByRole("checkbox")).toHaveLength(simpleView ? 3 : 7);
    await user.click(screen.getByRole("button", { name: `Create mission from ${portal}` }));
    expect(props.onCreateMission).toHaveBeenCalledWith(target);
    expect(screen.getByRole("button", { name: `Edit station ${portal}` })).toBeInTheDocument();
  });

  it("links to existing missions for moderators instead of deleting", () => {
    renderStation({
      canSeeAll: true,
      member: moderator(),
      station: station({ hasMissions: true, specialtyMissionId: "mission-1" }),
    });
    expect(screen.getByRole("link", { name: `Open missions for planet ${portal}` })).toHaveAttribute(
      "href",
      "/missions/mission-1?from=stations&source=station-card",
    );
    expect(screen.queryByRole("button", { name: /Remove portal/ })).not.toBeInTheDocument();
  });

  it("links to the map highlighting the station, unless the map link is hidden", () => {
    const { unmount } = renderStation({ station: station({ galaxy: 5 }) });
    const link = screen.getByRole("link", { name: `Show station ${portal} on the map` });
    expect(link).toHaveAttribute("href", `/map?galaxy=5&portal=${portal}`);
    expect(link).toHaveAttribute("data-tooltip", "Show on the map");
    expect(link).toHaveClass("station-map-link");
    unmount();
    renderStation({ showMapLink: false });
    expect(screen.queryByRole("link", { name: `Show station ${portal} on the map` })).not.toBeInTheDocument();
  });

  it("does not link the title when already showing the detail", () => {
    renderStation({ showDetailLink: false });
    expect(document.querySelector("a.station-card-title")).toBeNull();
  });

  it("hides associated mission navigation without hiding permitted mission creation", async () => {
    const target = station({ hasMissions: true, availableSpecialties: ["builder"] });
    const { user, props } = renderStation({
      canSeeAll: true,
      canCreateMissions: true,
      member: moderator(),
      station: target,
      showAssociatedMissionsLink: false,
    });
    expect(screen.queryByRole("link", { name: `Open missions for planet ${portal}` })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove portal/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: `Create mission from ${portal}` }));
    expect(props.onCreateMission).toHaveBeenCalledWith(target);
  });

  it.each([undefined, "Station notes"])("places delete last, after edit and optional notes: %s", (note) => {
    renderStation({ canSeeAll: true, member: moderator(), station: station({ note }) });
    const editButton = screen.getByRole("button", { name: `Edit station ${portal}` });
    const deleteButton = screen.getByRole("button", { name: /Remove portal/ });
    expect(editButton.previousElementSibling).toBe(
      screen.getByRole("link", { name: `Show station ${portal} on the map` }),
    );
    expect(deleteButton.parentElement?.lastElementChild).toBe(deleteButton);
    if (note) {
      expect(editButton.nextElementSibling).toBe(screen.getByRole("button", { name: /View notes for/ }));
    } else {
      expect(editButton.nextElementSibling).toBe(deleteButton);
    }
  });

  it("links to missions the member can open for their specialty", () => {
    renderStation({
      member: viewer(),
      station: station({
        hasMissions: true,
        canOpenOwnSpecialtyMission: true,
        specialtyMissionId: "specialty-mission",
      }),
    });
    const link = screen.getByRole("link", { name: `Open missions for planet ${portal}` });
    expect(link).toHaveAttribute("href", "/missions/specialty-mission?from=stations&source=station-card");
    expect(link.querySelector(".lucide-crosshair")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /mission in progress/ })).not.toBeInTheDocument();
  });

  it("does not link to a search or an unrelated mission when no specialty mission exists", () => {
    renderStation({ canSeeAll: true, member: moderator(), station: station({ hasMissions: true }) });
    expect(screen.queryByRole("link", { name: `Open missions for planet ${portal}` })).not.toBeInTheDocument();
    expect(document.querySelector("a.station-card-title")).not.toBeNull();
  });

  it.each([
    ["explorer", "Explorers mission in progress"],
    ["builder", "Builders mission in progress"],
    ["ranger", "Explorers and Builders mission in progress"],
  ] as const)("marks a %s mission already in progress", (specialty, label) => {
    renderStation({ member: viewer({ specialty }), station: station({ hasMissions: true }) });
    expect(screen.getByRole("img", { name: label })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: `Open missions for planet ${portal}` })).not.toBeInTheDocument();
    expect(document.querySelector("a.station-card-title")).toHaveAttribute("href", `/stations/owner%3A${portal}%3A0`);
  });

  it("lets an explorer create a mission when explorers are still needed", () => {
    renderStation({
      member: viewer({ specialty: "explorer" }),
      station: station({ availableSpecialties: ["explorer"] }),
    });
    expect(screen.getByRole("button", { name: `Create mission from ${portal}` })).toBeInTheDocument();
  });

  it("prompts non-rangers to create missions from eligible stations", () => {
    renderStation({
      member: viewer({ specialty: "explorer" }),
      station: station({ availableSpecialties: ["explorer"] }),
    });

    expect(screen.getByRole("button", { name: `Create mission from ${portal}` })).toHaveClass(
      "station-create-mission-pulse",
    );
    expect(screen.getByText("Create mission")).toBeInTheDocument();
  });

  it("keeps the ranger mission action without pulsing or a ribbon", () => {
    renderStation({
      member: viewer({ specialty: "ranger" }),
      station: station({ ownerId: "viewer", availableSpecialties: ["explorer"] }),
    });

    expect(screen.getByRole("button", { name: `Create mission from ${portal}` })).not.toHaveClass(
      "station-create-mission-pulse",
    );
    expect(screen.queryByText("Create mission")).not.toBeInTheDocument();
  });

  it("shows station notes", async () => {
    const target = station({ name: "Haven", note: "Bring a hazmat suit" });
    const { user, props } = renderStation({ member: viewer(), station: target });
    await user.click(screen.getByRole("button", { name: "View notes for Haven" }));
    expect(props.onViewNote).toHaveBeenCalledWith(target);
  });
});

describe("station card helpers", () => {
  const member = (overrides: Partial<AllianceMember>) => makeMember({ publicId: "viewer", ...overrides });

  it("decides who can create missions from a station", () => {
    expect(canCreateMissionFromStation(station({ availableSpecialties: ["all"] }), member({}), true)).toBe(true);
    expect(canCreateMissionFromStation(station(), member({}), true)).toBe(false);
    expect(
      canCreateMissionFromStation(
        station({ availableSpecialties: ["builder"] }),
        member({ specialty: "builder" }),
        false,
      ),
    ).toBe(true);
    expect(
      canCreateMissionFromStation(
        station({ availableSpecialties: ["explorer"] }),
        member({ specialty: "builder" }),
        false,
      ),
    ).toBe(false);
    expect(
      canCreateMissionFromStation(
        station({ ownerId: "viewer", availableSpecialties: ["explorer_builder"] }),
        member({ specialty: "ranger" }),
        false,
      ),
    ).toBe(true);
    expect(
      canCreateMissionFromStation(
        station({ availableSpecialties: ["explorer_builder"] }),
        member({ specialty: "ranger" }),
        false,
      ),
    ).toBe(false);
    expect(
      canCreateMissionFromStation(
        station({ ownerId: "viewer", availableSpecialties: ["ranger"] }),
        member({ specialty: "ranger" }),
        false,
      ),
    ).toBe(false);
    expect(
      canCreateMissionFromStation(station({ availableSpecialties: ["all"] }), member({ specialty: "" }), false),
    ).toBe(false);
  });

  it("reads cached planet fields", () => {
    expect(cachedPlanetTitle(lushPlanet)).toBe("Verdant World");
    expect(cachedPlanetType(lushPlanet)).toBe("Verdant World");
    expect(cachedPlanetType(planet({ lines: { band: { type: { word: "Toxic" } } } }))).toBe("Toxic");
    expect(cachedPlanetType(null)).toBe("");
    expect(cachedPlanetImageUrl(lushPlanet)).toBe("https://nmsalmanac.com/api/planets/v.png");
    expect(cachedPlanetImageUrl(planet({ pictures: { disc: "https://evil.example/p.png" } }))).toBeNull();
  });

  it("names owners without exposing e-mail addresses", () => {
    expect(stationOwnerName(station({ ownerName: "  Vega " }))).toBe("Vega");
    expect(stationOwnerName(station({ ownerName: "vega@example.com" }))).toBe("Former member");
    expect(stationOwnerName(station({ ownerName: undefined }))).toBe("Former member");
  });

  it("parses station API rows and drops malformed ones", () => {
    expect(parseStations(null)).toEqual([]);
    const [parsed, ...rest] = parseStations([
      {
        portal,
        galaxy: 1,
        ownerId: "o",
        ownerName: "O",
        ownerNmsName: "ON",
        ownerImage: "i",
        createdByMemberId: "c",
        createdAt: "d",
        name: "n",
        note: "x",
        planet: { a: 1 },
        hasMissions: true,
        canOpenOwnSpecialtyMission: true,
        specialtyMissionId: "parsed-mission",
        hasAssignedMission: true,
        missionStatus: "completed",
        availableSpecialties: ["ranger", "bogus"],
      },
      { portal, galaxy: "1", ownerId: "o" },
      { portal, galaxy: 0, ownerId: "o", missionStatus: "weird", availableSpecialties: "ranger" },
    ]);
    expect(parsed).toEqual({
      portal,
      galaxy: 1,
      ownerId: "o",
      ownerName: "O",
      ownerNmsName: "ON",
      ownerImage: "i",
      createdByMemberId: "c",
      createdAt: "d",
      name: "n",
      note: "x",
      planet: { galaxy: 1, response: { a: 1 } },
      hasMissions: true,
      canOpenOwnSpecialtyMission: true,
      specialtyMissionId: "parsed-mission",
      hasAssignedMission: true,
      missionStatus: "completed",
      availableSpecialties: ["ranger"],
    });
    expect(rest).toEqual([
      {
        portal,
        galaxy: 0,
        ownerId: "o",
        planet: null,
        hasMissions: false,
        canOpenOwnSpecialtyMission: false,
        hasAssignedMission: false,
        missionStatus: "none",
        availableSpecialties: [],
      },
    ]);
  });

  it("parses system statuses, de-duplicating and rejecting unknown values", () => {
    expect(parsePlanetSystemStatuses({ [`0:${portal}`]: ["mapped", "mapped", "renamed"] })).toEqual({
      [`0:${portal}`]: ["mapped", "renamed"],
    });
    expect(() => parsePlanetSystemStatuses([])).toThrow("Invalid system status response.");
    expect(() => parsePlanetSystemStatuses({ k: ["nope"] })).toThrow("Invalid system status response.");
    expect(() => parsePlanetSystemStatuses({ k: "mapped" })).toThrow("Invalid system status response.");
  });
});
