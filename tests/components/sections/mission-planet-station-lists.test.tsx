// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanetDestination } from "@/components/cards/planet-destination-card";
import type { StationEntry, StationFilter } from "@/components/cards/station-card/parts";
import { MissionList, type MissionFilter } from "@/components/sections/mission-list";
import { PlanetList, PlanetStationHeading } from "@/components/sections/planet-list";
import { StationList } from "@/components/sections/station-list";
import type { AllianceMember } from "@/lib/members/member-types";
import type { Locale } from "@/lib/translations";
import { makeMember } from "../../helpers/members";
import { makeMission, renderWithLocale } from "../helpers";

vi.mock("next/image", async () => (await import("../helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("../helpers")).nextLinkModule);
vi.mock("@/lib/nms-core/system.js", () => ({
  systemAttributes: () => ({ star_type: 0 }),
  planetSeeds: () => ({ planet_seeds: [BigInt(1)] }),
}));
// Il dialog profilo è coperto dai test dei modali: qui basta sapere quando viene aperto.
vi.mock("@/components/modals/member-card-dialog", () => ({
  MemberCardDialog: ({
    memberId,
    messageContext,
    onClose,
  }: {
    memberId: string;
    messageContext: { type: string };
    onClose: () => void;
  }) => (
    <div aria-label="Profile dialog" role="dialog">
      <span>{`${memberId}:${messageContext.type}`}</span>
      <button onClick={onClose} type="button">
        close profile
      </button>
    </div>
  ),
}));

type FetchHandler = (url: string) => Response;
function stubFetch(handler: FetchHandler = () => new Response(JSON.stringify({ note: "" }))) {
  const fetchMock = vi.fn(async (url: string) =>
    url.startsWith("/api/missions/planet?") ? new Response("{}", { status: 404 }) : handler(url),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  stubFetch();
});

describe("MissionList", () => {
  const missionCounts: Record<MissionFilter, number> = {
    all: 3,
    in_progress: 1,
    pending: 2,
    pending_assigned: 0,
    pending_unassigned: 2,
    completed: 0,
  };
  let counter = 0;
  const viewer = (overrides: Partial<AllianceMember> = {}) =>
    makeMember({ publicId: "me", role: "user", specialty: "explorer", simpleView: false, ...overrides });

  function renderMissions(overrides: Partial<Parameters<typeof MissionList>[0]> = {}, locale: Locale = "en") {
    counter += 1;
    const props: Parameters<typeof MissionList>[0] = {
      missions: [
        makeMission({ id: `list-${counter}-a`, title: "Alpha" }),
        makeMission({ id: `list-${counter}-b`, title: "Beta" }),
      ],
      counts: missionCounts,
      filter: "all",
      search: "",
      searchInput: createRef<HTMLInputElement>(),
      onFilterChange: vi.fn(),
      onSearchChange: vi.fn(),
      onEdit: vi.fn(),
      onDeleteMission: vi.fn(),
      onOpenPlanet: vi.fn(),
      onClaim: vi.fn(),
      onComplete: vi.fn(),
      onReopen: vi.fn(),
      onStart: vi.fn(),
      requestedSpecialty: () => null,
      onCreateRangerMission: vi.fn(),
      onToggleSystemStatus: vi.fn(),
      onUpdateProgress: vi.fn(async () => undefined),
      currentMember: viewer(),
      canManage: false,
      stationOwners: [],
      stationOwnersLoaded: true,
      members: [],
      planetStatuses: {},
      ...overrides,
    };
    return { props, ...renderWithLocale(<MissionList {...props} />, { locale }) };
  }

  it("renders mission cards, filter tabs, search and the footer", async () => {
    const { user, props } = renderMissions();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "All3",
      "In progress1",
      "Pending · unassigned2",
    ]);
    expect(screen.getByText("Showing 2 of 3 missions")).toBeInTheDocument();
    expect(props.searchInput.current).toBe(
      screen.getByRole("textbox", { name: "Search missions, planets, users, or mission type" }),
    );

    await user.click(screen.getByRole("tab", { name: "In progress1" }));
    expect(props.onFilterChange).toHaveBeenCalledWith("in_progress");
    await user.type(screen.getByRole("textbox"), "q");
    expect(props.onSearchChange).toHaveBeenCalledWith("q");
  });

  it("paginates missions after 50 and resets after changing filters", async () => {
    const missions = Array.from({ length: 51 }, (_, index) =>
      makeMission({ id: `page-${index}`, title: `Mission ${index}` }),
    );
    const { user, props, rerender } = renderMissions({ missions });
    expect(screen.getAllByRole("article")).toHaveLength(50);
    expect(screen.queryByText("Mission 50")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("Mission 50")).toBeInTheDocument();
    rerender(<MissionList {...props} search="new" />);
    expect(screen.getAllByRole("article")).toHaveLength(50);
  });

  it("keeps the selected tab visible even with no missions, in Italian", () => {
    renderMissions({ filter: "completed", missions: [] }, "it");
    expect(screen.getByRole("tab", { name: "Completata0" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Nessuna missione corrisponde ai filtri.")).toBeInTheDocument();
  });

  it("shows a spinner instead of the empty message while loading", () => {
    renderMissions({ missions: [], loading: true });
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("No missions match the filters.")).not.toBeInTheDocument();
  });

  it("hides the footer in the simple view", () => {
    renderMissions({ currentMember: viewer({ simpleView: true }) });
    expect(screen.queryByText(/Showing \d+ of/)).not.toBeInTheDocument();
  });

  it("toggles between all missions and the viewer's own", async () => {
    const onScopeChange = vi.fn();
    const { user, rerender, props } = renderMissions({ onScopeChange });
    const toggle = screen.getByRole("button", { name: "Show only my missions" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle);
    expect(onScopeChange).toHaveBeenCalledWith(false);

    rerender(<MissionList {...props} showAll={false} />);
    await user.click(screen.getByRole("button", { name: "Show all missions" }));
    expect(onScopeChange).toHaveBeenLastCalledWith(true);
  });

  it("opens the member profile dialog from a card and closes it", async () => {
    const { user } = renderMissions({
      missions: [
        makeMission({ id: `p-${counter}`, assignedMemberId: "vega", assignedTo: "Vega", status: "in_progress" }),
      ],
    });
    await user.click(screen.getByRole("button", { name: "Vega" }));
    expect(screen.getByRole("dialog", { name: "Profile dialog" })).toHaveTextContent("vega:mission");
    await user.click(screen.getByRole("button", { name: "close profile" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows mission notes in a dialog for managers", async () => {
    const { user } = renderMissions({
      canManage: true,
      missions: [makeMission({ id: `n-${counter}`, title: "Noted", notes: "Bring fuel" })],
    });
    await user.click(screen.getByRole("button", { name: "View notes for Noted" }));
    const dialog = screen.getByRole("dialog", { name: "Mission notes" });
    expect(dialog).toHaveTextContent("Noted");
    expect(dialog).toHaveTextContent("Bring fuel");
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the discoverer's planet notes in a dialog", async () => {
    stubFetch(() => new Response(JSON.stringify({ note: "Sentinels are aggressive" })));
    const { user } = renderMissions({ missions: [makeMission({ id: `pn-${Date.now()}`, title: "Planet X" })] });
    await user.click(await screen.findByRole("button", { name: "View station notes for Planet X" }));
    const dialog = await screen.findByRole("dialog", { name: "Discoverer notes" });
    expect(within(dialog).getByRole("listitem")).toHaveTextContent("Sentinels are aggressive");
    expect(dialog).toHaveTextContent("0123456789AB");
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("loads missing discoverer images from the members API", async () => {
    const fetchMock = stubFetch((url) =>
      url.startsWith("/api/members")
        ? new Response(
            JSON.stringify([{ publicId: "disc", image: "https://example.com/disc.png" }, { publicId: "x" }, null]),
          )
        : new Response(JSON.stringify({ note: "" })),
    );
    const { container } = renderMissions({
      missions: [makeMission({ id: `d-${counter}`, stationOwnerMemberId: "disc", stationOwnerName: "Disc" })],
    });
    await waitFor(() =>
      expect(container.querySelector('.assignee-avatar img[src="https://example.com/disc.png"]')).not.toBeNull(),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/members?ids=disc", expect.objectContaining({ cache: "no-store" }));
  });

  it("does not fetch discoverer images it already knows", async () => {
    const fetchMock = stubFetch();
    const { container } = renderMissions({
      currentMember: viewer({ image: "https://example.com/me.png" }),
      members: [makeMember({ publicId: "known", image: "https://example.com/known.png" })],
      missions: [
        makeMission({ id: `k1-${counter}`, stationOwnerMemberId: "known", stationOwnerName: "Known" }),
        makeMission({ id: `k2-${counter}`, stationOwnerMemberId: "me", stationOwnerName: "Me" }),
      ],
    });
    expect(container.querySelector('img[src="https://example.com/known.png"]')).not.toBeNull();
    expect(container.querySelector('img[src="https://example.com/me.png"]')).not.toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/members"))).toBe(false);
  });

  it.each([
    ["a non-list body", () => new Response(JSON.stringify({ images: [] }))],
    [
      "a network error",
      () => {
        throw new TypeError("offline");
      },
    ],
  ])("keeps initials when the members API returns %s", async (_label, members) => {
    const fetchMock = stubFetch((url) =>
      url.startsWith("/api/members") ? members() : new Response(JSON.stringify({ note: "" })),
    );
    renderMissions({
      missions: [makeMission({ id: `j-${counter}`, stationOwnerMemberId: "disc", stationOwnerName: "Disc" })],
    });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/members"))).toBe(true),
    );
    expect(screen.getByRole("button", { name: "Disc" })).toHaveTextContent("DIDisc");
  });

  it("drops discoverer images that arrive after the list unmounts", async () => {
    let respond: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/members"))
        return new Promise<Response>((resolve) => {
          respond = resolve;
        });
      if (url.startsWith("/api/missions/planet?")) return Promise.resolve(new Response("{}", { status: 404 }));
      return Promise.resolve(new Response(JSON.stringify({ note: "" })));
    });
    vi.stubGlobal("fetch", fetchMock);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = renderMissions({
      missions: [makeMission({ id: `u-${counter}`, stationOwnerMemberId: "disc", stationOwnerName: "Disc" })],
    });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/members"))).toBe(true),
    );
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/members")) as unknown as [
      string,
      RequestInit,
    ];
    unmount();
    expect(init.signal?.aborted).toBe(true);
    respond(new Response(JSON.stringify([{ publicId: "disc", image: "https://example.com/disc.png" }])));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("shows mission notes in a dialog to the assignee", async () => {
    const { user } = renderMissions({
      missions: [
        makeMission({
          id: `a-${counter}`,
          title: "Mine",
          notes: "Bring fuel",
          assignedMemberId: "me",
          assignedTo: "Me",
        }),
      ],
    });
    await user.click(screen.getByRole("button", { name: "View notes for Mine" }));
    expect(screen.getByRole("dialog", { name: "Mission notes" })).toHaveTextContent("Bring fuel");
  });

  it("ignores a failed discoverer image request", async () => {
    const fetchMock = stubFetch((url) =>
      url.startsWith("/api/members") ? new Response("[]", { status: 500 }) : new Response(JSON.stringify({ note: "" })),
    );
    renderMissions({
      missions: [makeMission({ id: `f-${counter}`, stationOwnerMemberId: "disc", stationOwnerName: "Disc" })],
    });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/members"))).toBe(true),
    );
    expect(screen.getByRole("button", { name: "Disc" })).toHaveTextContent("DIDisc");
  });
});

describe("PlanetList", () => {
  const renderedAt = Date.parse("2026-10-11T00:00:00.000Z");

  function planet(overrides: Partial<PlanetDestination> = {}): PlanetDestination {
    return {
      id: "p1",
      portal: "0123456789AB",
      planetPortal: "1123456789AB",
      planetNumber: 1,
      galaxy: 0,
      almanacSearchIndex: "",
      almanacFacts: [],
      systemFacts: [],
      plants: [],
      minerals: [],
      valuables: [],
      dissonant: false,
      paradise: false,
      blackMarket: false,
      ...overrides,
    };
  }

  it("groups planets under their station and opens a planet", async () => {
    const onOpen = vi.fn();
    const first = planet({ id: "a", almanacName: "Alpha" });
    const { user } = renderWithLocale(
      <PlanetList
        groups={[
          {
            station: { id: "owner:0123456789AB:0", portal: "0123456789AB", galaxy: 0, name: "Haven" },
            planets: [first, planet({ id: "b", planetNumber: 2 })],
          },
          { station: undefined, planets: [planet({ id: "c", planetNumber: 3 })] },
        ]}
        onOpen={onOpen}
        renderedAt={renderedAt}
      />,
    );
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Haven",
      "No associated space station",
    ]);
    expect(screen.getByRole("link", { name: "Open Haven in Stations" })).toHaveAttribute(
      "href",
      "/stations/owner%3A0123456789AB%3A0?from=planets",
    );
    expect(screen.getByText("Euclide")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Alpha/ }));
    expect(onOpen).toHaveBeenCalledWith(first);
    expect(screen.getByRole("button", { name: /Planet 3/ })).toBeInTheDocument();
  });

  it("names a station after its own planet, or generically, in Italian", () => {
    const { unmount } = renderWithLocale(
      <PlanetStationHeading
        planets={[planet({ planetPortal: "0123456789AB", almanacName: "Home" })]}
        renderedAt={renderedAt}
        station={{ id: "s", portal: "0123456789AB", galaxy: 0 }}
      />,
      { locale: "it" },
    );
    expect(screen.getByRole("heading")).toHaveTextContent("Home");
    unmount();
    renderWithLocale(
      <PlanetStationHeading
        planets={[]}
        renderedAt={renderedAt}
        station={{ id: "s", portal: "0123456789AB", galaxy: 3 }}
      />,
      { locale: "it" },
    );
    expect(screen.getByRole("heading")).toHaveTextContent("Stazione spaziale");
    expect(screen.getByRole("link", { name: "Apri 0123456789AB in Stazioni" })).toBeInTheDocument();
    expect(
      screen
        .getByText(/Stazione spaziale/)
        .closest("div")
        ?.querySelector(".mission-galaxy-alert"),
    ).not.toBeNull();
  });

  it("marks new stations and black markets", () => {
    renderWithLocale(
      <PlanetStationHeading
        planets={[planet({ blackMarket: true })]}
        renderedAt={renderedAt}
        station={{ id: "s", portal: "0123456789AB", galaxy: 0, createdAt: "2026-10-09T00:00:00.000Z" }}
      />,
    );
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Black market" })).toBeInTheDocument();
  });

  it("does not mark stations that already have missions as new", () => {
    renderWithLocale(
      <PlanetStationHeading
        planets={[]}
        renderedAt={renderedAt}
        station={{
          id: "s",
          portal: "0123456789AB",
          galaxy: 0,
          createdAt: "2026-10-09T00:00:00.000Z",
          hasMissions: true,
        }}
      />,
    );
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });

  it("shows system facts with race, economy and conflict indicators", () => {
    renderWithLocale(
      <PlanetStationHeading
        planets={[
          planet({
            economyStars: 2,
            systemFacts: [
              { label: "common.race", value: "Gek" },
              { label: "common.economy", value: "Trading" },
              { label: "common.conflict", value: "High" },
              { label: "planet.weather", value: "Humid" },
            ],
          }),
        ]}
        renderedAt={renderedAt}
        station={undefined}
      />,
    );
    expect(screen.getByRole("img", { name: "Gek" })).toHaveClass("planet-race-icon");
    expect(screen.getByLabelText("2/3")).toHaveTextContent("★★☆");
    const conflict = screen.getByRole("img", { name: "High" });
    expect(conflict.querySelectorAll("i.filled")).toHaveLength(3);
    expect(screen.getByText("Weather").parentElement).toHaveTextContent("Weather Humid");
    expect(screen.getByText("Economy").parentElement).toHaveTextContent("Trading");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows a placeholder for unknown races", () => {
    renderWithLocale(
      <PlanetStationHeading
        planets={[planet({ systemFacts: [{ label: "common.race", value: "Unknown" }] })]}
        renderedAt={renderedAt}
        station={undefined}
      />,
    );
    expect(screen.getByRole("img", { name: "Unknown" })).toHaveTextContent("-");
  });
});

describe("StationList", () => {
  const station = (overrides: Partial<StationEntry> = {}): StationEntry => ({
    portal: "0123456789AB",
    galaxy: 0,
    ownerId: "owner",
    ownerName: "Owner",
    planet: null,
    hasMissions: false,
    canOpenOwnSpecialtyMission: false,
    hasAssignedMission: false,
    missionStatus: "none",
    availableSpecialties: [],
    ...overrides,
  });
  const stationCounts: Record<StationFilter, number> = {
    all: 2,
    pending: 1,
    in_progress: 1,
    my_missions: 0,
    completed: 0,
    notes: 1,
  };

  function renderStations(overrides: Partial<Parameters<typeof StationList>[0]> = {}, locale: Locale = "en") {
    const stations = [station({ name: "One" }), station({ name: "Two", portal: "1123456789AB" })];
    const props: Parameters<typeof StationList>[0] = {
      stations,
      visibleStations: stations,
      loading: false,
      member: makeMember({ publicId: "viewer", simpleView: false }),
      canSeeAll: false,
      canCreateMissions: false,
      canChooseStationView: false,
      renderedAt: Date.parse("2026-10-11T00:00:00.000Z"),
      activeStationTab: "all",
      onTabChange: vi.fn(),
      stationFilter: "all",
      onFilterChange: vi.fn(),
      stationCounts,
      visibleStationFilters: ["all", "pending", "in_progress", "my_missions", "completed", "notes"],
      ownStationCount: 1,
      search: "",
      onSearchChange: vi.fn(),
      exportingStations: false,
      onExport: vi.fn(),
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
    return { props, ...renderWithLocale(<StationList {...props} />, { locale }) };
  }

  it("lists stations with filter tabs and search", async () => {
    const { user, props } = renderStations();
    expect(screen.getByRole("region", { name: "My space stations" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "All2",
      "Pending1",
      "In mission1",
      "My missions0",
      "Mission completed0",
      "With notes1",
    ]);
    expect(screen.getByRole("tab", { name: "All2" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: "Export to Excel" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "With notes1" }));
    expect(props.onTabChange).toHaveBeenCalledWith("all");
    expect(props.onFilterChange).toHaveBeenCalledWith("notes");
    await user.click(screen.getByRole("tab", { name: "All2" }));
    expect(props.onFilterChange).toHaveBeenLastCalledWith("all");
    await user.type(
      screen.getByRole("textbox", { name: "Search stations by portal, owner's username, galaxy, or notes" }),
      "z",
    );
    expect(props.onSearchChange).toHaveBeenCalledWith("z");
  });

  it("paginates stations after 50 and resets after changing tabs", async () => {
    const stations = Array.from({ length: 51 }, (_, index) =>
      station({ portal: index.toString(16).toUpperCase().padStart(12, "0"), name: `Station ${index}` }),
    );
    const { user, props, rerender } = renderStations({ stations, visibleStations: stations });
    expect(screen.getAllByRole("listitem")).toHaveLength(50);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getAllByText("Station 50").length).toBeGreaterThan(0);
    rerender(<StationList {...props} activeStationTab="mine" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(50);
  });

  it("offers the My stations tab when the viewer can choose", async () => {
    const { user, props } = renderStations({
      canChooseStationView: true,
      activeStationTab: "mine",
      visibleStationFilters: ["all"],
    });
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["All2", "My stations1"]);
    expect(screen.getByRole("tab", { name: "My stations1" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "All2" })).toHaveAttribute("aria-selected", "false");
    await user.click(screen.getByRole("tab", { name: "My stations1" }));
    expect(props.onTabChange).toHaveBeenCalledWith("mine");
    expect(props.onFilterChange).not.toHaveBeenCalled();
  });

  it("lets moderators export, and shows export progress", async () => {
    const { user, props, rerender } = renderStations({ canSeeAll: true });
    await user.click(screen.getByRole("button", { name: "Export to Excel" }));
    expect(props.onExport).toHaveBeenCalledTimes(1);
    rerender(<StationList {...props} exportingStations />);
    expect(screen.getByRole("button", { name: "Exporting…" })).toBeDisabled();
  });

  it("shows a spinner while loading", () => {
    renderStations({ loading: true, stations: [], visibleStations: [] });
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("No saved portals.")).not.toBeInTheDocument();
  });

  it("distinguishes no saved portals from no matches, in Italian", () => {
    const { unmount } = renderStations({ stations: [], visibleStations: [] }, "it");
    expect(screen.getByText("Nessun portale salvato.")).toBeInTheDocument();
    unmount();
    renderStations({ visibleStations: [] }, "it");
    expect(screen.getByText("Nessuna stazione trovata.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Le mie stazioni spaziali" })).toBeInTheDocument();
  });
});
