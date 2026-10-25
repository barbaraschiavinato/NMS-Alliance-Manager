// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionDashboard } from "@/components/pages/mission-dashboard";
import type { AllianceMember } from "@/lib/members/access-store";
import type { Mission } from "@/lib/missions/missions";
import { defaultAlliance, makeMember } from "../helpers/members";
import { type FetchCall, json, makeMission, mockFetch, renderPage, t } from "./helpers";

vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);
vi.mock("@/lib/nms-core/system.js", async () => (await import("./helpers")).nmsCoreModule);

const explorer = makeMember({
  publicId: "explorer-1",
  nmsName: "Scout",
  specialty: "explorer",
  role: "user",
  simpleView: true,
});
const moderator = makeMember({
  publicId: "moderator-1",
  nmsName: "Warden",
  specialty: "ranger",
  role: "moderator",
  simpleView: false,
});

const explorerTasks = ["mapped", "planets_classified", "data_uploaded"];
const builderTasks = ["buildings_built", "bases_uploaded"];
const rangerTasks = ["station_claimed", "renamed"];

// fetch che fallisce con un valore che non è un Error (es. rete interrotta in modo anomalo).
const rejectWith = (value: unknown) => () => Promise.reject(value);

function dashboardRoutes(missions: Mission[], overrides: Record<string, unknown> = {}) {
  return {
    "GET /api/missions": missions,
    "/api/missions/covered": { covered: {} },
    "GET /api/planet-status": { planets: {} },
    "/api/members": [],
    "/api/stations": { stations: [] },
    ...overrides,
  };
}

function renderDashboard(member: AllianceMember = explorer) {
  return renderPage(<MissionDashboard alliance={defaultAlliance} currentMember={member} sidebarStationCount={0} />);
}

function missionCard(title: string) {
  const card = screen.getByRole("link", { name: title }).closest("article");
  if (!card) throw new Error(`No card for ${title}`);
  return card;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MissionDashboard loading failures", () => {
  it("falls back to the generic message when the missions request rejects with a non-Error", async () => {
    mockFetch(dashboardRoutes([], { "GET /api/missions": rejectWith("offline") }));
    renderDashboard();

    expect(await screen.findByText(t("Unable to load missions."))).toBeInTheDocument();
  });

  it.each([
    ["a failed response", json({}, 500)],
    ["a non-Error rejection", rejectWith("offline")],
  ])("reports unreadable planet status after %s", async (_label, route) => {
    mockFetch(dashboardRoutes([], { "GET /api/planet-status": route }));
    renderDashboard();

    expect(await screen.findByText(t("Unable to read planet status."))).toBeInTheDocument();
  });

  it.each([
    ["failed responses", json({}, 500), json({}, 500)],
    ["an invalid stations body", [], { stations: "nope" }],
    ["rejected requests", rejectWith("offline"), rejectWith("offline")],
  ])("hides the station links and shows no error after %s", async (_label, membersRoute, stationsRoute) => {
    const { requests } = mockFetch(
      dashboardRoutes([makeMission({ id: "m-a", title: "Alpha" })], {
        "/api/members": membersRoute,
        "/api/stations": stationsRoute,
      }),
    );
    renderDashboard(moderator);

    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    await waitFor(() => expect(requests("GET", "/api/stations")).toHaveLength(1));
    expect(requests("GET", "/api/members")).toHaveLength(1);
    await flush();
    expect(screen.queryByRole("link", { name: t("stations.create_station_from_mission") })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: t("missions.open_linked_station") })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("skips empty station entries and still offers to create the station", async () => {
    mockFetch(dashboardRoutes([makeMission({ id: "m-a", title: "Alpha" })], { "/api/stations": { stations: [null] } }));
    renderDashboard(moderator);

    expect(await screen.findByRole("link", { name: t("stations.create_station_from_mission") })).toHaveAttribute(
      "href",
      "/stations?createStation=1&portal=1234567890AB&galaxy=0",
    );
  });
});

describe("MissionDashboard status tabs", () => {
  it("separates assigned and unassigned pending missions", async () => {
    mockFetch(
      dashboardRoutes([
        makeMission({ id: "m-free", title: "Free one" }),
        makeMission({
          id: "m-mine",
          title: "Mine waiting",
          assignedMemberId: explorer.publicId,
          assignedTo: "Scout",
          systemAddress: "1234567890AC",
        }),
        makeMission({
          id: "m-run",
          title: "Running",
          status: "in_progress",
          assignedMemberId: explorer.publicId,
          assignedTo: "Scout",
          systemAddress: "1234567890AD",
        }),
      ]),
    );
    const { user } = renderDashboard();

    expect(await screen.findByText("Running")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: new RegExp(t("missions.pending_assigned")) }));
    expect(screen.getByText("Mine waiting")).toBeInTheDocument();
    expect(screen.queryByText("Free one")).not.toBeInTheDocument();
    expect(screen.queryByText("Running")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: new RegExp(t("missions.pending_unassigned")) }));
    expect(screen.getByText("Free one")).toBeInTheDocument();
    expect(screen.queryByText("Mine waiting")).not.toBeInTheDocument();
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
  });
});

type ActionCase = Readonly<{
  action: string;
  mission: Mission;
  button: string;
  method: string;
  path: string;
  fallback: string;
}>;

const actionCases: ActionCase[] = [
  {
    action: "claim",
    mission: makeMission({ id: "m-x" }),
    button: "missions.claim",
    method: "POST",
    path: "/api/missions/m-x/claim",
    fallback: "Unable to claim the mission.",
  },
  {
    action: "start",
    mission: makeMission({ id: "m-x", assignedMemberId: explorer.publicId, assignedTo: "Scout" }),
    button: "missions.start_mission",
    method: "PATCH",
    path: "/api/missions/m-x",
    fallback: "Unable to start the mission.",
  },
  {
    action: "complete",
    mission: makeMission({
      id: "m-x",
      status: "in_progress",
      progress: 80,
      assignedMemberId: explorer.publicId,
      assignedTo: "Scout",
    }),
    button: "missions.complete_mission",
    method: "PATCH",
    path: "/api/missions/m-x",
    fallback: "Unable to complete the mission.",
  },
  {
    action: "reopen",
    mission: makeMission({
      id: "m-x",
      status: "completed",
      progress: 100,
      assignedMemberId: explorer.publicId,
      assignedTo: "Scout",
      targetSpecialty: "explorer",
    }),
    button: "missions.reopen_mission",
    method: "PATCH",
    path: "/api/missions/m-x",
    fallback: "Unable to reopen the mission.",
  },
];

const failureCases = [
  ["the API error", () => json({ error: "Custom failure." }, 409), "Custom failure."],
  ["the fallback message", () => json({}, 500), null],
  ["the generic message on a non-Error rejection", () => Promise.reject("offline"), "errors.request_failed"],
] as const;

describe("MissionDashboard mission action failures", () => {
  describe.each(actionCases)("$action", ({ mission, button, method, path, fallback }) => {
    it.each(failureCases)("shows %s", async (_label, respond, expected) => {
      const { requests } = mockFetch(
        dashboardRoutes([mission], {
          // Tutte le voci (esploratore e costruttore): completa abilitata, nessuna richiesta di nuova missione.
          "GET /api/planet-status": { planets: { "0:1234567890AB": [...explorerTasks, ...builderTasks] } },
          [`${method} ${path}`]: respond,
        }),
      );
      const { user } = renderDashboard();

      await user.click(await screen.findByRole("button", { name: t(button) }));

      expect(await screen.findByText(t(expected ?? fallback))).toBeInTheDocument();
      expect(requests(method, path)).toHaveLength(1);
    });
  });
});

describe("MissionDashboard progress slider", () => {
  const active = makeMission({
    id: "m-active",
    title: "Active one",
    status: "in_progress",
    progress: 10,
    assignedMemberId: explorer.publicId,
    assignedTo: "Scout",
  });

  function moveSlider(value: number) {
    const slider = screen.getByRole("slider", { name: t("missions.progress_for_mission", { title: "Active one" }) });
    fireEvent.change(slider, { target: { value: String(value) } });
    fireEvent.keyUp(slider);
  }

  it("completes the mission when the progress reaches 100", async () => {
    const { requests } = mockFetch(
      dashboardRoutes([active], {
        "PATCH /api/missions/m-active": { ...active, status: "completed", progress: 100 },
      }),
    );
    renderDashboard();
    await screen.findByText("Active one");

    moveSlider(100);

    expect(await screen.findByRole("button", { name: t("missions.reopen_mission") })).toBeInTheDocument();
    expect(requests("PATCH", "/api/missions/m-active")[0].body).toEqual({ status: "completed", progress: 100 });
  });

  it("saves intermediate progress as in progress", async () => {
    const { requests } = mockFetch(
      dashboardRoutes([active, makeMission({ id: "m-other", title: "Other one", systemAddress: "1234567890AC" })], {
        "PATCH /api/missions/m-active": { ...active, progress: 50 },
      }),
    );
    renderDashboard();
    await screen.findByText("Active one");

    moveSlider(50);

    await waitFor(() => expect(requests("PATCH", "/api/missions/m-active")).toHaveLength(1));
    expect(requests("PATCH", "/api/missions/m-active")[0].body).toEqual({ status: "in_progress", progress: 50 });
    expect(await screen.findByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Other one")).toBeInTheDocument();
  });

  it.each([
    ["the API error", () => json({ error: "Progress locked." }, 403), "Progress locked."],
    ["a generic error without a message", () => json({}, 500), "errors.update_failed"],
    ["a generic error for another mission", () => json({ ...active, id: "m-other" }), "errors.update_failed"],
    ["a generic error for an empty body", () => json(null), "errors.update_failed"],
    ["a generic error with a non-string message", () => json({ error: 42 }, 500), "errors.update_failed"],
    ["the request error on a non-Error rejection", () => Promise.reject("offline"), "errors.request_failed"],
  ])("shows %s and restores the saved progress", async (_label, respond, expected) => {
    mockFetch(dashboardRoutes([active], { "PATCH /api/missions/m-active": respond }));
    renderDashboard();
    await screen.findByText("Active one");

    moveSlider(60);

    expect(await screen.findByText(t(expected))).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
  });
});

describe("MissionDashboard planet tasks", () => {
  function activeMission(overrides: Partial<Mission> = {}) {
    return makeMission({
      id: "m-active",
      title: "Active one",
      status: "in_progress",
      progress: 27,
      assignedMemberId: explorer.publicId,
      assignedTo: "Scout",
      ...overrides,
    });
  }

  it("lowers the mission progress to the new floor when a task is unchecked", async () => {
    const mission = activeMission();
    const { requests } = mockFetch(
      dashboardRoutes([mission], {
        "GET /api/planet-status": { planets: { "0:1234567890AB": ["mapped"] } },
        "PATCH /api/planet-status": { systemStatuses: [] },
        "PATCH /api/missions/m-active": { ...mission, progress: 0 },
      }),
    );
    const { user } = renderDashboard();

    const mapped = await screen.findByRole("checkbox", { name: t("mapped") });
    await waitFor(() => expect(mapped).toBeChecked());
    await user.click(mapped);

    await waitFor(() => expect(requests("PATCH", "/api/missions/m-active")).toHaveLength(1));
    expect(requests("PATCH", "/api/planet-status")[0].body).toMatchObject({ systemStatuses: [] });
    expect(requests("PATCH", "/api/missions/m-active")[0].body).toEqual({ status: "in_progress", progress: 0 });
    expect(screen.getByRole("checkbox", { name: t("mapped") })).not.toBeChecked();
  });

  it("keeps the progress when it is already above the task floor", async () => {
    const { requests } = mockFetch(
      dashboardRoutes([activeMission({ progress: 60 })], {
        "PATCH /api/planet-status": { systemStatuses: ["mapped"] },
      }),
    );
    const { user } = renderDashboard();

    await user.click(await screen.findByRole("checkbox", { name: t("mapped") }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: t("mapped") })).toBeChecked());
    expect(requests("PATCH", "/api/planet-status")).toHaveLength(1);
    expect(requests("PATCH", "/api/missions/m-active")).toHaveLength(0);
  });

  it("does not touch the mission progress when a moderator updates the tasks", async () => {
    const mission = activeMission({ assignedMemberId: moderator.publicId, assignedTo: "Warden", progress: 0 });
    const { requests } = mockFetch(
      dashboardRoutes([mission], { "PATCH /api/planet-status": { systemStatuses: ["mapped"] } }),
    );
    const { user } = renderDashboard(moderator);

    await user.click(await screen.findByRole("checkbox", { name: t("mapped") }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: t("mapped") })).toBeChecked());
    expect(requests("PATCH", "/api/missions/m-active")).toHaveLength(0);
  });

  it.each([
    ["the fallback when the API gives no message", () => json({}, 500), "Unable to update planet status."],
    ["an error for a malformed response", () => json({}), "Invalid planet status response."],
    ["an error for an empty response", () => json(null), "Invalid planet status response."],
    ["the request error on a non-Error rejection", () => Promise.reject("offline"), "errors.request_failed"],
  ])("shows %s", async (_label, respond, expected) => {
    mockFetch(dashboardRoutes([activeMission()], { "PATCH /api/planet-status": respond }));
    const { user } = renderDashboard();

    await user.click(await screen.findByRole("checkbox", { name: t("mapped") }));

    expect(await screen.findByText(t(expected))).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: t("mapped") })).not.toBeChecked();
  });
});

describe("MissionDashboard follow-up mission requests", () => {
  it("offers the next specialty only when it is still missing", async () => {
    mockFetch(
      dashboardRoutes(
        [
          makeMission({ id: "m-a", title: "Alpha" }),
          makeMission({ id: "m-b", title: "Beta", targetSpecialty: "builder", systemAddress: "1234567890AC" }),
          makeMission({ id: "m-c", title: "Gamma", systemAddress: "1234567890AD" }),
          makeMission({ id: "m-d", title: "Delta", targetSpecialty: "builder", systemAddress: "1234567890AD" }),
          makeMission({ id: "m-e", title: "Epsilon", systemAddress: "1234567890AE" }),
          makeMission({ id: "m-f", title: "Zeta", systemAddress: "1234567890AF" }),
          makeMission({ id: "m-g", title: "Eta", systemAddress: "1234567890A1" }),
        ],
        {
          "/api/missions/covered": { covered: { "0:1234567890AE": ["builder"] } },
          "GET /api/planet-status": {
            planets: {
              "0:1234567890AB": [...explorerTasks, ...builderTasks],
              "0:1234567890AC": builderTasks,
              "0:1234567890AD": explorerTasks,
              "0:1234567890AE": explorerTasks,
              "0:1234567890AF": [...explorerTasks, ...builderTasks, ...rangerTasks],
            },
          },
        },
      ),
    );
    renderDashboard(moderator);

    await screen.findByText("Zeta");
    expect(
      await within(missionCard("Alpha")).findByRole("button", { name: t("missions.create_ranger_mission") }),
    ).toBeInTheDocument();
    expect(
      within(missionCard("Beta")).getByRole("button", { name: t("missions.create_explorer_mission") }),
    ).toBeInTheDocument();
    for (const title of ["Gamma", "Delta", "Epsilon", "Zeta", "Eta"]) {
      const card = within(missionCard(title));
      for (const key of [
        "missions.create_ranger_mission",
        "missions.create_explorer_mission",
        "missions.create_builder_mission",
      ]) {
        expect(card.queryByRole("button", { name: t(key) })).not.toBeInTheDocument();
      }
    }
  });

  it.each([
    ["fails", json({}, 500)],
    ["rejects", rejectWith("offline")],
  ])("still offers the request when the covered list %s", async (_label, route) => {
    mockFetch(
      dashboardRoutes([makeMission({ id: "m-a", title: "Alpha" })], {
        "/api/missions/covered": route,
        "GET /api/planet-status": { planets: { "0:1234567890AB": explorerTasks } },
      }),
    );
    renderDashboard(moderator);

    expect(await screen.findByRole("button", { name: t("missions.create_builder_mission") })).toBeInTheDocument();
  });

  it("opens a prefilled mission form for a moderator", async () => {
    mockFetch(
      dashboardRoutes([makeMission({ id: "m-a", title: "Alpha" })], {
        "GET /api/planet-status": { planets: { "0:1234567890AB": explorerTasks } },
      }),
    );
    const { user } = renderDashboard({ ...moderator, simpleView: true });

    await user.click(await screen.findByRole("button", { name: t("missions.create_builder_mission") }));

    const dialog = screen.getByRole("dialog", { name: t("missions.new_mission") });
    expect(dialog.querySelector("form")).toHaveClass("mission-form-minimal", "mission-form-simplified");
    expect(within(dialog).getByDisplayValue("Alpha")).toBeInTheDocument();
  });

  it.each([
    ["the API error", () => json({ error: "Quota reached." }, 429), "Quota reached."],
    ["the fallback message", () => json({}, 500), "Unable to save the mission."],
    ["the fallback message on a non-Error rejection", () => Promise.reject("offline"), "Unable to save the mission."],
  ])("shows %s when a member's request cannot be saved", async (_label, respond, expected) => {
    const { requests } = mockFetch(
      dashboardRoutes(
        [
          makeMission({
            id: "m-done",
            title: "Done one",
            status: "completed",
            progress: 100,
            assignedMemberId: explorer.publicId,
            assignedTo: "Scout",
          }),
        ],
        {
          "GET /api/planet-status": { planets: { "0:1234567890AB": explorerTasks } },
          "POST /api/missions": respond,
        },
      ),
    );
    const { user } = renderDashboard();

    await user.click(await screen.findByRole("button", { name: t("missions.create_builder_mission") }));

    expect(await screen.findByText(t(expected))).toBeInTheDocument();
    expect(requests("POST", "/api/missions")).toHaveLength(1);
  });
});

describe("MissionDashboard moderator tools", () => {
  it.each([
    ["the fallback message", () => json({}, 500), "Deletion failed."],
    ["the generic message on a non-Error rejection", () => Promise.reject("offline"), "errors.deletion_failed"],
  ])("shows %s when deletion fails", async (_label, respond, expected) => {
    mockFetch(
      dashboardRoutes([makeMission({ id: "m-del", title: "Doomed" })], { "DELETE /api/missions/m-del": respond }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderDashboard(moderator);

    await user.click(await screen.findByRole("button", { name: `${t("common.delete")} Doomed` }));

    expect(await screen.findByText(t(expected))).toBeInTheDocument();
    expect(screen.getByText("Doomed")).toBeInTheDocument();
  });

  it("shares planet tasks saved from the mission form with the cards", async () => {
    const mission = makeMission({ id: "m-edit", title: "Edited" });
    const { requests } = mockFetch(
      dashboardRoutes([mission], {
        "/api/missions/verify-system": { found: true, systemLabel: "Known system" },
        "GET /api/planet-status": ({ url }: FetchCall) =>
          url.searchParams.has("portal") ? { systemStatuses: [] } : { planets: {} },
        "PATCH /api/planet-status": { systemStatuses: ["mapped"] },
      }),
    );
    const { user } = renderDashboard(moderator);

    await user.click(await screen.findByRole("button", { name: `${t("common.edit")} Edited` }));
    const dialog = screen.getByRole("dialog", { name: t("missions.edit_mission") });
    const mapped = await within(dialog).findByRole("checkbox", { name: t("mapped") });
    await waitFor(() => expect(mapped).toBeEnabled());
    await user.click(mapped);
    await waitFor(() => expect(within(dialog).getByRole("checkbox", { name: t("mapped") })).toBeChecked());
    expect(requests("PATCH", "/api/planet-status")[0].body).toEqual({
      portal: "1234567890AB",
      galaxy: 0,
      systemStatuses: ["mapped"],
    });

    await user.click(within(dialog).getByRole("button", { name: t("common.close") }));
    expect(
      within(missionCard("Edited")).getByRole("group", {
        name: t("missions.system_progress_current_of_total_complete", { current: 1, total: 7 }),
      }),
    ).toBeInTheDocument();
  });

  it("lets an admin edit the alliance settings", async () => {
    const admin = makeMember({ publicId: "admin-1", nmsName: "Chief", role: "admin", simpleView: false });
    const { requests } = mockFetch(
      dashboardRoutes([], {
        "GET /api/alliance": defaultAlliance,
        "PATCH /api/alliance": { ...defaultAlliance, name: "Renamed Alliance" },
      }),
    );
    const { user } = renderDashboard(admin);

    await user.click(screen.getByRole("button", { name: t("admin.alliance_settings") }));
    const dialog = screen.getByRole("dialog", { name: t("admin.alliance") });
    await user.click(within(dialog).getByRole("button", { name: t("admin.save_settings") }));

    await waitFor(() => expect(document.title).toBe("Renamed Alliance"));
    expect(requests("PATCH", "/api/alliance")).toHaveLength(1);

    await user.click(within(dialog).getByRole("button", { name: t("common.close") }));
    expect(screen.queryByRole("dialog", { name: t("admin.alliance") })).not.toBeInTheDocument();
  });
});

describe("MissionDashboard profile panel", () => {
  it("opens and closes the profile panel from the header", async () => {
    mockFetch(dashboardRoutes([]));
    const { user } = renderDashboard();

    await user.click(screen.getByRole("button", { name: t("profile.my_profile") }));
    const dialog = screen.getByRole("dialog", { name: t("profile.my_nms_profile") });
    await user.click(within(dialog).getAllByRole("button", { name: t("common.close") })[0]);

    expect(screen.queryByRole("dialog", { name: t("profile.my_nms_profile") })).not.toBeInTheDocument();
  });

  it("updates the header after the profile is saved", async () => {
    const { requests } = mockFetch(
      dashboardRoutes([], { "PATCH /api/profile": { ...explorer, nmsName: "Pathfinder" } }),
    );
    const { user } = renderDashboard();

    await user.click(screen.getByRole("button", { name: t("profile.my_profile") }));
    const dialog = screen.getByRole("dialog", { name: t("profile.my_nms_profile") });
    await user.click(within(dialog).getByRole("button", { name: t("profile.save_profile") }));

    expect(await screen.findByRole("img", { name: new RegExp("^Pathfinder") })).toBeInTheDocument();
    expect(requests("PATCH", "/api/profile")).toHaveLength(1);
  });
});
