// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StationsPage } from "@/components/pages/stations-page";
import { galaxyLabel } from "@/lib/galaxies";
import { defaultAlliance, makeMember } from "../helpers/members";
import { json, mockFetch, renderPage, t } from "./helpers";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StationsPage as a member", () => {
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

  it("edits, views notes and removes an own station", async () => {
    const own = station({ note: "Bring fuel" });
    const { requests } = mockFetch(
      stationRoutes([own], {
        "PATCH /api/stations": { stations: [{ ...own, name: "Renamed Base" }] },
        "DELETE /api/stations": { stations: [] },
      }),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const { user } = renderStations();

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
  });

  it("toggles the ranger tasks of an own station and reports failures", async () => {
    const { requests } = mockFetch(
      stationRoutes([station()], {
        "PATCH /api/planet-status": vi
          .fn()
          .mockReturnValueOnce({ systemStatuses: ["station_claimed"] })
          .mockReturnValueOnce(json({ error: "Task locked." }, 403)),
      }),
    );
    const { user } = renderStations();

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

  it("creates missions from a station and refreshes the archive", async () => {
    const { requests } = mockFetch(
      stationRoutes([station({ ownerId: "other-1", ownerName: "Other Pilot" })], {
        "/api/missions/verify-system": { found: true },
        "POST /api/missions": [{ id: "a" }, { id: "b" }],
      }),
    );
    const { user } = renderStations(moderator);

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
