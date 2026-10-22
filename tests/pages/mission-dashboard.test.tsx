// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionDashboard } from "@/components/pages/mission-dashboard";
import type { Mission } from "@/lib/missions";
import { defaultAlliance, makeMember } from "../helpers/members";
import { json, makeMission, mockFetch, renderPage, router, t } from "./helpers";

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
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("MissionDashboard as a normal user", () => {
  it("loads a featured mission by ID even without a supplied system scope", async () => {
    const selected = makeMission();
    const { requests } = mockFetch(dashboardRoutes([selected]));
    renderDashboard(explorer, { featuredMissionId: selected.id });
    await screen.findAllByText(selected.title);
    expect(requests("GET", "/api/missions")[0].url.search).toBe(`?detailMission=${selected.id}`);
  });
  it.each([false, true])(
    "features the selected mission and keeps both copies synchronized, simple view %s",
    async (simpleView) => {
      const selected = makeMission({ title: "Selected builder", targetSpecialty: "builder" });
      const builder = makeMember({ ...explorer, specialty: "builder", simpleView });
      const other = makeMission({ id: "other", title: "Other associated", targetSpecialty: "ranger" });
      const { requests } = mockFetch(
        dashboardRoutes([selected, other], {
          [`POST /api/missions/${selected.id}/claim`]: {
            ...selected,
            assignedMemberId: builder.publicId,
            assignedTo: builder.nmsName,
            status: "in_progress",
          },
        }),
      );
      const { user, container } = renderDashboard(builder, {
        systemScope: { portal: selected.systemAddress, galaxy: selected.galaxy },
        featuredMissionId: selected.id,
        beforeAssociated: (
          <section>
            <h2>Linked station slot</h2>
          </section>
        ),
      });
      await screen.findAllByText(selected.title);
      const featured = screen.getByRole("heading", { name: t("details.mission") }).closest("section")!;
      const associated = screen.getByRole("heading", { name: t("details.associated_missions") }).closest("section")!;
      expect(within(featured).getAllByText(selected.title)).toHaveLength(1);
      expect(within(associated).getByText(selected.title)).toBeInTheDocument();
      expect(within(associated).getByText(other.title)).toBeInTheDocument();
      expect(within(featured).queryByText(other.title)).not.toBeInTheDocument();
      expect(featured.querySelector(".mission-card-grid-full-width")).not.toBeNull();
      expect(featured.nextElementSibling).toBe(
        screen.getByRole("heading", { name: "Linked station slot" }).parentElement,
      );
      expect(container.querySelectorAll(".app-shell")).toHaveLength(0);
      expect(container.querySelector(".toolbar")).toBeNull();
      expect(within(featured).queryByRole("link", { name: t("details.open_mission") })).not.toBeInTheDocument();
      expect(within(associated).getAllByRole("link", { name: t("details.open_mission") })).toHaveLength(1);
      expect(requests("GET", "/api/missions")[0].url.searchParams.get("detailMission")).toBe(selected.id);
      await user.click(within(featured).getByRole("button", { name: t("missions.claim") }));
      await waitFor(() => expect(screen.queryAllByRole("button", { name: t("missions.claim") })).toHaveLength(0));
      expect(within(featured).getByRole("button", { name: t("missions.complete_mission") })).toBeInTheDocument();
      expect(within(associated).getByRole("button", { name: t("missions.complete_mission") })).toBeInTheDocument();
    },
  );

  it("returns to missions after deleting the featured mission", async () => {
    const selected = makeMission();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockFetch(dashboardRoutes([selected], { [`DELETE /api/missions/${selected.id}`]: {} }));
    const { user } = renderDashboard(moderator, {
      systemScope: { portal: selected.systemAddress, galaxy: selected.galaxy },
      featuredMissionId: selected.id,
    });

    await screen.findAllByText(selected.title);
    await user.click(screen.getAllByRole("button", { name: `${t("common.delete")} ${selected.title}` })[0]);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/missions"));
  });

  it.each(["/stations?search=Pilot", "/missions/previous?from=stations"])(
    "returns to the exact source %s after deleting the current mission",
    async (destination) => {
      const selected = makeMission();
      window.history.replaceState(null, "", `/missions/${selected.id}?returnTo=${encodeURIComponent(destination)}`);
      vi.spyOn(window, "confirm").mockReturnValue(true);
      mockFetch(dashboardRoutes([selected], { [`DELETE /api/missions/${selected.id}`]: {} }));
      const { user } = renderDashboard(moderator, {
        systemScope: { portal: selected.systemAddress, galaxy: selected.galaxy },
        featuredMissionId: selected.id,
        associatedFirst: true,
      });
      await screen.findByText(selected.title);
      await user.click(screen.getByRole("button", { name: `${t("common.delete")} ${selected.title}` }));
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith(destination));
    },
  );
  it.each([false, true])(
    "lets a builder claim a compatible free mission in station details, simple view %s",
    async (simpleView) => {
      const builder = makeMember({ ...explorer, specialty: "builder", simpleView });
      const free = makeMission({ id: "builder-free", title: "Free builder mission", targetSpecialty: "builder" });
      const { requests } = mockFetch(
        dashboardRoutes(
          [
            free,
            makeMission({ id: "all-free", title: "Free for all", targetSpecialty: "all" }),
            makeMission({ id: "explorer-free", title: "Free explorer", targetSpecialty: "explorer" }),
            makeMission({ id: "combined-free", title: "Combined mission", targetSpecialty: "explorer_builder" }),
            makeMission({
              id: "taken",
              title: "Taken builder",
              targetSpecialty: "builder",
              assignedMemberId: "another",
              assignedTo: "Other builder",
            }),
          ],
          {
            "POST /api/missions/builder-free/claim": {
              ...free,
              assignedMemberId: builder.publicId,
              assignedTo: builder.nmsName,
              status: "in_progress",
            },
          },
        ),
      );
      const { user } = renderDashboard(builder, { systemScope: { portal: free.systemAddress, galaxy: free.galaxy } });
      const title = await screen.findByText(free.title);
      const card = title.closest("article")!;
      expect(screen.getAllByRole("button", { name: t("missions.claim") })).toHaveLength(2);
      for (const name of ["Free explorer", "Combined mission", "Taken builder"]) {
        const otherCard = screen.getByText(name).closest("article")!;
        expect(within(otherCard).queryByRole("button", { name: t("missions.claim") })).not.toBeInTheDocument();
        expect(within(otherCard).queryByRole("button", { name: t("missions.start_mission") })).not.toBeInTheDocument();
        expect(
          within(otherCard).queryByRole("button", { name: t("missions.complete_mission") }),
        ).not.toBeInTheDocument();
      }
      await user.click(within(card).getByRole("button", { name: t("missions.claim") }));
      expect(await screen.findByText(t("Mission claimed."))).toBeInTheDocument();
      expect(requests("POST", "/api/missions/builder-free/claim")).toHaveLength(1);
      expect(within(card).getByRole("button", { name: t("missions.complete_mission") })).toBeInTheDocument();
      expect(within(card).queryByRole("button", { name: t("missions.claim") })).not.toBeInTheDocument();
    },
  );

  it("shows every associated mission regardless of status or initial search and hides the block after the last deletion", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const missions = (["pending", "in_progress", "completed"] as const).map((status) =>
      makeMission({ id: status, title: `Associated ${status}`, status, systemAddress: "1234567890AB", galaxy: 0 }),
    );
    mockFetch(
      dashboardRoutes(missions, {
        "DELETE /api/missions/pending": {},
        "DELETE /api/missions/in_progress": {},
        "DELETE /api/missions/completed": {},
      }),
    );
    const { user, container } = renderDashboard(moderator, {
      systemScope: { portal: "1234567890AB", galaxy: 0 },
      initialSearch: "not a mission",
    });
    for (const mission of missions) {
      await screen.findByText(mission.title);
    }
    expect(container.querySelector(".toolbar")).toBeNull();
    for (const mission of missions) {
      await user.click(screen.getByRole("button", { name: `${t("common.delete")} ${mission.title}` }));
    }
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: t("details.associated_missions") })).not.toBeInTheDocument(),
    );
  });

  it.each([false, true])(
    "shows all associated specialties with compatible claims and assignee actions in detail mode %s",
    async (simpleView) => {
      const own = makeMission({
        id: "scoped",
        title: "Local mission",
        systemAddress: "1234567890AB",
        galaxy: 0,
        assignedMemberId: explorer.publicId,
        assignedTo: "Scout",
      });
      const onChanged = vi.fn();
      const { requests } = mockFetch(
        dashboardRoutes(
          [
            own,
            makeMission({ id: "foreign", title: "Foreign galaxy", systemAddress: own.systemAddress, galaxy: 2 }),
            makeMission({ id: "other", title: "Other system", systemAddress: "1234567890AC", galaxy: 0 }),
            makeMission({
              id: "hidden",
              title: "Builder only",
              systemAddress: own.systemAddress,
              targetSpecialty: "builder",
              assignedMemberId: "someone-else",
              assignedTo: "Builder",
              status: "in_progress",
            }),
            makeMission({ id: "free", title: "Free explorer" }),
          ],
          {
            "PATCH /api/missions/scoped": { ...own, status: "in_progress" },
          },
        ),
      );
      const { user, container } = renderDashboard(
        { ...explorer, simpleView },
        {
          systemScope: { portal: "2234567890AB", galaxy: 0 },
          onChanged,
        },
      );
      await user.click(await screen.findByRole("button", { name: t("missions.start_mission") }));
      expect(await screen.findByRole("button", { name: t("missions.complete_mission") })).toBeInTheDocument();
      expect(onChanged).toHaveBeenCalledOnce();
      expect(screen.queryByText("Foreign galaxy")).not.toBeInTheDocument();
      expect(screen.queryByText("Other system")).not.toBeInTheDocument();
      expect(screen.getByText("Builder only")).toBeInTheDocument();
      expect(screen.getByText("Free explorer")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: t("missions.claim") })).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: t("missions.complete_mission") })).toHaveLength(1);
      expect(requests("GET", "/api/missions")[0].url.searchParams.get("stationPortal")).toBe("2234567890AB");
      expect(requests("GET", "/api/missions")[0].url.searchParams.get("galaxy")).toBe("0");
      expect(container.querySelector(".app-shell")).toBeNull();
      expect(container.querySelector("main")).toBeNull();
      expect(screen.getByRole("heading", { name: t("details.associated_missions") })).toBeInTheDocument();
      expect(container.querySelector(".toolbar")).toBeNull();
      expect(container.querySelector(".table-footer")).toBeNull();
      expect(screen.queryByRole("navigation", { name: t("common.pagination") })).not.toBeInTheDocument();
    },
  );

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
      "/stations/owner-1%3A1234567890AB%3A0?from=missions",
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
