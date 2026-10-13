// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionDashboard } from "@/components/pages/mission-dashboard";
import type { Mission } from "@/lib/missions";
import { defaultAlliance, makeMember } from "../helpers/members";
import { json, makeMission, mockFetch, renderPage, t } from "./helpers";

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

function renderDashboard(member = explorer, props: Partial<Parameters<typeof MissionDashboard>[0]> = {}) {
  return renderPage(
    <MissionDashboard alliance={defaultAlliance} currentMember={member} sidebarStationCount={0} {...props} />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MissionDashboard as a normal user", () => {
  it("shows only the missions the member can see and claims a free one", async () => {
    const free = makeMission({ id: "m-free", title: "Free survey" });
    const builderOnly = makeMission({ id: "m-builder", title: "Builder job", targetSpecialty: "builder" });
    const { requests } = mockFetch(
      dashboardRoutes([free, builderOnly], {
        "POST /api/missions/m-free/claim": { ...free, assignedMemberId: explorer.publicId, assignedTo: "Scout" },
      }),
    );
    const { user } = renderDashboard();

    expect(
      await screen.findByRole("button", { name: `${t("planet.open_planet_details_for")} Free survey` }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Builder job")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("New mission") })).not.toBeInTheDocument();
    expect(requests("GET", "/api/members")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: t("missions.claim") }));

    expect(await screen.findByText(t("Mission claimed."))).toBeInTheDocument();
    expect(requests("POST", "/api/missions/m-free/claim")).toHaveLength(1);
    expect(await screen.findByRole("button", { name: t("missions.start_mission") })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t("common.close_notification") }));
    expect(screen.queryByText(t("Mission claimed."))).not.toBeInTheDocument();
  });

  it("shows the API error when claiming fails", async () => {
    mockFetch(
      dashboardRoutes([makeMission({ id: "m-free" })], {
        "POST /api/missions/m-free/claim": json({ error: "Mission already taken." }, 409),
      }),
    );
    const { user } = renderDashboard();

    await user.click(await screen.findByRole("button", { name: t("missions.claim") }));

    expect(await screen.findByText("Mission already taken.")).toBeInTheDocument();
  });

  it("shows the empty state and the load error", async () => {
    mockFetch(dashboardRoutes([], { "GET /api/missions": json({ error: "boom" }, 500) }));
    renderDashboard();

    expect(await screen.findByText(t("missions.no_missions_match_the_filters"))).toBeInTheDocument();
    expect(await screen.findByText(t("Unable to load missions."))).toBeInTheDocument();
  });

  it("reports invalid planet status data", async () => {
    mockFetch(dashboardRoutes([], { "GET /api/planet-status": { nope: true } }));
    renderDashboard();

    expect(await screen.findByText(t("Invalid planet status data."))).toBeInTheDocument();
  });

  it("starts, completes and reopens assigned missions", async () => {
    const pending = makeMission({
      id: "m-pending",
      title: "Pending one",
      assignedMemberId: explorer.publicId,
      assignedTo: "Scout",
    });
    const active = makeMission({
      id: "m-active",
      title: "Active one",
      status: "in_progress",
      progress: 80,
      assignedMemberId: explorer.publicId,
      assignedTo: "Scout",
      systemAddress: "1234567890AC",
    });
    const done = makeMission({
      id: "m-done",
      title: "Done one",
      status: "completed",
      progress: 100,
      assignedMemberId: explorer.publicId,
      assignedTo: "Scout",
      systemAddress: "1234567890AD",
    });
    const { requests } = mockFetch(
      dashboardRoutes([pending, active, done], {
        "GET /api/planet-status": { planets: { "0:1234567890AC": ["mapped", "planets_classified", "data_uploaded"] } },
        "PATCH /api/missions/m-pending": { ...pending, status: "in_progress" },
        "PATCH /api/missions/m-active": { ...active, status: "completed", progress: 100 },
        "PATCH /api/missions/m-done": { ...done, status: "in_progress", progress: 99 },
      }),
    );
    const { user } = renderDashboard();

    await user.click(await screen.findByRole("button", { name: t("missions.start_mission") }));
    expect(await screen.findByText(t("Mission started."))).toBeInTheDocument();
    expect(requests("PATCH", "/api/missions/m-pending")[0].body).toEqual({ status: "in_progress", progress: 0 });

    const completeButtons = await screen.findAllByRole("button", { name: t("missions.complete_mission") });
    // m-active ha tutte le voci da esploratore spuntate; m-pending appena iniziato no.
    const enabled = completeButtons.filter((button) => !button.hasAttribute("disabled"));
    expect(enabled).toHaveLength(1);
    await user.click(enabled[0]);
    expect(await screen.findByText(t("Mission completed."))).toBeInTheDocument();
    expect(requests("PATCH", "/api/missions/m-active")[0].body).toEqual({ status: "completed", progress: 80 });

    const reopenButtons = await screen.findAllByRole("button", { name: t("missions.reopen_mission") });
    await user.click(reopenButtons[reopenButtons.length - 1]);
    await waitFor(() => expect(requests("PATCH", "/api/missions/m-done")).toHaveLength(1));
    expect(requests("PATCH", "/api/missions/m-done")[0].body).toEqual({ status: "in_progress", progress: 99 });
  });

  it("saves a planet task and raises the mission progress to the task floor", async () => {
    const active = makeMission({
      id: "m-active",
      title: "Active one",
      status: "in_progress",
      progress: 0,
      assignedMemberId: explorer.publicId,
      assignedTo: "Scout",
    });
    const { requests } = mockFetch(
      dashboardRoutes([active], {
        "PATCH /api/planet-status": { systemStatuses: ["mapped"] },
        "PATCH /api/missions/m-active": { ...active, progress: 27 },
      }),
    );
    const { user } = renderDashboard();

    await user.click(await screen.findByRole("checkbox", { name: t("mapped") }));

    await waitFor(() => expect(requests("PATCH", "/api/missions/m-active")).toHaveLength(1));
    expect(requests("PATCH", "/api/planet-status")[0].body).toEqual({
      portal: "1234567890AB",
      galaxy: 0,
      systemStatuses: ["mapped"],
    });
    expect(requests("PATCH", "/api/missions/m-active")[0].body).toEqual({ status: "in_progress", progress: 27 });
    expect(await screen.findByRole("checkbox", { name: t("mapped") })).toBeChecked();
  });

  it("shows the error when a planet task cannot be saved", async () => {
    const active = makeMission({
      id: "m-active",
      status: "in_progress",
      assignedMemberId: explorer.publicId,
      assignedTo: "Scout",
    });
    mockFetch(dashboardRoutes([active], { "PATCH /api/planet-status": json({ error: "Task locked." }, 403) }));
    const { user } = renderDashboard();

    await user.click(await screen.findByRole("checkbox", { name: t("mapped") }));

    expect(await screen.findByText("Task locked.")).toBeInTheDocument();
  });

  it("requests a builder mission after the explorer tasks are done", async () => {
    const done = makeMission({
      id: "m-done",
      title: "Done one",
      status: "completed",
      progress: 100,
      assignedMemberId: explorer.publicId,
      assignedTo: "Scout",
    });
    const { requests } = mockFetch(
      dashboardRoutes([done], {
        "GET /api/planet-status": { planets: { "0:1234567890AB": ["mapped", "planets_classified", "data_uploaded"] } },
        "POST /api/missions": [makeMission({ id: "m-new", title: "Done one", targetSpecialty: "builder" })],
      }),
    );
    const { user } = renderDashboard();

    await user.click(await screen.findByRole("button", { name: t("missions.create_builder_mission") }));

    expect(await screen.findByText(t("Mission added to the log."))).toBeInTheDocument();
    expect(requests("POST", "/api/missions")[0].body).toMatchObject({
      title: "Done one",
      targetSpecialty: "builder",
      status: "pending",
      systemAddress: "1234567890AB",
    });
  });

  it("filters missions by search text and status tab", async () => {
    mockFetch(
      dashboardRoutes([
        makeMission({ id: "m-a", title: "Alpha" }),
        makeMission({
          id: "m-b",
          title: "Beta",
          status: "in_progress",
          assignedMemberId: explorer.publicId,
          assignedTo: "Scout",
          systemAddress: "1234567890AC",
        }),
      ]),
    );
    const { user } = renderDashboard(explorer, { initialSearch: "alp" });

    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();

    const search = screen.getByRole("textbox", { name: t("planet.search_missions_planets_users_or_mission_type") });
    await user.clear(search);
    expect(await screen.findByText("Beta")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: new RegExp(t("missions.status_in_progress")) }));
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("asks to complete the profile when it is incomplete", async () => {
    mockFetch(dashboardRoutes([]));
    const { user } = renderDashboard(makeMember({ nmsName: "", specialty: "explorer" }));

    expect(screen.getByText(t("profile.complete_your_nms_profile"))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("profile.complete_profile") }));
    expect(screen.getByRole("dialog", { name: t("profile.my_nms_profile") })).toBeInTheDocument();
  });

  it("opens the planet card from the mission title", async () => {
    mockFetch(dashboardRoutes([makeMission({ id: "m-a", title: "Alpha", description: "Scan everything" })]));
    const { user } = renderDashboard();

    await user.click(await screen.findByRole("button", { name: `${t("planet.open_planet_details_for")} Alpha` }));

    const dialog = await screen.findByRole("dialog", { name: "Alpha" });
    expect(within(dialog).getByText("Scan everything")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: t("planet.close_planet_details") }));
    expect(screen.queryByRole("dialog", { name: "Alpha" })).not.toBeInTheDocument();
  });
});

describe("MissionDashboard as a moderator", () => {
  it("loads members and stations and shows management controls", async () => {
    const assigned = makeMission({
      id: "m-mine",
      title: "Mine",
      assignedMemberId: moderator.publicId,
      assignedTo: "Warden",
    });
    const other = makeMission({
      id: "m-other",
      title: "Other",
      targetSpecialty: "builder",
      systemAddress: "1234567890AC",
    });
    const { requests } = mockFetch(
      dashboardRoutes([assigned, other], {
        "/api/stations": {
          stations: [{ portal: "1234567890AB", galaxy: 0, ownerId: "owner-1", ownerName: "Owner" }, { bad: true }],
        },
      }),
    );
    const { user } = renderDashboard(moderator);

    expect(await screen.findByText("Other")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("New mission") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${t("common.edit")} Mine` })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: t("admin.mission_overview") })).toBeInTheDocument();
    await waitFor(() => expect(requests("GET", "/api/members")).toHaveLength(1));
    expect(await screen.findByRole("link", { name: t("missions.open_linked_station") })).toHaveAttribute(
      "href",
      "/stations?search=1234567890AB",
    );
    expect(screen.getByRole("link", { name: t("stations.create_station_from_mission") })).toHaveAttribute(
      "href",
      "/stations?createStation=1&portal=1234567890AC&galaxy=0",
    );

    await user.click(screen.getByRole("button", { name: t("missions.showing_all") }));
    expect(screen.queryByText("Other")).not.toBeInTheDocument();
    expect(screen.getByText("Mine")).toBeInTheDocument();
  });

  it("deletes a mission only after confirmation", async () => {
    const mission = makeMission({ id: "m-del", title: "Doomed" });
    const { requests } = mockFetch(dashboardRoutes([mission], { "DELETE /api/missions/m-del": { ok: true } }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { user } = renderDashboard(moderator);

    const deleteButton = await screen.findByRole("button", { name: `${t("common.delete")} Doomed` });
    await user.click(deleteButton);
    expect(requests("DELETE", "/api/missions/m-del")).toHaveLength(0);

    await user.click(deleteButton);
    expect(await screen.findByText(t("Mission deleted."))).toBeInTheDocument();
    expect(screen.queryByText("Doomed")).not.toBeInTheDocument();
    expect(confirm).toHaveBeenCalledWith(t("common.delete_title", { title: "Doomed" }));
  });

  it("shows the API error when deletion fails", async () => {
    mockFetch(
      dashboardRoutes([makeMission({ id: "m-del", title: "Doomed" })], {
        "DELETE /api/missions/m-del": json({ error: "Not allowed." }, 403),
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderDashboard(moderator);

    await user.click(await screen.findByRole("button", { name: `${t("common.delete")} Doomed` }));

    expect(await screen.findByText("Not allowed.")).toBeInTheDocument();
    expect(screen.getByText("Doomed")).toBeInTheDocument();
  });

  it("edits a mission through the form", async () => {
    const mission = makeMission({ id: "m-edit", title: "Old title" });
    const { requests } = mockFetch(
      dashboardRoutes([mission, makeMission({ id: "m-keep", title: "Untouched", systemAddress: "1234567890AC" })], {
        "/api/missions/verify-system": { found: true, systemLabel: "Known system" },
        "PATCH /api/missions/m-edit": { ...mission, title: "New title" },
      }),
    );
    const { user } = renderDashboard(moderator);

    await user.click(await screen.findByRole("button", { name: `${t("common.edit")} Old title` }));
    const dialog = screen.getByRole("dialog", { name: t("missions.edit_mission") });
    const title = within(dialog).getByDisplayValue("Old title");
    await user.clear(title);
    await user.type(title, "New title");
    const save = within(dialog).getByRole("button", { name: t("common.save_changes") });
    await waitFor(() => expect(save).toBeEnabled(), { timeout: 2000 });
    await user.click(save);

    expect(await screen.findByText(t("Mission updated."))).toBeInTheDocument();
    expect(requests("PATCH", "/api/missions/m-edit")[0].body).toMatchObject({
      title: "New title",
      systemAddress: "1234567890AB",
    });
    expect(screen.queryByRole("dialog", { name: t("missions.edit_mission") })).not.toBeInTheDocument();
    expect(screen.getByText("New title")).toBeInTheDocument();
    expect(screen.getByText("Untouched")).toBeInTheDocument();
  });

  it("creates a mission and reports the three-mission split", async () => {
    const { requests } = mockFetch(
      dashboardRoutes([], {
        "/api/missions/verify-system": { found: false },
        "POST /api/missions": [
          makeMission({ id: "n1", title: "Split", targetSpecialty: "builder" }),
          makeMission({ id: "n2", title: "Split", targetSpecialty: "ranger" }),
          makeMission({ id: "n3", title: "Split", targetSpecialty: "explorer" }),
        ],
      }),
    );
    const { user } = renderDashboard(moderator);

    await user.click(screen.getByRole("button", { name: t("New mission") }));
    const dialog = screen.getByRole("dialog", { name: t("missions.new_mission") });
    await user.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890AB",
    );
    const create = within(dialog).getByRole("button", { name: t("missions.create_mission") });
    await waitFor(() => expect(create).toBeEnabled(), { timeout: 2000 });
    await user.click(create);

    expect(
      await screen.findByText(t("Created 3 missions: one each for Builders, Rangers, and Explorers.")),
    ).toBeInTheDocument();
    expect(requests("POST", "/api/missions")[0].body).toMatchObject({
      systemAddress: "1234567890AB",
      title: "Testara System",
      status: "pending",
    });
    expect(await screen.findAllByText("Split")).toHaveLength(3);
  });
});
