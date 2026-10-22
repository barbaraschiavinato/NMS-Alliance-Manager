// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StationsPage } from "@/components/pages/stations-page";
import { galaxyLabel } from "@/lib/galaxies";
import { defaultAlliance, makeMember } from "../helpers/members";
import { json, makeMission, mockFetch, renderPage, router, t } from "./helpers";

vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);
vi.mock("@/lib/nms-core/system.js", async () => (await import("./helpers")).nmsCoreModule);

const ranger = makeMember({
  publicId: "ranger-1",
  nmsName: "Ranger One",
  specialty: "ranger",
  role: "user",
  simpleView: false,
});
const moderator = makeMember({
  publicId: "mod-1",
  nmsName: "Mod",
  specialty: "explorer",
  role: "moderator",
  simpleView: false,
});
const otherMember = makeMember({ publicId: "other-1", nmsName: "Other Pilot" });

function station(overrides: Record<string, unknown> = {}) {
  return {
    portal: "1234567890AB",
    galaxy: 0,
    ownerId: ranger.publicId,
    ownerName: "Ranger One",
    name: "Home Base",
    hasMissions: false,
    missionStatus: "none",
    availableSpecialties: ["explorer", "builder", "ranger"],
    ...overrides,
  };
}

function stationRoutes(stations: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    "GET /api/stations": { stations },
    "GET /api/planet-status": { planets: {} },
    "GET /api/help-requests": [],
    "/api/members": [ranger, moderator, otherMember],
    ...overrides,
  };
}

function renderStations(member = ranger, props: Partial<Parameters<typeof StationsPage>[0]> = {}) {
  return renderPage(
    <StationsPage
      alliance={defaultAlliance}
      currentMember={member}
      missionCount={0}
      sidebarStationCount={0}
      {...props}
    />,
  );
}

function detailProps(ownerId = ranger.publicId) {
  const identity = { portal: "1234567890AB", galaxy: 0, ownerId };
  return {
    initialStation: identity,
    detail: { station: identity, planets: [], almanacLookupFailed: false },
  };
}

function emptyMissionRoutes() {
  return { "GET /api/missions": [], "/api/missions/covered": { covered: {} } };
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("StationsPage as a member", () => {
  it.each([
    ["2234567890ab", 0, true],
    ["1234567890AB", 1, false],
    ["1234567890AC", 0, false],
    ["", 0, false],
  ])("marks only stations matching the configured hub system %s/%s", async (portalCode, galaxy, expected) => {
    mockFetch(stationRoutes([station()]));
    renderStations(ranger, { alliance: { ...defaultAlliance, portalCode, galaxy } });
    await screen.findAllByText("Home Base");
    expect(screen.queryByText(t("stations.alliance_hub_badge")) !== null).toBe(expected);
  });

  it("places the featured mission before the same station detail blocks and retains it in associated missions", async () => {
    const mission = makeMission({ targetSpecialty: "ranger" });
    mockFetch(
      stationRoutes([station()], {
        ...emptyMissionRoutes(),
        "GET /api/missions": [mission],
      }),
    );
    const props = detailProps();
    const { container } = renderStations(ranger, {
      ...props,
      detail: { ...props.detail, missionId: mission.id, origin: "missions" },
    });
    await screen.findAllByText(mission.title);
    expect([...container.querySelectorAll(".detail-section > h2")].map((el) => el.textContent)).toEqual([
      t("details.mission"),
      t("details.station"),
      t("details.associated_missions"),
      t("details.system_and_planets"),
    ]);
    expect(screen.getAllByText(mission.title)).toHaveLength(2);
    expect(container.querySelectorAll(".app-shell")).toHaveLength(1);
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(screen.getByRole("link", { name: t("details.back_to_missions") })).toHaveAttribute("href", "/missions");
  });

  it("shows a missing station notice instead of unrelated stations in mission details", async () => {
    const mission = makeMission({ targetSpecialty: "ranger" });
    mockFetch(
      stationRoutes([station({ name: "Unrelated station" })], {
        ...emptyMissionRoutes(),
        "GET /api/missions": [mission],
      }),
    );
    renderStations(ranger, {
      detail: {
        station: null,
        system: { portal: mission.systemAddress, galaxy: mission.galaxy },
        missionId: mission.id,
        planets: [],
        almanacLookupFailed: false,
        origin: "missions",
      },
    });

    await screen.findAllByText(mission.title);
    expect(screen.getByText(t("details.station_unavailable"))).toBeInTheDocument();
    expect(screen.queryByText("Unrelated station")).not.toBeInTheDocument();
  });

  it.each([
    ["stations", true],
    ["stations", false],
    ["messages", false],
    ["taxi", false],
  ] as const)(
    "uses the correct mission detail blocks for origin %s and station-card entry %s",
    async (origin, associatedFirst) => {
      const mission = makeMission({ targetSpecialty: "ranger" });
      const other = makeMission({
        id: "other-mission",
        title: "Other specialty mission",
        targetSpecialty: "builder",
      });
      mockFetch(
        stationRoutes([station()], {
          ...emptyMissionRoutes(),
          "GET /api/missions": [mission, other],
        }),
      );
      const props = detailProps();
      const { container } = renderStations(ranger, {
        ...props,
        detail: { ...props.detail, missionId: mission.id, origin, associatedFirst },
      });
      await screen.findByText(other.title);
      const headings = [...container.querySelectorAll(".detail-section > h2")].map((el) => el.textContent);
      expect(headings).toEqual(
        associatedFirst
          ? [t("details.associated_missions"), t("details.station"), t("details.system_and_planets")]
          : [
              t("details.mission"),
              t("details.station"),
              t("details.associated_missions"),
              t("details.system_and_planets"),
            ],
      );
      expect(screen.getAllByText(mission.title)).toHaveLength(associatedFirst ? 1 : 2);
      expect(screen.getAllByText(other.title)).toHaveLength(1);
      expect(screen.getByRole("link", { name: t("details.open_station") })).toHaveAttribute(
        "href",
        `/stations/${encodeURIComponent(`${ranger.publicId}:1234567890AB:0`)}`,
      );
      const otherMissionLink = screen.getByRole("link", { name: t("details.open_mission") });
      expect(otherMissionLink).toHaveAttribute("href", "/missions/other-mission?from=missions");
      expect(screen.getAllByRole("link", { name: t("details.open_mission") })).toHaveLength(1);
      if (origin === "stations") {
        expect(screen.getByRole("link", { name: t("details.back_to_stations") })).toHaveAttribute("href", "/stations");
      }
    },
  );
  it("shows system help requests last without duplicating page chrome", async () => {
    mockFetch(
      stationRoutes([station()], {
        ...emptyMissionRoutes(),
        "GET /api/help-requests": [
          {
            id: "help",
            senderMemberId: ranger.publicId,
            senderName: "Ranger One",
            body: "Need system support",
            subject: "System help",
            portal: "2234567890AB",
            galaxy: 0,
            createdAt: "2026-01-01T00:00:00Z",
            replies: [],
          },
          {
            id: "foreign",
            senderName: "Other",
            body: "Foreign help",
            portal: "1234567890AB",
            galaxy: 1,
            createdAt: "2026-01-01T00:00:00Z",
            replies: [],
          },
        ],
      }),
    );
    const { container } = renderStations(ranger, detailProps());
    await screen.findByText("Need system support");
    expect(screen.queryByText("Foreign help")).not.toBeInTheDocument();
    expect([...container.querySelectorAll(".detail-section > h2")].map((el) => el.textContent)).toEqual([
      t("details.station"),
      t("details.system_and_planets"),
      t("help.help_requests"),
    ]);
    expect(container.querySelectorAll(".app-shell")).toHaveLength(1);
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });
  it.each([
    ["planets", "details.back_to_planets"],
    ["missions", "details.back_to_missions"],
    ["messages", "details.back_to_messages"],
    ["taxi", "details.back_to_taxi"],
  ] as const)("returns to the %s source with the matching label", async (origin, label) => {
    mockFetch(stationRoutes([station()], emptyMissionRoutes()));
    const props = detailProps();
    renderStations(ranger, { ...props, detail: { ...props.detail, origin } });
    expect(screen.getByRole("link", { name: t(label) })).toHaveAttribute("href", `/${origin}`);
    await screen.findAllByText("Home Base");
  });
  it.each([false, true])(
    "shows the detail blocks in order without list controls in simple view %s",
    async (simpleView) => {
      mockFetch(
        stationRoutes([station(), station({ portal: "1234567890AC", name: "Other station" })], {
          "GET /api/missions": [makeMission({ systemAddress: "1234567890AB", galaxy: 0, targetSpecialty: "ranger" })],
          "/api/missions/covered": { covered: {} },
        }),
      );
      const { container } = renderStations(makeMember({ ...ranger, simpleView }), {
        initialStation: { portal: "1234567890AB", galaxy: 0, ownerId: ranger.publicId },
        detail: {
          station: { portal: "1234567890AB", galaxy: 0, ownerId: ranger.publicId },
          planets: [],
          almanacLookupFailed: false,
        },
      });
      await screen.findAllByText("Home Base");
      await screen.findByRole("heading", { name: t("details.associated_missions") });
      expect(screen.queryByText("Other station")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: t("details.back_to_stations") })).toHaveAttribute("href", "/stations");
      expect([...container.querySelectorAll(".detail-section > h2")].map((heading) => heading.textContent)).toEqual([
        t("details.station"),
        t("details.associated_missions"),
        t("details.system_and_planets"),
      ]);
      expect(container.querySelectorAll(".app-shell")).toHaveLength(1);
      expect(container.querySelectorAll("main")).toHaveLength(1);
      expect(screen.queryByRole("button", { name: t("stations.add_station") })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("textbox", { name: t("stations.search_stations_by_portal_owner_or_galaxy_or_notes") }),
      ).not.toBeInTheDocument();
      expect(container.querySelector(".mission-section .toolbar")).toBeNull();
      expect(screen.queryByRole("link", { name: t("details.open_station") })).not.toBeInTheDocument();

      expect(
        screen.getByRole("button", { name: t("stations.edit_station_portal", { portal: "1234567890AB" }) }),
      ).toBeInTheDocument();
    },
  );

  it.each(["empty", "foreign"] as const)("omits the associated missions block for %s missions", async (kind) => {
    mockFetch(
      stationRoutes([station()], {
        ...emptyMissionRoutes(),
        "GET /api/missions":
          kind === "empty"
            ? []
            : [
                makeMission({
                  systemAddress: kind === "foreign" ? "1234567890AC" : "1234567890AB",
                  galaxy: 0,
                  targetSpecialty: "builder",
                }),
              ],
      }),
    );
    renderStations(ranger, detailProps());
    await screen.findAllByText("Home Base");
    expect(screen.queryByRole("heading", { name: t("details.associated_missions") })).not.toBeInTheDocument();
    expect(screen.queryByText(t("missions.no_missions_match_the_filters"))).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: t("details.system_and_planets") })).toBeInTheDocument();
  });

  it("disables pulse animations when the member preference is off", async () => {
    mockFetch(stationRoutes([]));
    const { container } = renderStations(makeMember({ ...ranger, pulseEffectsEnabled: false }));

    expect(container.querySelector(".app-shell")).toHaveClass("pulse-effects-disabled");
    expect(await screen.findByRole("button", { name: t("stations.add_station") })).toHaveClass(
      "station-header-add-pulse",
    );
  });

  it("pulses the add-station action for every specialty", async () => {
    mockFetch(stationRoutes([]));
    const { unmount } = renderStations();
    const addStation = await screen.findByRole("button", { name: t("stations.add_station") });
    expect(addStation).toHaveClass("station-header-add-pulse");

    unmount();
    renderStations(makeMember({ publicId: "explorer-1", specialty: "explorer", simpleView: false }));
    expect(await screen.findByRole("button", { name: t("stations.add_station") })).toHaveClass(
      "station-header-add-pulse",
    );
  });

  it("shows the empty archive and the load error", async () => {
    mockFetch(stationRoutes([], { "GET /api/stations": json({ error: "Stations offline." }, 500) }));
    renderStations();

    expect(await screen.findByText("Stations offline.")).toBeInTheDocument();
    expect(screen.getByText(t("stations.no_saved_portals"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("stations.export_stations_to_excel") })).not.toBeInTheDocument();
  });

  it("adds a station with the generated system name", async () => {
    const { requests } = mockFetch(
      stationRoutes([], {
        "/api/missions/verify-system": { found: true, planetType: "Lush" },
        "POST /api/stations": { stations: [station()] },
      }),
    );
    const { user } = renderStations();

    await user.click(screen.getByRole("button", { name: t("stations.add_station") }));
    const dialog = screen.getByRole("dialog", { name: t("stations.add_station") });
    expect(within(dialog).queryByRole("combobox", { name: t("stations.station_owner") })).not.toBeInTheDocument();
    await user.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890ab",
    );
    const name = within(dialog).getByRole("textbox", { name: t("stations.station_name") });
    await waitFor(() => expect(name).toHaveValue("Testara System"), { timeout: 2000 });
    await user.type(within(dialog).getByRole("textbox", { name: t("stations.station_notes") }), "Near the anomaly");
    const add = within(dialog).getByRole("button", { name: t("common.add") });
    await waitFor(() => expect(add).toBeEnabled());
    await user.click(add);

    expect(await screen.findByText(t("stations.portal_added_to_your_stations"))).toBeInTheDocument();
    expect(requests("POST", "/api/stations")[0].body).toEqual({
      portal: "1234567890AB",
      galaxy: 0,
      ownerId: ranger.publicId,
      name: "Testara System",
      note: "Near the anomaly",
    });
    expect(screen.queryByRole("dialog", { name: t("stations.add_station") })).not.toBeInTheDocument();
    expect(screen.getAllByText("Home Base").length).toBeGreaterThan(0);
  });

  it("refuses a portal that is already archived and shows API errors", async () => {
    const { requests } = mockFetch(
      stationRoutes([station()], {
        "/api/missions/verify-system": { found: false },
        "POST /api/stations": json({ error: "Archive full." }, 400),
      }),
    );
    const { user } = renderStations();

    await screen.findAllByText("Home Base");
    await user.click(screen.getByRole("button", { name: t("stations.add_station") }));
    const dialog = screen.getByRole("dialog", { name: t("stations.add_station") });
    const portal = within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") });
    await user.type(portal, "1234567890AB");
    const add = within(dialog).getByRole("button", { name: t("common.add") });
    await waitFor(() => expect(add).toBeEnabled(), { timeout: 2000 });
    await user.click(add);
    expect(
      await within(dialog).findByText(t("stations.this_portal_is_already_in_the_selected_owner_s_list")),
    ).toBeInTheDocument();
    expect(requests("POST", "/api/stations")).toHaveLength(0);

    await user.clear(portal);
    await user.type(portal, "1234567890AC");
    await waitFor(() => expect(add).toBeEnabled(), { timeout: 2000 });
    await user.click(add);
    expect(await within(dialog).findByText("Archive full.")).toBeInTheDocument();
  });

  it.each([false, true, "mission"] as const)(
    "edits, views notes and removes an own station in detail mode %s",
    async (detailMode) => {
      const own = station({ note: "Bring fuel" });
      const { requests } = mockFetch(
        stationRoutes([own], {
          ...emptyMissionRoutes(),
          "PATCH /api/stations": { stations: [{ ...own, name: "Renamed Base" }] },
          "DELETE /api/stations": { stations: [] },
        }),
      );
      const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
      const props = detailProps();
      const { user } = renderStations(
        ranger,
        detailMode === "mission"
          ? { ...props, detail: { ...props.detail, missionId: "mission-1", origin: "missions" } }
          : detailMode
            ? props
            : {},
      );

      await user.click(
        await screen.findByRole("button", { name: t("stations.view_notes_for_station", { station: "Home Base" }) }),
      );
      const notes = screen.getByRole("dialog", { name: t("stations.station_notes") });
      expect(within(notes).getByText("Bring fuel")).toBeInTheDocument();
      await user.click(within(notes).getByRole("button", { name: t("common.close") }));

      await user.click(
        screen.getByRole("button", { name: t("stations.edit_station_portal", { portal: "1234567890AB" }) }),
      );
      const dialog = screen.getByRole("dialog", { name: t("stations.edit_station") });
      const name = within(dialog).getByRole("textbox", { name: t("stations.station_name") });
      expect(name).toHaveValue("Home Base");
      await user.clear(name);
      await user.type(name, "Renamed Base");
      await user.click(within(dialog).getByRole("button", { name: t("common.save") }));

      expect(await screen.findByText(t("stations.station_updated"))).toBeInTheDocument();
      expect(requests("PATCH", "/api/stations")[0].body).toEqual({
        currentPortal: "1234567890AB",
        currentGalaxy: 0,
        currentOwnerId: ranger.publicId,
        portal: "1234567890AB",
        galaxy: 0,
        ownerId: ranger.publicId,
        name: "Renamed Base",
        note: "Bring fuel",
      });

      const removeLabel = t("stations.remove_portal_portal_in_galaxy_from_owner_s_archive", {
        portal: "1234567890AB",
        galaxy: galaxyLabel(0),
        owner: "Ranger One",
      });
      await user.click(screen.getByRole("button", { name: removeLabel }));
      expect(requests("DELETE", "/api/stations")).toHaveLength(0);
      await user.click(screen.getByRole("button", { name: removeLabel }));
      expect(await screen.findByText(t("stations.station_removed_from_the_owner_s_archive"))).toBeInTheDocument();
      expect(requests("DELETE", "/api/stations")[0].body).toEqual({
        portal: "1234567890AB",
        galaxy: 0,
        ownerId: ranger.publicId,
      });
      expect(confirm).toHaveBeenCalledTimes(2);
      if (detailMode === true) expect(router.replace).toHaveBeenCalledWith("/stations");
      if (detailMode === "mission") {
        expect(router.refresh).toHaveBeenCalledTimes(2);
        expect(router.replace).not.toHaveBeenCalled();
      }
    },
  );

  it.each([false, true])("toggles the ranger tasks and reports failures in detail mode %s", async (detailMode) => {
    const { requests } = mockFetch(
      stationRoutes([station()], {
        ...emptyMissionRoutes(),
        "PATCH /api/planet-status": vi
          .fn()
          .mockReturnValueOnce({ systemStatuses: ["station_claimed"] })
          .mockReturnValueOnce(json({ error: "Task locked." }, 403)),
      }),
    );
    const { user } = renderStations(ranger, detailMode ? detailProps() : {});

    const claimed = await screen.findByRole("checkbox", { name: t("station_claimed") });
    expect(screen.queryByRole("checkbox", { name: t("mapped") })).not.toBeInTheDocument();
    await user.click(claimed);
    await waitFor(() => expect(claimed).toBeChecked());
    expect(requests("PATCH", "/api/planet-status")[0].body).toEqual({
      portal: "1234567890AB",
      galaxy: 0,
      systemStatuses: ["station_claimed"],
    });

    await user.click(screen.getByRole("checkbox", { name: t("renamed") }));
    expect(await screen.findByText("Task locked.")).toBeInTheDocument();
  });

  it.each([undefined, "/missions/previous?from=messages"])(
    "preserves the source %s after editing the station galaxy",
    async (source) => {
      if (source) window.history.replaceState(null, "", `/stations/current?returnTo=${encodeURIComponent(source)}`);
      mockFetch(
        stationRoutes([station()], {
          ...emptyMissionRoutes(),
          "/api/missions/verify-system": { found: true },
          "PATCH /api/stations": { stations: [station({ galaxy: 2 })] },
        }),
      );
      const props = detailProps();
      const { user } = renderStations(ranger, { ...props, detail: { ...props.detail, origin: "planets" } });
      await user.click(
        await screen.findByRole("button", {
          name: t("stations.edit_station_portal", { portal: "1234567890AB" }),
        }),
      );
      const dialog = screen.getByRole("dialog", { name: t("stations.edit_station") });
      await user.selectOptions(within(dialog).getByRole("combobox", { name: t("stations.galaxy") }), "2");
      const save = within(dialog).getByRole("button", { name: t("common.save") });
      await waitFor(() => expect(save).toBeEnabled(), { timeout: 2000 });
      await user.click(save);
      await waitFor(() =>
        expect(router.replace).toHaveBeenCalledWith(
          `/stations/ranger-1%3A1234567890AB%3A2?from=planets&returnTo=${encodeURIComponent(source ?? "/planets")}`,
        ),
      );
    },
  );

  it.each(["success", "stations", "status", "invalid-status", "unknown-error"])(
    "refreshes the station and statuses after a mission action and surfaces %s errors",
    async (scenario) => {
      const member = makeMember({ ...ranger, specialty: "explorer" });
      const mission = makeMission({
        id: "local",
        systemAddress: "1234567890AB",
        galaxy: 0,
        assignedMemberId: member.publicId,
      });
      const { requests } = mockFetch(
        stationRoutes([station()], {
          ...emptyMissionRoutes(),
          "GET /api/missions": [mission],
          "PATCH /api/missions/local": { ...mission, status: "in_progress" },
          "GET /api/stations": vi
            .fn()
            .mockResolvedValueOnce({ stations: [station()] })
            .mockImplementation(async () => {
              if (scenario === "stations") throw new Error("Archive unavailable");
              return { stations: [station({ hasMissions: true })] };
            }),
          "GET /api/planet-status": vi
            .fn()
            .mockResolvedValueOnce({ planets: {} })
            .mockResolvedValueOnce({ planets: {} })
            .mockImplementation(async () => {
              if (scenario === "status") return json({ error: "unavailable" }, 503);
              if (scenario === "invalid-status") return { planets: { invalid: null } };
              if (scenario === "unknown-error") throw "Unexpected failure";
              return { planets: { "1234567890AB:0": ["station_claimed"] } };
            }),
        }),
      );
      const { user } = renderStations(member, detailProps());
      await user.click(await screen.findByRole("button", { name: t("missions.start_mission") }));
      await waitFor(() => expect(requests("GET", "/api/stations").length).toBeGreaterThan(1));
      if (scenario === "stations") expect(await screen.findByText("Archive unavailable")).toBeInTheDocument();
      if (scenario === "status" || scenario === "unknown-error") {
        expect(await screen.findByText(t("errors.request_failed"))).toBeInTheDocument();
      }
      if (scenario === "invalid-status") {
        expect(await screen.findByText("Invalid system status response.")).toBeInTheDocument();
      }
      expect(router.refresh).toHaveBeenCalled();
    },
  );

  it("filters stations by search and by the own-stations tab", async () => {
    mockFetch(
      stationRoutes([
        station(),
        station({
          portal: "1234567890AC",
          name: "Far Outpost",
          ownerId: "other-1",
          ownerName: "Other Pilot",
          missionStatus: "in_progress",
          hasMissions: true,
        }),
      ]),
    );
    const { user } = renderStations();

    expect((await screen.findAllByText("Far Outpost")).length).toBeGreaterThan(0);
    await user.type(
      screen.getByRole("textbox", { name: t("stations.search_stations_by_portal_owner_or_galaxy_or_notes") }),
      "outpost",
    );
    expect(screen.queryAllByText("Home Base")).toHaveLength(0);
    await user.clear(
      screen.getByRole("textbox", { name: t("stations.search_stations_by_portal_owner_or_galaxy_or_notes") }),
    );

    await user.click(screen.getByRole("tab", { name: new RegExp(t("stations.my_stations")) }));
    expect(screen.queryAllByText("Far Outpost")).toHaveLength(0);
    expect(screen.getAllByText("Home Base").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("tab", { name: new RegExp(t("stations.filter_in_mission")) }));
    expect(screen.getAllByText("Far Outpost").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Home Base")).toHaveLength(0);
  });

  it("shows a single station when opened from a link", async () => {
    mockFetch(stationRoutes([station(), station({ portal: "1234567890AC", name: "Far Outpost", ownerId: "other-1" })]));
    renderStations(ranger, { initialStation: { portal: "1234567890AC", galaxy: 0, ownerId: "other-1" } });

    expect((await screen.findAllByText("Far Outpost")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Home Base")).toHaveLength(0);
  });

  it("opens the planet card for a station", async () => {
    mockFetch(stationRoutes([station()]));
    const { user } = renderStations();

    const [title] = await screen.findAllByRole("button", { name: /Home Base/ });
    await user.click(title);
    const dialog = await screen.findByRole("dialog", { name: t("stations.space_station") });
    await user.click(within(dialog).getByRole("button", { name: t("planet.close_planet_details") }));
    expect(screen.queryByRole("dialog", { name: t("stations.space_station") })).not.toBeInTheDocument();
  });
});

describe("StationsPage as a moderator", () => {
  it("adds a station for another owner", async () => {
    const { requests } = mockFetch(
      stationRoutes([], {
        "/api/missions/verify-system": { found: true },
        "POST /api/stations": { stations: [station({ ownerId: "other-1", ownerName: "Other Pilot" })] },
      }),
    );
    const { user } = renderStations(moderator);

    expect(screen.getByRole("heading", { name: `${t("stations.space_stations")}.` })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("stations.add_station") }));
    const dialog = screen.getByRole("dialog", { name: t("stations.add_station") });
    const owner = within(dialog).getByRole("combobox", { name: t("stations.station_owner") });
    await waitFor(() => expect(within(owner).getByRole("option", { name: "Other Pilot" })).toBeInTheDocument());
    await user.selectOptions(owner, "other-1");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: t("stations.galaxy") }), "2");
    await user.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890AB",
    );
    const add = within(dialog).getByRole("button", { name: t("common.add") });
    await waitFor(() => expect(add).toBeEnabled(), { timeout: 2000 });
    await user.click(add);

    expect(
      await screen.findByText(t("stations.station_added_to_owner_s_archive", { owner: "Other Pilot" })),
    ).toBeInTheDocument();
    expect(requests("POST", "/api/stations")[0].body).toMatchObject({
      portal: "1234567890AB",
      galaxy: 2,
      ownerId: "other-1",
    });
  });

  it("reports a members load failure", async () => {
    mockFetch(stationRoutes([], { "/api/members": json({ error: "nope" }, 500) }));
    renderStations(moderator);

    expect(await screen.findByText(t("errors.unable_to_load_members"))).toBeInTheDocument();
  });

  it("exports the stations to Excel and reports export errors", async () => {
    const createObjectURL = vi.fn(() => "blob:stations");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    mockFetch(
      stationRoutes([], {
        "/api/stations/export": vi
          .fn()
          .mockReturnValueOnce(new Response("xlsx", { status: 200 }))
          .mockReturnValueOnce(json({ error: "Export disabled." }, 403)),
      }),
    );
    const { user } = renderStations(moderator);

    const exportButton = screen.getByRole("button", { name: t("stations.export_stations_to_excel") });
    await user.click(exportButton);
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(createObjectURL).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: t("stations.export_stations_to_excel") }));
    expect(await screen.findByText("Export disabled.")).toBeInTheDocument();
  });

  it.each([false, true])("creates missions and refreshes the archive in detail mode %s", async (detailMode) => {
    const { requests } = mockFetch(
      stationRoutes([station({ ownerId: "other-1", ownerName: "Other Pilot", hasMissions: true })], {
        ...emptyMissionRoutes(),
        "/api/missions/verify-system": { found: true },
        "POST /api/missions": [{ id: "a" }, { id: "b" }],
      }),
    );
    const { user } = renderStations(moderator, detailMode ? detailProps("other-1") : {});

    if (detailMode) {
      expect(
        screen.queryByRole("link", { name: t("planet.open_missions_for_planet_portal", { portal: "1234567890AB" }) }),
      ).not.toBeInTheDocument();
    }
    await user.click(
      await screen.findByRole("button", { name: t("stations.create_mission_from_portal", { portal: "1234567890AB" }) }),
    );
    const dialog = screen.getByRole("dialog", { name: t("missions.new_mission") });
    expect(within(dialog).getByDisplayValue("Home Base")).toBeInTheDocument();
    const create = within(dialog).getByRole("button", { name: t("missions.create_mission") });
    await waitFor(() => expect(create).toBeEnabled(), { timeout: 2000 });
    await user.click(create);

    expect(
      await screen.findByText(t("stations.count_missions_created_from_the_station", { count: 2 })),
    ).toBeInTheDocument();
    expect(requests("POST", "/api/missions")[0].body).toMatchObject({
      systemAddress: "1234567890AB",
      stationOwnerMemberId: "other-1",
      targetSpecialty: "explorer",
    });
    expect(requests("GET", "/api/stations").length).toBeGreaterThanOrEqual(2);
  });

  it("opens the add dialog prefilled when coming from a mission", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    mockFetch(stationRoutes([]));
    renderStations(moderator, { initialCreateStation: { portal: "1234567890AB", galaxy: 0, ownerId: "other-1" } });

    const dialog = screen.getByRole("dialog", { name: t("stations.add_station") });
    expect(
      within(dialog).queryByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialog).getByRole("textbox", { name: t("stations.station_name") })).toHaveValue("Testara System"),
    );
    expect(replaceState).toHaveBeenCalledWith(null, "", "/stations");
  });
});

describe("StationsPage filters and panels", () => {
  const planetStation = station({
    portal: "1234567890AD",
    name: undefined,
    ownerName: undefined,
    planet: { lines: { headline: { word: "Planetia" }, band: { type: { word: "Lush" } } } },
    missionStatus: "completed",
    hasMissions: true,
  });

  it("filters a member's stations by mission state", async () => {
    mockFetch(
      stationRoutes([
        station(),
        station({
          portal: "1234567890AC",
          name: "Assigned Base",
          missionStatus: "in_progress",
          hasAssignedMission: true,
        }),
        planetStation,
      ]),
    );
    const { user } = renderStations();

    expect((await screen.findAllByText("Assigned Base")).length).toBeGreaterThan(0);
    await user.type(
      screen.getByRole("textbox", { name: t("stations.search_stations_by_portal_owner_or_galaxy_or_notes") }),
      "planetia",
    );
    expect(screen.queryAllByText("Home Base")).toHaveLength(0);
    expect(screen.getAllByText("Planetia").length).toBeGreaterThan(0);
    await user.clear(
      screen.getByRole("textbox", { name: t("stations.search_stations_by_portal_owner_or_galaxy_or_notes") }),
    );

    await user.click(screen.getByRole("tab", { name: new RegExp(t("stations.filter_my_missions")) }));
    expect(screen.getAllByText("Assigned Base").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Home Base")).toHaveLength(0);

    await user.click(screen.getByRole("tab", { name: new RegExp(t("common.pending_status_label")) }));
    expect(screen.getAllByText("Home Base").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Assigned Base")).toHaveLength(0);

    await user.click(screen.getByRole("tab", { name: new RegExp(t("stations.filter_mission_completed")) }));
    expect(screen.getAllByText("Planetia").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Home Base")).toHaveLength(0);
  });

  it("keeps the notes filter harmless after the profile drops the moderator role", async () => {
    const { requests } = mockFetch(
      stationRoutes([station({ note: "Bring fuel" }), station({ portal: "1234567890AC", name: "Far Outpost" })], {
        "PATCH /api/profile": { ...moderator, nmsName: "Modded", role: "user" },
      }),
    );
    const { user } = renderStations(moderator);

    await user.click(await screen.findByRole("tab", { name: new RegExp(t("stations.filter_with_notes")) }));
    expect(screen.getAllByText("Home Base").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Far Outpost")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: t("profile.my_profile") }));
    let profile = screen.getByRole("dialog", { name: t("profile.my_nms_profile") });
    await user.click(within(profile).getAllByRole("button", { name: t("common.close") })[0]);
    expect(screen.queryByRole("dialog", { name: t("profile.my_nms_profile") })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t("profile.my_profile") }));
    profile = screen.getByRole("dialog", { name: t("profile.my_nms_profile") });
    await user.click(within(profile).getByRole("button", { name: t("profile.save_profile") }));
    expect(await within(profile).findByText(t("profile.profile_saved"))).toBeInTheDocument();
    expect(requests("PATCH", "/api/profile")).toHaveLength(1);

    // Senza ruolo da moderatore il filtro delle note non filtra più nulla.
    expect(screen.getAllByText("Far Outpost").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Home Base").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: t("stations.export_stations_to_excel") })).not.toBeInTheDocument();
  });

  it("lets the admin edit the alliance settings", async () => {
    const admin = makeMember({ publicId: "admin-1", nmsName: "Boss", role: "admin", simpleView: false });
    mockFetch(
      stationRoutes([], {
        "GET /api/alliance": defaultAlliance,
        "PATCH /api/alliance": { ...defaultAlliance, name: "Renamed Alliance" },
      }),
    );
    const { user } = renderStations(admin);

    await user.click(screen.getByRole("button", { name: t("admin.alliance_settings") }));
    const settings = screen.getByRole("dialog", { name: t("admin.alliance") });
    await waitFor(() =>
      expect(within(settings).getByRole("textbox", { name: t("admin.alliance_name") })).toHaveValue("Test Alliance"),
    );
    await user.click(within(settings).getByRole("button", { name: t("admin.save_settings") }));
    expect(await within(settings).findByText(t("admin.alliance_settings_saved"))).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Renamed Alliance"));

    await user.click(within(settings).getByRole("button", { name: t("common.close") }));
    expect(screen.queryByRole("dialog", { name: t("admin.alliance") })).not.toBeInTheDocument();
  });

  it("opens and closes the owner's profile card", async () => {
    mockFetch(
      stationRoutes([station({ ownerId: "other-1", ownerName: "Other Pilot" })], {
        "/api/members?id=other-1": { ...otherMember, role: "user" },
      }),
    );
    const { user } = renderStations();

    const [owner] = await screen.findAllByRole("button", { name: "Other Pilot" });
    await user.click(owner);
    const card = screen.getByRole("dialog", { name: t("profile.nms_profile") });
    await user.click(within(card).getByRole("button", { name: t("common.close") }));
    expect(screen.queryByRole("dialog", { name: t("profile.nms_profile") })).not.toBeInTheDocument();
  });
});

describe("StationsPage owners and missions", () => {
  async function addStationFor(user: ReturnType<typeof renderStations>["user"], ownerId: string, portal: string) {
    await user.click(screen.getByRole("button", { name: t("stations.add_station") }));
    const dialog = screen.getByRole("dialog", { name: t("stations.add_station") });
    const owner = within(dialog).getByRole("combobox", { name: t("stations.station_owner") });
    await waitFor(() => expect(within(owner).getAllByRole("option")).toHaveLength(3));
    await user.selectOptions(owner, ownerId);
    await user.type(within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }), portal);
    const add = within(dialog).getByRole("button", { name: t("common.add") });
    await waitFor(() => expect(add).toBeEnabled(), { timeout: 2000 });
    await user.click(add);
  }

  it("names the owner in the notice with the profile name or a placeholder", async () => {
    const realName = makeMember({ publicId: "real-1", nmsName: "", name: "Real Name" });
    const nameless = makeMember({ publicId: "anon-1", nmsName: "", name: "" });
    mockFetch(
      stationRoutes([], {
        "/api/members": [moderator, realName, nameless],
        "/api/missions/verify-system": { found: true },
        "POST /api/stations": { stations: [] },
      }),
    );
    const { user } = renderStations(moderator);

    await addStationFor(user, "real-1", "1234567890AB");
    expect(
      await screen.findByText(t("stations.station_added_to_owner_s_archive", { owner: "Real Name" })),
    ).toBeInTheDocument();

    await addStationFor(user, "anon-1", "1234567890AC");
    expect(
      await screen.findByText(t("stations.station_added_to_owner_s_archive", { owner: t("common.not_specified") })),
    ).toBeInTheDocument();
  });

  it("lets an explorer open a mission for their own specialty", async () => {
    const explorer = makeMember({
      publicId: "explorer-1",
      nmsName: "",
      name: "Explorer Real",
      specialty: "explorer",
      role: "user",
      simpleView: false,
    });
    const { requests } = mockFetch(
      stationRoutes([{ ...planetlessName(), ownerId: "other-1", ownerName: "Other Pilot" }], {
        "/api/missions/verify-system": { found: true },
        "POST /api/missions": [{ id: "a" }],
      }),
    );
    const { user } = renderStations(explorer);

    await user.click(
      await screen.findByRole("button", { name: t("stations.create_mission_from_portal", { portal: "1234567890AB" }) }),
    );
    const dialog = screen.getByRole("dialog", { name: t("missions.new_mission") });
    expect(within(dialog).getByDisplayValue("Planetia")).toBeInTheDocument();
    const create = within(dialog).getByRole("button", { name: t("missions.create_mission") });
    await waitFor(() => expect(create).toBeEnabled(), { timeout: 2000 });
    await user.click(create);

    expect(await screen.findByText(t("stations.mission_created_from_station"))).toBeInTheDocument();
    expect(requests("POST", "/api/missions")[0].body).toMatchObject({
      targetSpecialty: "explorer",
      assignedMemberId: "explorer-1",
      assignedTo: "Explorer Real",
      stationOwnerMemberId: "other-1",
    });
  });

  it("lets a ranger open an explorer mission on their own station", async () => {
    const { requests } = mockFetch(
      stationRoutes([station({ availableSpecialties: ["builder", "ranger"] })], {
        "/api/missions/verify-system": { found: true },
        "POST /api/missions": [{ id: "a" }],
      }),
    );
    const { user } = renderStations();

    await user.click(
      await screen.findByRole("button", { name: t("stations.create_mission_from_portal", { portal: "1234567890AB" }) }),
    );
    const dialog = screen.getByRole("dialog", { name: t("missions.new_mission") });
    const create = within(dialog).getByRole("button", { name: t("missions.create_mission") });
    await waitFor(() => expect(create).toBeEnabled(), { timeout: 2000 });
    await user.click(create);

    expect(await screen.findByText(t("stations.mission_created_from_station"))).toBeInTheDocument();
    expect(requests("POST", "/api/missions")[0].body).toMatchObject({ targetSpecialty: "builder" });
  });

  it("defaults the mission specialty for a moderator without one", async () => {
    const plainModerator = makeMember({
      publicId: "mod-2",
      nmsName: "Plain",
      specialty: "",
      role: "moderator",
      simpleView: false,
    });
    const { requests } = mockFetch(
      stationRoutes(
        [
          station({ availableSpecialties: ["ranger"] }),
          station({ portal: "1234567890AC", name: "Far Outpost", availableSpecialties: ["builder", "explorer"] }),
        ],
        { "/api/missions/verify-system": { found: true }, "POST /api/missions": [{ id: "a" }] },
      ),
    );
    const { user } = renderStations(plainModerator);

    for (const portal of ["1234567890AB", "1234567890AC"]) {
      await user.click(
        await screen.findByRole("button", { name: t("stations.create_mission_from_portal", { portal }) }),
      );
      const dialog = screen.getByRole("dialog", { name: t("missions.new_mission") });
      const create = within(dialog).getByRole("button", { name: t("missions.create_mission") });
      await waitFor(() => expect(create).toBeEnabled(), { timeout: 2000 });
      await user.click(create);
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: t("missions.new_mission") })).not.toBeInTheDocument(),
      );
    }

    expect(screen.getByText(t("stations.mission_created_from_station"))).toBeInTheDocument();
    expect(requests("POST", "/api/missions").map((call) => call.body)).toMatchObject([
      { systemAddress: "1234567890AB", targetSpecialty: "ranger" },
      { systemAddress: "1234567890AC", targetSpecialty: "explorer" },
    ]);
  });

  it("prefills the edit form with the planet title of an unnamed station", async () => {
    mockFetch(stationRoutes([planetlessName()]));
    const { user } = renderStations();

    await user.click(
      await screen.findByRole("button", { name: t("stations.edit_station_portal", { portal: "1234567890AB" }) }),
    );
    const dialog = screen.getByRole("dialog", { name: t("stations.edit_station") });
    expect(within(dialog).getByRole("textbox", { name: t("stations.station_name") })).toHaveValue("Planetia");
  });
});

// Stazione senza nome: il titolo arriva dai dati del pianeta in cache.
function planetlessName() {
  return station({
    name: undefined,
    planet: { lines: { headline: { word: "Planetia" } } },
  });
}
