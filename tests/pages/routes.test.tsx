import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HelpRequestsRoute from "@/app/help-requests/page";
import RootLayout, { metadata } from "@/app/layout";
import LeaderboardRoute from "@/app/leaderboard/page";
import Loading from "@/app/loading";
import MemberGuideRoute from "@/app/member-guide/page";
import MessagesRoute from "@/app/messages/page";
import MissionsRoute from "@/app/missions/page";
import OfflinePlayersRoute from "@/app/offline-players/page";
import Home from "@/app/page";
import PlanetsRoute from "@/app/planets/page";
import StationsRoute from "@/app/stations/page";
import UsersPage from "@/app/users/page";
import { GuideAppPage } from "@/components/pages/guide-app-page";
import { HelpRequestsPage } from "@/components/pages/help-requests-page";
import { LeaderboardPage, type LeaderboardBoard } from "@/components/pages/leaderboard-page";
import { LoginScreen } from "@/components/pages/login-screen";
import { MembersPage } from "@/components/pages/members-page";
import { MessagesPage } from "@/components/pages/messages-page";
import { MissionDashboard } from "@/components/pages/mission-dashboard";
import { OfflinePlayersPage } from "@/components/pages/offline-players-page";
import { PendingApproval } from "@/components/pages/pending-approval";
import { PlanetsPage } from "@/components/pages/planets-page";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { StationsPage } from "@/components/pages/stations-page";
import type { AllianceMember } from "@/lib/member-types";
import { readMissions, writeMissions } from "@/lib/store";
import { readAllStationPortals, readStationPortals, type OwnedStationPortal } from "@/lib/stations-store";
import { lookupAlmanacPlanets } from "@/lib/almanac-lookup";
import { readPlanetSystemStatuses } from "@/lib/planet-system-status-store";
import { readAlmanacCache } from "@/lib/almanac-store";
import { signInAs } from "../helpers/auth";
import { makeMember, seedMembers } from "../helpers/members";
import { makeMission } from "./helpers";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("@/lib/nms-core/system.js", async () => (await import("./helpers")).nmsCoreModule);
vi.mock("@/lib/store", () => ({ readMissions: vi.fn(async () => []), writeMissions: vi.fn(async () => undefined) }));
vi.mock("@/lib/stations-store", () => ({
  readAllStationPortals: vi.fn(async () => []),
  readStationPortals: vi.fn(async () => []),
}));
vi.mock("@/lib/planet-system-status-store", () => ({ readPlanetSystemStatuses: vi.fn(async () => ({})) }));
vi.mock("@/lib/almanac-store", () => ({ readAlmanacCache: vi.fn(async () => () => null) }));
vi.mock("@/lib/almanac-lookup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/almanac-lookup")>()),
  lookupAlmanacPlanets: vi.fn(async () => new Map()),
}));

type Props = Record<string, unknown>;
const props = (element: ReactElement) => element.props as Props;

const id = {
  admin: "00000000-0000-4000-8000-000000000001",
  mod: "00000000-0000-4000-8000-000000000002",
  user: "00000000-0000-4000-8000-000000000003",
  builder: "00000000-0000-4000-8000-000000000004",
  plain: "00000000-0000-4000-8000-000000000005",
  pending: "00000000-0000-4000-8000-000000000006",
  blocked: "00000000-0000-4000-8000-000000000007",
  offline: "00000000-0000-4000-8000-000000000008",
} as const;

const admin = makeMember({
  publicId: id.admin,
  email: "root-admin@example.com",
  name: "Root",
  role: "admin",
  simpleView: false,
});
const moderator = makeMember({
  publicId: id.mod,
  email: "mod@example.com",
  name: "Mod",
  role: "moderator",
  simpleView: false,
});
const user = makeMember({
  publicId: id.user,
  email: "user@example.com",
  name: "User",
  role: "user",
  specialty: "explorer",
});
const builder = makeMember({
  publicId: id.builder,
  email: "builder@example.com",
  name: "Builder",
  role: "user",
  specialty: "builder",
});
const plainUser = makeMember({
  publicId: id.plain,
  email: "plain@example.com",
  name: "Plain",
  role: "user",
  specialty: "",
});
const pending = makeMember({
  publicId: id.pending,
  email: "pending@example.com",
  name: "Pending",
  membershipStatus: "pending",
});
const blocked = makeMember({
  publicId: id.blocked,
  email: "blocked@example.com",
  name: "Blocked",
  membershipStatus: "blocked",
});
const offline = makeMember({ publicId: id.offline, email: "offline@example.com", name: "Offline", offline: true });

const stationList: OwnedStationPortal[] = [
  { portal: "1234567890AB", galaxy: 0, ownerId: id.user, name: "Home Base", createdAt: "2026-01-02T00:00:00.000Z" },
  { portal: "1234567890AC", galaxy: 0, ownerId: id.builder },
];

function signIn(member: Pick<AllianceMember, "email" | "name" | "image">) {
  signInAs({ email: member.email, name: member.name, image: member.image });
}

beforeEach(() => {
  seedMembers([admin, moderator, user, builder, plainUser, pending, blocked, offline]);
  vi.mocked(readMissions).mockResolvedValue([]);
  vi.mocked(readAllStationPortals).mockResolvedValue(stationList);
  vi.mocked(readStationPortals).mockResolvedValue([stationList[0]]);
});

const sectionRoutes: [string, () => Promise<ReactElement>, unknown][] = [
  ["missions", () => MissionsRoute({ searchParams: Promise.resolve({}) }), MissionDashboard],
  ["stations", () => StationsRoute({ searchParams: Promise.resolve({}) }), StationsPage],
  ["messages", () => MessagesRoute(), MessagesPage],
  ["help requests", () => HelpRequestsRoute(), HelpRequestsPage],
  ["planets", () => PlanetsRoute(), PlanetsPage],
  ["leaderboard", () => LeaderboardRoute(), LeaderboardPage],
  ["users", () => UsersPage(), MembersPage],
  ["offline players", () => OfflinePlayersRoute(), OfflinePlayersPage],
  ["member guide", () => MemberGuideRoute(), GuideAppPage],
];

describe.each(sectionRoutes)("%s route", (_name, route, Page) => {
  it("shows the login screen with the missing configuration", async () => {
    const element = await route();
    expect(element.type).toBe(LoginScreen);
    expect(props(element)).toMatchObject({
      allianceName: "Test Alliance",
      missingConfiguration: ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ALLIANCE_ADMIN_EMAIL"],
    });
  });

  it("shows the login screen without a session", async () => {
    signInAs(null);
    const element = await route();
    expect(element.type).toBe(LoginScreen);
    expect(props(element).missingConfiguration).toBeUndefined();
  });

  it("shows the login screen to offline profiles", async () => {
    signIn(offline);
    expect((await route()).type).toBe(LoginScreen);
  });

  it.each([pending, blocked])("shows the pending screen to $membershipStatus members", async (member) => {
    signIn(member);
    const element = await route();
    expect(element.type).toBe(PendingApproval);
    expect((props(element).member as AllianceMember).publicId).toBe(member.publicId);
  });

  it("renders the page for an approved moderator", async () => {
    signIn(moderator);
    const element = await route();
    expect(element.type).toBe(Page);
    expect((props(element).currentMember as AllianceMember).publicId).toBe(id.mod);
  });

  it("renders the page after registering a first-time admin", async () => {
    seedMembers([]);
    signInAs({ email: "root-admin@example.com", name: "Root", image: "" });
    const element = await route();
    expect(element.type).toBe(Page);
    expect(props(element).currentMember).toMatchObject({ role: "admin", membershipStatus: "approved" });
  });
});

describe("home route", () => {
  it("redirects to the stations, or to the missions search", async () => {
    await expect(Home({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT:/stations");
    await expect(Home({ searchParams: Promise.resolve({ search: "Alpha Base" }) })).rejects.toThrow(
      "NEXT_REDIRECT:/missions?search=Alpha%20Base",
    );
    await expect(Home({ searchParams: Promise.resolve({ search: ["a", "b"] }) })).rejects.toThrow(
      "NEXT_REDIRECT:/stations",
    );
  });
});

describe("layout and loading", () => {
  it("wraps pages in the providers with Italian as the server language", () => {
    expect(metadata.title).toBe("NMS Alliance Manager");
    const html = renderToStaticMarkup(
      <RootLayout>
        <p>Content</p>
      </RootLayout>,
    );
    expect(html).toContain('<html lang="it">');
    expect(html).toContain("<p>Content</p>");
  });

  it("shows a spinner while loading", () => {
    expect(
      renderToStaticMarkup(
        <LocaleProvider>
          <Loading />
        </LocaleProvider>,
      ),
    ).toContain("route-loading");
  });
});

describe("users and offline players routes", () => {
  it.each([
    ["users", UsersPage],
    ["offline players", OfflinePlayersRoute],
  ] as const)("redirect normal users away from %s", async (_name, route) => {
    signIn(user);
    await expect(route()).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("passes member activity and sidebar counts", async () => {
    vi.mocked(readMissions).mockResolvedValue([
      makeMission({ id: "m1", assignedMemberId: id.user, createdByMemberId: id.mod, stationOwnerMemberId: id.builder }),
      makeMission({ id: "m2" }),
    ]);
    signIn(admin);
    const element = await UsersPage();
    expect(props(element)).toMatchObject({
      missionCount: 2,
      sidebarStationCount: 2,
      sidebarOfflineCount: 1,
      sidebarUserCount: 7,
    });
    const activity = props(element).memberActivity as { missionOwnerIds: string[]; stationOwnerIds: string[] };
    expect(activity.missionOwnerIds.sort()).toEqual([id.builder, id.mod, id.user].sort());
    expect(activity.stationOwnerIds.sort()).toEqual([id.builder, id.user].sort());

    const offlineElement = await OfflinePlayersRoute();
    expect(props(offlineElement)).toMatchObject({ missionCount: 2, sidebarOfflineCount: 1 });
  });
});

describe("missions route", () => {
  it("trims the search and hides the moderator counters from users", async () => {
    signIn(user);
    const element = await MissionsRoute({ searchParams: Promise.resolve({ search: "x".repeat(100) }) });
    expect(props(element)).toMatchObject({
      initialSearch: "x".repeat(80),
      sidebarStationCount: 1,
      sidebarOfflineCount: undefined,
      sidebarUserCount: undefined,
    });
    expect(readStationPortals).toHaveBeenCalledWith(id.user);
  });

  it("gives moderators all stations and the member counters", async () => {
    signIn(moderator);
    const element = await MissionsRoute({ searchParams: Promise.resolve({ search: ["a"] }) });
    expect(props(element)).toMatchObject({
      initialSearch: "",
      sidebarStationCount: 2,
      sidebarOfflineCount: 1,
      sidebarUserCount: 7,
    });
  });
});

describe("stations route", () => {
  const query = (params: Record<string, string>) => ({ searchParams: Promise.resolve(params) });

  it("opens the create dialog for moderators with a valid portal", async () => {
    signIn(moderator);
    const element = await StationsRoute(
      query({ createStation: "1", portal: "1234567890ab", galaxy: "3", ownerId: id.user, search: "s" }),
    );
    expect(props(element)).toMatchObject({
      initialSearch: "s",
      initialCreateStation: { portal: "1234567890AB", galaxy: 3, ownerId: id.user },
      initialStation: null,
    });
  });

  it("falls back to the moderator as owner when the requested owner is not approved", async () => {
    signIn(moderator);
    const element = await StationsRoute(
      query({ createStation: "1", portal: "1234567890AB", galaxy: "0", ownerId: id.pending }),
    );
    expect(props(element).initialCreateStation).toEqual({ portal: "1234567890AB", galaxy: 0, ownerId: id.mod });
  });

  it("ignores the create request from users and focuses the station instead", async () => {
    signIn(user);
    const element = await StationsRoute(
      query({ createStation: "1", portal: "1234567890AB", galaxy: "0", ownerId: id.builder }),
    );
    expect(props(element)).toMatchObject({
      initialCreateStation: null,
      initialStation: { portal: "1234567890AB", galaxy: 0, ownerId: id.builder },
      sidebarStationCount: 2,
    });
  });

  it("ignores invalid portal parameters and limits members without specialty to their own stations", async () => {
    signIn(plainUser);
    const element = await StationsRoute(query({ portal: "XYZ", galaxy: "999", ownerId: id.builder }));
    expect(props(element)).toMatchObject({ initialCreateStation: null, initialStation: null, sidebarStationCount: 1 });
    expect(readStationPortals).toHaveBeenCalledWith(id.plain);
  });
});

describe("messages and help requests routes", () => {
  it.each([
    ["messages", MessagesRoute],
    ["help requests", HelpRequestsRoute],
  ] as const)("passes the %s counters by role", async (_name, route) => {
    vi.mocked(readMissions).mockResolvedValue([makeMission()]);
    signIn(user);
    expect(props(await route())).toMatchObject({
      missionCount: 1,
      stationCount: 1,
      offlineCount: undefined,
      userCount: undefined,
    });
    signIn(moderator);
    expect(props(await route())).toMatchObject({ missionCount: 1, stationCount: 2, offlineCount: 1, userCount: 7 });
  });
});

describe("member guide route", () => {
  it("counts all stations and shows the member counters only to moderators", async () => {
    vi.mocked(readMissions).mockResolvedValue([makeMission(), makeMission({ id: "mission-2" })]);
    signIn(user);
    expect(props(await MemberGuideRoute())).toMatchObject({
      missionCount: 2,
      stationCount: 2,
      offlineCount: undefined,
      userCount: undefined,
    });
    signIn(admin);
    expect(props(await MemberGuideRoute())).toMatchObject({
      missionCount: 2,
      stationCount: 2,
      offlineCount: 1,
      userCount: 7,
    });
  });
});

describe("planets route", () => {
  const verdant = {
    lines: {
      headline: { word: "Verdant" },
      band: {
        type: { word: "Lush" },
        size: { word: "Large" },
        star: { word: "Yellow" },
        economy: { word: "Trading", stars: 2.7, black_market: true },
        conflict: { word: "Low" },
        race: { word: "Gek" },
        sentinels: { word: "Corrupted", ink: "exotic" },
      },
    },
    pictures: { disc: "/planets/verdant.png" },
    carries: [
      { name: "Copper", kind: "mineral" },
      { name: "Star Bulb", kind: "plant" },
      { name: "Gold", kind: "tradeable" },
      { name: "Copper", kind: "mineral" },
    ],
    paradise: true,
  };

  it("builds planet destinations from missions, stations and the almanac", async () => {
    const mission = makeMission({
      id: "m1",
      title: "Alpha",
      systemAddress: "1234567890AB",
      system: "",
      createdAt: "2026-01-05T00:00:00.000Z",
    });
    const hidden = makeMission({
      id: "m2",
      title: "Builders only",
      systemAddress: "3234567890AD",
      targetSpecialty: "builder",
    });
    vi.mocked(readMissions).mockResolvedValue([mission, hidden]);
    vi.mocked(lookupAlmanacPlanets).mockImplementation(
      async (targets) =>
        new Map(
          targets.map(({ portal, galaxy }) => [
            `${portal}:${galaxy}`,
            portal === "1234567890AB" ? { planet: verdant, failed: false } : { planet: null, failed: false },
          ]),
        ),
    );
    signIn(user);

    const element = await PlanetsRoute();
    const { planets, almanacLookupFailed, offlineCount } = props(element) as {
      planets: Record<string, unknown>[];
      almanacLookupFailed: boolean;
      offlineCount?: number;
    };
    expect(almanacLookupFailed).toBe(false);
    expect(offlineCount).toBeUndefined();
    expect(planets).toHaveLength(1);
    expect(planets[0]).toMatchObject({
      id: "1234567890AB:0",
      title: "Alpha",
      planetPortal: "1234567890AB",
      planetNumber: 1,
      almanacName: "Verdant",
      imageUrl: "https://nmsalmanac.com/api/planets/verdant.png",
      planetType: "Lush",
      economyStars: 2,
      plants: ["Star Bulb"],
      minerals: ["Copper"],
      valuables: ["Gold"],
      dissonant: true,
      paradise: true,
      blackMarket: true,
      createdAt: "2026-01-02T00:00:00.000Z",
      station: { portal: "1234567890AB", name: "Home Base", hasMissions: true, hasVisibleMissions: true },
    });
    expect(planets[0].almanacSearchIndex).toContain("Verdant");
    expect(planets[0].almanacSearchIndex).not.toContain("Yellow");
    // La missione dei costruttori non è visibile all'esploratore: il pianeta resta senza titolo.
    expect(vi.mocked(lookupAlmanacPlanets).mock.calls[0][0]).toEqual(
      expect.arrayContaining([{ portal: "3234567890AD", galaxy: 0 }]),
    );
    // L'etichetta di sistema vuota viene completata con i dati dell'almanacco.
    expect(writeMissions).toHaveBeenCalledWith([
      expect.objectContaining({ id: "m1", system: "Yellow · Trading · Low · Gek", systemLabelFromAlmanac: true }),
      expect.objectContaining({ id: "m2", system: "" }),
    ]);
  });

  it("marks station links without a pulse when their missions are not visible to the member", async () => {
    const hiddenMission = makeMission({
      id: "hidden-builder-mission",
      systemAddress: "1234567890AB",
      targetSpecialty: "builder",
    });
    vi.mocked(readMissions).mockResolvedValue([hiddenMission]);
    vi.mocked(lookupAlmanacPlanets).mockImplementation(
      async (targets) =>
        new Map(
          targets.map(({ portal, galaxy }) => [
            `${portal}:${galaxy}`,
            portal === "1234567890AB" ? { planet: verdant, failed: false } : { planet: null, failed: false },
          ]),
        ),
    );
    signIn(user);

    const element = await PlanetsRoute();
    const { planets } = props(element) as { planets: Record<string, unknown>[] };
    expect(planets[0]).toMatchObject({
      station: { portal: "1234567890AB", hasMissions: true, hasVisibleMissions: false },
    });
  });

  it("flags failed almanac lookups and keeps the other planets", async () => {
    vi.mocked(lookupAlmanacPlanets).mockImplementation(
      async (targets) =>
        new Map(
          targets.map(({ portal, galaxy }) => [
            `${portal}:${galaxy}`,
            portal.startsWith("1") ? { planet: verdant, failed: false } : { planet: null, failed: true },
          ]),
        ),
    );
    signIn(moderator);

    const element = await PlanetsRoute();
    const { planets, almanacLookupFailed, offlineCount, stationCount } = props(element) as {
      planets: unknown[];
      almanacLookupFailed: boolean;
      offlineCount?: number;
      stationCount: number;
    };
    expect(almanacLookupFailed).toBe(true);
    expect(planets).toHaveLength(2);
    expect(offlineCount).toBe(1);
    expect(stationCount).toBe(2);
    expect(writeMissions).not.toHaveBeenCalled();
  });

  it("tolerates sparse or unreadable almanac entries and a failed label update", async () => {
    vi.mocked(readMissions).mockResolvedValue([
      makeMission({ id: "m1", systemAddress: "1234567890AB", system: "", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeMission({ id: "m2", systemAddress: "1234567890AC", system: "Named", createdAt: "2026-03-01T00:00:00.000Z" }),
    ]);
    const sparse = {
      lines: { band: { economy: { stars: "many" } } },
      pictures: { disc: "https://example.com/disc.png" },
      carries: "none",
      extra: null,
    };
    const unreadable = {
      get lines(): unknown {
        throw new Error("broken entry");
      },
    };
    const almanac: Record<string, Record<string, unknown>> = {
      "1234567890AB": verdant,
      "2234567890AB": sparse,
      "2234567890AC": unreadable,
    };
    vi.mocked(lookupAlmanacPlanets).mockImplementation(
      async (targets) =>
        new Map(
          targets.map(({ portal, galaxy }) => [
            `${portal}:${galaxy}`,
            { planet: almanac[portal] ?? null, failed: false },
          ]),
        ),
    );
    vi.mocked(writeMissions).mockRejectedValueOnce(new Error("disk full"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    signIn(user);

    const element = await PlanetsRoute();
    const { planets, almanacLookupFailed } = props(element) as {
      planets: Record<string, unknown>[];
      almanacLookupFailed: boolean;
    };
    // Solo la missione senza etichetta viene completata; il salvataggio fallito non blocca la pagina.
    expect(writeMissions).toHaveBeenCalledWith([
      expect.objectContaining({ id: "m1", system: "Yellow · Trading · Low · Gek" }),
      expect.objectContaining({ id: "m2", system: "Named" }),
    ]);
    expect(consoleError).toHaveBeenCalledWith("Unable to reconcile mission system labels", expect.any(Error));
    // La voce illeggibile conta come lookup fallito.
    expect(almanacLookupFailed).toBe(true);
    expect(planets.map((planet) => planet.planetPortal)).toEqual(["1234567890AB", "2234567890AB"]);
    // La stazione creata dopo la missione non sposta la data di scoperta.
    expect(planets[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
    const sparsePlanet = planets[1];
    expect(sparsePlanet).toMatchObject({ plants: [], minerals: [], valuables: [], almanacFacts: [], systemFacts: [] });
    for (const key of ["imageUrl", "almanacName", "planetType", "economyStars"])
      expect(sparsePlanet).not.toHaveProperty(key);
    expect(sparsePlanet.almanacSearchIndex).toBe(
      "lines band pictures disc https://example.com/disc.png carries none extra",
    );
  });

  it("limits members without specialty to their own stations", async () => {
    signIn(plainUser);
    await PlanetsRoute();
    expect(readStationPortals).toHaveBeenCalledWith(id.plain);
    expect(readAllStationPortals).not.toHaveBeenCalled();
  });
});

describe("leaderboard route", () => {
  it("credits stations, completed missions and tasks to approved members", async () => {
    vi.mocked(readMissions).mockResolvedValue([
      makeMission({
        id: "m1",
        status: "completed",
        assignedMemberId: id.user,
        targetSpecialty: "explorer",
        systemAddress: "1234567890AB",
      }),
      makeMission({
        id: "m2",
        status: "completed",
        assignedMemberId: id.user,
        targetSpecialty: "builder",
        systemAddress: "1234567890AC",
      }),
      makeMission({ id: "m3", status: "in_progress", assignedMemberId: "ghost", systemAddress: "1234567890AD" }),
    ]);
    vi.mocked(readPlanetSystemStatuses).mockResolvedValue({
      "0:1234567890AB": ["mapped", "station_claimed", "data_error"],
      "0:1234567890AC": ["buildings_built"],
    });
    vi.mocked(readAlmanacCache).mockResolvedValue((portal) => (portal === "1234567890AB" ? {} : null));
    signIn(user);

    const element = await LeaderboardRoute();
    const boards = props(element).boards as LeaderboardBoard[];
    const board = (id: string) => boards.find((item) => item.id === id)!;
    expect(board("alliance_stats").stats).toEqual([
      { label: "leaderboard.stat_stations", value: 2 },
      { label: "leaderboard.stat_missions", value: 3 },
      { label: "leaderboard.stat_missions_completed", value: 2 },
      { label: "leaderboard.stat_tasks", value: 3 },
      { label: "leaderboard.stat_planets", value: 1 },
      { label: "leaderboard.stat_members", value: 5 },
    ]);
    expect(
      board("stations")
        .entries.map((entry) => [entry.publicId, entry.count])
        .sort(),
    ).toEqual(
      [
        [id.builder, 1],
        [id.user, 1],
      ].sort(),
    );
    expect(board("missions").entries.map((entry) => [entry.publicId, entry.count])).toEqual([[id.user, 2]]);
    const section = (role: string, task: string) => board(`${role}_tasks`).sections!.find((item) => item.id === task)!;
    expect(section("explorer", "mapped").entries.map((entry) => entry.publicId)).toEqual([id.user]);
    expect(section("explorer", "mapped").title).toBe("leaderboard.task_mapped");
    // Nessuna missione ranger copre la stazione riscattata: il merito va al proprietario della stazione.
    expect(section("ranger", "station_claimed").entries.map((entry) => entry.publicId)).toEqual([id.user]);
    // La missione costruttori su 1234567890AC dà il merito all'assegnatario, non al proprietario della stazione.
    expect(section("builder", "buildings_built").entries.map((entry) => entry.publicId)).toEqual([id.user]);
    expect(props(element)).toMatchObject({ stationCount: 1, offlineCount: undefined });
  });

  it("credits a task once, names members without NMS name and skips invalid systems", async () => {
    const unnamed = makeMember({ publicId: "00000000-0000-4000-8000-000000000009", nmsName: "", name: "Zed" });
    seedMembers([admin, moderator, user, unnamed]);
    vi.mocked(readAllStationPortals).mockResolvedValue([]);
    vi.mocked(readMissions).mockResolvedValue([
      makeMission({ id: "m1", status: "completed", assignedMemberId: unnamed.publicId, systemAddress: "1234567890AB" }),
      makeMission({ id: "m2", status: "completed", assignedMemberId: id.user, systemAddress: "1234567890AB" }),
      makeMission({ id: "m3", assignedMemberId: id.user, systemAddress: "1234567890AB", galaxy: 1 }),
      makeMission({ id: "m4", systemAddress: "XYZ" }),
    ]);
    vi.mocked(readPlanetSystemStatuses).mockResolvedValue({ "0:1234567890AB": ["mapped"] });
    vi.mocked(readAlmanacCache).mockResolvedValue((_portal, galaxy) => (galaxy === 0 ? {} : null));
    signIn(moderator);

    const boards = props(await LeaderboardRoute()).boards as LeaderboardBoard[];
    const board = (boardId: string) => boards.find((item) => item.id === boardId)!;
    const mapped = board("explorer_tasks").sections!.find((item) => item.id === "mapped")!;
    expect(mapped.entries.map((entry) => [entry.publicId, entry.name, entry.count])).toEqual([
      [unnamed.publicId, "Zed", 1],
    ]);
    expect(board("missions").entries.map((entry) => [entry.name, entry.count])).toEqual([
      [user.nmsName, 1],
      ["Zed", 1],
    ]);
    // L'indirizzo non valido non blocca il conteggio: restano i due pianeti in cache del sistema in Euclid.
    expect(board("alliance_stats").stats).toContainEqual({ label: "leaderboard.stat_planets", value: 2 });
  });
});
