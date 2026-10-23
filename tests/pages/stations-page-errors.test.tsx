// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StationsPage } from "@/components/pages/stations-page";
import { galaxyLabel } from "@/lib/planets/galaxies";
import { defaultAlliance, makeMember } from "../helpers/members";
import { json, mockFetch, renderPage, t } from "./helpers";

vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);
vi.mock("@/lib/nms-core/system.js", async () => (await import("./helpers")).nmsCoreModule);

// Failure paths of the stations page: API errors without a message, rejected requests, invalid input.

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
    "/api/members": [ranger, moderator],
    ...overrides,
  };
}

// fetch che rifiuta con un valore che non è un Error.
function rejectWith(value: unknown) {
  return () => Promise.reject(value as Error);
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
  vi.restoreAllMocks();
});

describe("StationsPage loading errors", () => {
  it("falls back to a generic message when the stations response has no error", async () => {
    mockFetch(stationRoutes([], { "GET /api/stations": json(null, 500) }));
    renderStations();

    expect(await screen.findByText("Unable to load space stations.")).toBeInTheDocument();
  });

  it("uses the generic message when the stations response is an object without an error", async () => {
    mockFetch(stationRoutes([], { "GET /api/stations": json({ stations: "nope" }) }));
    renderStations();

    expect(await screen.findByText("Unable to load space stations.")).toBeInTheDocument();
  });

  it("reports a stations request rejected with a non-Error value", async () => {
    mockFetch(stationRoutes([], { "GET /api/stations": rejectWith("down") }));
    renderStations();

    expect(await screen.findByText(t("errors.unable_to_load_space_stations"))).toBeInTheDocument();
  });

  it("reports a members request rejected with a non-Error value", async () => {
    mockFetch(stationRoutes([], { "/api/members": rejectWith("down") }));
    renderStations(moderator);

    expect(await screen.findByText(t("errors.unable_to_load_members"))).toBeInTheDocument();
  });

  it("shows the planet status error message from the API", async () => {
    mockFetch(stationRoutes([station()], { "GET /api/planet-status": json({ error: "Status offline." }, 500) }));
    renderStations();

    expect(await screen.findByText("Status offline.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: t("station_claimed") })).not.toBeInTheDocument();
  });

  it("falls back to a generic message for planet status failures", async () => {
    mockFetch(stationRoutes([], { "GET /api/planet-status": json([], 500) }));
    renderStations();

    expect(await screen.findByText(t("errors.request_failed"))).toBeInTheDocument();
  });

  it("falls back to a generic message when the planet status request rejects without an Error", async () => {
    mockFetch(stationRoutes([], { "GET /api/planet-status": rejectWith("down") }));
    renderStations();

    expect(await screen.findByText(t("errors.request_failed"))).toBeInTheDocument();
  });

  it("aborts the planet status request when the page unmounts and ignores its failure", async () => {
    let signal: AbortSignal | undefined;
    const errors = vi.spyOn(console, "error");
    mockFetch(stationRoutes([]));
    const fetchMock = vi.mocked(fetch);
    const defaultFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input, init) => {
      if (String(input) !== "/api/planet-status") return defaultFetch(input, init);
      signal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    const { unmount } = renderStations();
    await screen.findByText(t("stations.no_saved_portals"));

    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => undefined);
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("StationsPage action errors", () => {
  it("unchecks a ranger task and reports failures without a message", async () => {
    const { requests } = mockFetch(
      stationRoutes([station()], {
        "GET /api/planet-status": { planets: { "0:1234567890AB": ["station_claimed", "renamed"] } },
        "PATCH /api/planet-status": vi
          .fn()
          .mockReturnValueOnce({ systemStatuses: ["renamed"] })
          .mockReturnValueOnce(json({ systemStatuses: ["bogus"] }))
          .mockImplementationOnce(rejectWith("down")),
      }),
    );
    const { user } = renderStations();

    const claimed = await screen.findByRole("checkbox", { name: t("station_claimed") });
    await waitFor(() => expect(claimed).toBeChecked());
    await user.click(claimed);
    await waitFor(() => expect(claimed).not.toBeChecked());
    expect(requests("PATCH", "/api/planet-status")[0].body).toEqual({
      portal: "1234567890AB",
      galaxy: 0,
      systemStatuses: ["renamed"],
    });

    await user.click(claimed);
    expect(await screen.findByText(t("errors.request_failed"))).toBeInTheDocument();
    expect(requests("PATCH", "/api/planet-status")[1].body).toMatchObject({
      systemStatuses: ["renamed", "station_claimed"],
    });

    await user.click(screen.getByRole("checkbox", { name: t("renamed") }));
    await waitFor(() => expect(requests("PATCH", "/api/planet-status")).toHaveLength(3));
    expect(await screen.findByText(t("errors.request_failed"))).toBeInTheDocument();
  });

  it("exports with a revoked object URL and reports unreadable or rejected export errors", async () => {
    const createObjectURL = vi.fn(() => "blob:stations");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    mockFetch(
      stationRoutes([], {
        "/api/stations/export": vi
          .fn()
          .mockReturnValueOnce(new Response("xlsx", { status: 200 }))
          .mockReturnValueOnce(new Response("not json", { status: 500 }))
          .mockImplementationOnce(rejectWith("down")),
      }),
    );
    const { user } = renderStations(moderator);

    await user.click(screen.getByRole("button", { name: t("stations.export_stations_to_excel") }));
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:stations"), { timeout: 2000 });

    await user.click(screen.getByRole("button", { name: t("stations.export_stations_to_excel") }));
    expect(await screen.findByText(t("stations.error_unable_to_export_stations"))).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t("stations.export_stations_to_excel") }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: t("stations.export_stations_to_excel") })).toBeEnabled(),
    );
    expect(screen.getByText(t("stations.error_unable_to_export_stations"))).toBeInTheDocument();
  });

  it("refuses to save a stored station with an invalid portal", async () => {
    const { requests } = mockFetch(
      stationRoutes([
        station({ portal: "F234567890AB", hasMissions: true, missionStatus: "in_progress" }),
        station({ portal: "BAD", name: "Broken", hasMissions: true }),
      ]),
    );
    const { user } = renderStations();

    await user.click(
      await screen.findByRole("button", { name: t("stations.edit_station_portal", { portal: "F234567890AB" }) }),
    );
    let dialog = screen.getByRole("dialog", { name: t("stations.edit_station") });
    expect(within(dialog).queryByRole("combobox", { name: t("stations.galaxy") })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: t("common.save") }));
    expect(await within(dialog).findByText("Planet index 15: allowed range is 0–6.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: t("common.cancel") }));

    await user.click(screen.getByRole("button", { name: t("stations.edit_station_portal", { portal: "BAD" }) }));
    dialog = screen.getByRole("dialog", { name: t("stations.edit_station") });
    await user.click(within(dialog).getByRole("button", { name: t("common.save") }));
    expect(await within(dialog).findByText(t("stations.enter_a_12_glyph_portal_address"))).toBeInTheDocument();
    expect(requests("PATCH", "/api/stations")).toHaveLength(0);
  });

  it("asks a moderator to pick the owner when the stored station has none", async () => {
    const { requests } = mockFetch(stationRoutes([station({ ownerId: "", ownerName: "", hasMissions: true })]));
    const { user } = renderStations(moderator);

    await user.click(
      await screen.findByRole("button", { name: t("stations.edit_station_portal", { portal: "1234567890AB" }) }),
    );
    const dialog = screen.getByRole("dialog", { name: t("stations.edit_station") });
    await user.click(within(dialog).getByRole("button", { name: t("common.save") }));
    expect(await within(dialog).findByText(t("stations.select_the_station_owner"))).toBeInTheDocument();
    expect(requests("PATCH", "/api/stations")).toHaveLength(0);
  });

  it("falls back to generic save errors", async () => {
    mockFetch(
      stationRoutes([station({ note: undefined })], {
        "PATCH /api/stations": vi.fn().mockReturnValueOnce(json({}, 500)).mockImplementationOnce(rejectWith("down")),
      }),
    );
    const { user } = renderStations();

    await user.click(
      await screen.findByRole("button", { name: t("stations.edit_station_portal", { portal: "1234567890AB" }) }),
    );
    const dialog = screen.getByRole("dialog", { name: t("stations.edit_station") });
    expect(within(dialog).getByRole("textbox", { name: t("stations.station_notes") })).toHaveValue("");
    const save = within(dialog).getByRole("button", { name: t("common.save") });
    await user.click(save);
    expect(await within(dialog).findByText(t("errors.save_failed"))).toBeInTheDocument();

    await user.type(within(dialog).getByRole("textbox", { name: t("stations.station_notes") }), "x");
    await user.click(save);
    await waitFor(() => expect(save).toBeEnabled());
    expect(within(dialog).getByText(t("errors.save_failed"))).toBeInTheDocument();
  });

  it("falls back to generic removal errors", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { requests } = mockFetch(
      stationRoutes([station()], {
        "DELETE /api/stations": vi
          .fn()
          .mockReturnValueOnce(json({ error: "Station locked." }, 409))
          .mockReturnValueOnce(json({}, 500))
          .mockImplementationOnce(rejectWith("down")),
      }),
    );
    const { user } = renderStations();

    const remove = await screen.findByRole("button", {
      name: t("stations.remove_portal_portal_in_galaxy_from_owner_s_archive", {
        portal: "1234567890AB",
        galaxy: galaxyLabel(0),
        owner: "Ranger One",
      }),
    });
    await user.click(remove);
    expect(await screen.findByText("Station locked.")).toBeInTheDocument();
    await user.click(remove);
    expect(await screen.findByText(t("errors.deletion_failed"))).toBeInTheDocument();
    await user.click(remove);
    await waitFor(() => expect(requests("DELETE", "/api/stations")).toHaveLength(3));
    expect(await screen.findByText(t("errors.deletion_failed"))).toBeInTheDocument();
    expect(screen.getAllByText("Home Base").length).toBeGreaterThan(0);
  });

  it("shows mission creation errors and a failed archive refresh", async () => {
    const { requests } = mockFetch(
      stationRoutes([], {
        "GET /api/stations": vi
          .fn()
          .mockReturnValueOnce({ stations: [station({ ownerId: "other-1", ownerName: "Other" })] })
          .mockReturnValue(json({ error: "Refresh failed." }, 500)),
        "/api/missions/verify-system": { found: true },
        "POST /api/missions": vi
          .fn()
          .mockReturnValueOnce(json({ error: "Mission limit." }, 400))
          .mockReturnValueOnce(json({}, 500))
          .mockReturnValueOnce([{ id: "a" }]),
      }),
    );
    const { user } = renderStations(moderator);

    await user.click(
      await screen.findByRole("button", { name: t("stations.create_mission_from_portal", { portal: "1234567890AB" }) }),
    );
    const dialog = screen.getByRole("dialog", { name: t("missions.new_mission") });
    const create = within(dialog).getByRole("button", { name: t("missions.create_mission") });
    await waitFor(() => expect(create).toBeEnabled(), { timeout: 2000 });
    await user.click(create);
    expect(await within(dialog).findByText("Mission limit.")).toBeInTheDocument();
    await user.click(create);
    expect(await within(dialog).findByText(t("errors.save_failed"))).toBeInTheDocument();
    await user.click(create);

    expect(
      await screen.findByText(t("stations.mission_created_but_station_targets_could_not_be_updated")),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: t("missions.new_mission") })).not.toBeInTheDocument();
    expect(requests("POST", "/api/missions")).toHaveLength(3);
  });
});
