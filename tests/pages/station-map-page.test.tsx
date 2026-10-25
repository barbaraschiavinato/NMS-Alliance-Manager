// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { galaxyLabel } from "@/lib/planets/galaxies";
import { StationMapPage } from "@/components/pages/station-map-page";
import type { StationMapStation } from "@/lib/stations/station-map";
import { defaultAlliance, makeMember } from "../helpers/members";
import { mockFetch, renderPage, t } from "./helpers";

vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);

const station = (overrides: Partial<StationMapStation> = {}): StationMapStation => ({
  portal: "1234567890AB",
  galaxy: 0,
  name: "Home Base",
  ownerId: "owner-1",
  ownerName: "Owner One",
  ...overrides,
});

function renderMap(
  stations: StationMapStation[],
  currentMember = makeMember({ publicId: "me", role: "user", specialty: "explorer" }),
  alliance = defaultAlliance,
  highlight?: { portal: string; galaxy: number },
) {
  return renderPage(
    <StationMapPage
      alliance={alliance}
      highlight={highlight}
      currentMember={currentMember}
      missionCount={0}
      stationCount={stations.length}
      stations={stations}
    />,
  );
}

const svg = () => screen.getByRole("group", { name: t("map.aria_label") });
const viewBox = () =>
  svg()
    .getAttribute("viewBox")!
    .split(" ")
    .map((value) => Number(value));

beforeEach(() => {
  mockFetch({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StationMapPage", () => {
  it("colours the hub red, stations with missions for the member green and the member's own stations orange", () => {
    const { container } = renderMap(
      [
        station({ portal: "1234567890AB", ownerId: "me", name: "Mine" }),
        station({ portal: "2234567890CD", ownerId: "other", name: "Plain" }),
        station({ portal: "3234567890EF", ownerId: "other", name: "Hub" }),
        station({ portal: "4234567890EF", ownerId: "me", name: "Mine in the hub region" }),
        station({ portal: "6234567890BB", ownerId: "other", name: "With a mission", missionAvailable: true }),
        station({ portal: "1234567890AC", ownerId: "me", name: "Mine with a mission", missionAvailable: true }),
      ],
      undefined,
      { ...defaultAlliance, portalCode: "5234567890EF", galaxy: 0 },
    );
    const kinds = [...container.querySelectorAll(".station-map-marker")].map((marker) =>
      [...marker.classList].find((name) => name.startsWith("station-map-marker-")),
    );
    // Painted last is on top: others first, then the member's own, the available ones, the hub last.
    expect(kinds).toEqual([
      "station-map-marker-other",
      "station-map-marker-mine",
      "station-map-marker-available",
      "station-map-marker-available",
      "station-map-marker-hub",
    ]);
    const legend = screen.getByRole("list", { name: t("map.legend") });
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([t("map.legend_hub"), t("map.legend_available"), t("map.legend_mine"), t("map.legend_other")]);
  });

  it("keeps the member's own stations in the primary colour when nothing is available there", () => {
    const { container } = renderMap([station({ ownerId: "me" })]);
    expect(container.querySelector(".station-map-marker-mine")).not.toBeNull();
  });

  it("opens on the galaxy of the link and shows its marker in yellow with a pulse, on top of the others", async () => {
    const { container, user } = renderMap(
      [
        station({ galaxy: 5, portal: "2234567890AB", name: "Linked", ownerId: "me" }),
        station({ galaxy: 5, portal: "3234567890AC", name: "Neighbour" }),
        station({ name: "In Euclid" }),
      ],
      undefined,
      { ...defaultAlliance, portalCode: "3234567890AC", galaxy: 5 },
      { portal: "5234567890AB", galaxy: 5 },
    );
    expect(screen.getByRole("combobox", { name: t("stations.galaxy") })).toHaveValue("5");
    const markers = [...container.querySelectorAll(".station-map-marker")];
    expect(
      markers.map((marker) => [...marker.classList].find((name) => name.startsWith("station-map-marker-"))),
    ).toEqual(["station-map-marker-hub", "station-map-marker-highlight"]);
    expect(markers[1].querySelector(".station-map-pulse")).not.toBeNull();
    expect(container.querySelectorAll(".station-map-pulse")).toHaveLength(1);
    const legend = screen.getByRole("list", { name: t("map.legend") });
    expect(within(legend).getAllByRole("listitem")[0]).toHaveTextContent(t("map.legend_highlight"));

    await user.selectOptions(screen.getByRole("combobox", { name: t("stations.galaxy") }), "0");
    expect(container.querySelector(".station-map-pulse")).toBeNull();
    expect(
      within(screen.getByRole("list", { name: t("map.legend") })).queryByText(t("map.legend_highlight")),
    ).toBeNull();
  });

  it("falls back to Euclid and highlights nothing when the linked galaxy has no stations or the portal is unplaceable", () => {
    const { container, unmount } = renderMap([station()], undefined, undefined, { portal: "1234567890AB", galaxy: 9 });
    expect(screen.getByRole("combobox", { name: t("stations.galaxy") })).toHaveValue("0");
    expect(container.querySelector(".station-map-pulse")).toBeNull();
    unmount();
    const second = renderMap([station()], undefined, undefined, { portal: "123456789000", galaxy: 0 });
    expect(second.container.querySelector(".station-map-pulse")).toBeNull();
    expect(second.container.querySelector(".station-map-marker-highlight")).toBeNull();
  });

  it("leaves the hub out of the legend when the alliance has none", () => {
    renderMap([station()]);
    const legend = screen.getByRole("list", { name: t("map.legend") });
    expect(within(legend).queryByText(t("map.legend_hub"))).not.toBeInTheDocument();
    expect(within(legend).getAllByRole("listitem")).toHaveLength(3);
  });

  it("lets an admin save the alliance settings and the own profile from the header", async () => {
    const admin = makeMember({ publicId: "admin", nmsName: "Chief", role: "admin" });
    mockFetch({
      "GET /api/alliance": defaultAlliance,
      "PATCH /api/alliance": { ...defaultAlliance, name: "Renamed Alliance" },
      "PATCH /api/profile": { ...admin, nmsName: "Captain" },
    });
    const { user } = renderMap([station()], admin);

    await user.click(screen.getByRole("button", { name: t("admin.alliance_settings") }));
    const settings = screen.getByRole("dialog", { name: t("admin.alliance") });
    await waitFor(() =>
      expect(within(settings).getByRole("textbox", { name: t("admin.alliance_name") })).toHaveValue("Test Alliance"),
    );
    await user.click(within(settings).getByRole("button", { name: t("admin.save_settings") }));
    await waitFor(() => expect(screen.getAllByText("Renamed Alliance").length).toBeGreaterThan(0));
    await user.click(within(settings).getByRole("button", { name: t("common.close") }));

    await user.click(screen.getByRole("button", { name: t("profile.my_profile") }));
    const profile = screen.getByRole("dialog", { name: t("profile.my_nms_profile") });
    await user.click(within(profile).getByRole("button", { name: t("profile.save_profile") }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: `Captain · ${t("admin.administrator")}` })).toBeInTheDocument(),
    );
  });

  it("shows an empty message and the invalid-address count when there is nothing to place", () => {
    renderMap([station({ portal: "123456789000" })]);
    expect(screen.getByText(t("map.empty"))).toBeInTheDocument();
    expect(screen.getByText(t("map.hidden_station"))).toBeInTheDocument();
    expect(screen.getByText(t("map.select_hint"))).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /stations? at X/ })).toHaveLength(0);
  });

  it("offers the galaxies with stations, Euclid first and selected, and switches the map", async () => {
    const { user } = renderMap([
      station(),
      station({ galaxy: 5, portal: "2234567890AB", name: "Elsewhere" }),
      station({ galaxy: 5, portal: "3234567890AC", name: "Elsewhere Too" }),
      station({ galaxy: 2, portal: "123456789000", name: "Broken" }),
    ]);
    const select = screen.getByRole("combobox", { name: t("stations.galaxy") });
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([galaxyLabel(0), galaxyLabel(2), galaxyLabel(5)]);
    expect(select).toHaveValue("0");
    expect(screen.getAllByRole("button", { name: /at X/ })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: t("map.zoom_in") }));
    await user.click(screen.getAllByRole("button", { name: /at X/ })[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("common.close") }));
    await user.click(screen.getAllByRole("button", { name: /at X/ })[0]);

    await user.selectOptions(select, "5");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(viewBox()).toEqual([-2048, -2048, 4096, 4096]);
    expect(screen.getAllByRole("button", { name: /at X/ })).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: /at X/ })[0]);
    expect(screen.getByRole("link", { name: "Elsewhere" })).toHaveAttribute(
      "href",
      "/stations/owner-1%3A2234567890AB%3A5?from=map",
    );

    await user.selectOptions(select, "2");
    expect(screen.getByText(t("map.empty"))).toBeInTheDocument();
    expect(screen.getByText(t("map.hidden_station"))).toBeInTheDocument();
  });

  it("marks the stations of Euclid and lists those of the selected region", async () => {
    const { user } = renderMap([
      station(),
      station({ portal: "2345567890AB", name: "Second Base", ownerId: "owner-2", ownerName: "Owner Two" }),
      station({ portal: "3ABC00FEDC12", name: "Far Away" }),
      station({ galaxy: 5, name: "Elsewhere" }),
      station({ portal: "123456789000", name: "Broken" }),
      station({ portal: "123456789800", name: "Reserved" }),
    ]);
    expect(screen.getByText(t("map.hidden_stations", { count: 2 }))).toBeInTheDocument();
    const markers = screen.getAllByRole("button", { name: /at X/ });
    expect(markers).toHaveLength(2);

    const grouped = screen.getByRole("button", { name: t("map.marker_label", { count: 2, x: 171, z: 1929 }) });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(grouped);
    expect(grouped).toHaveAttribute("aria-pressed", "true");
    const dialog = screen.getByRole("dialog", { name: t("map.stations_in_region", { count: 2 }) });
    expect(within(dialog).getByText(t("map.region_coordinates", { x: 171, z: 1929, y: 86 }))).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Home Base" })).toHaveAttribute(
      "href",
      "/stations/owner-1%3A1234567890AB%3A0?from=map",
    );
    expect(within(dialog).getByRole("link", { name: "Second Base" })).toBeInTheDocument();
    expect(within(dialog).getByText("Owner Two")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: t("common.close") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(markers.find((marker) => marker !== grouped)!);
    expect(screen.getByRole("dialog", { name: "Far Away" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Home Base" })).not.toBeInTheDocument();
  });

  it("closes the dialog with Escape or a click outside it, but not from inside", async () => {
    const { user } = renderMap([station()]);
    const marker = screen.getByRole("button", { name: /at X/ });
    await user.click(marker);
    const dialog = screen.getByRole("dialog", { name: "Home Base" });
    await user.click(within(dialog).getByRole("link", { name: "Home Base" }));
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(marker);
    await user.click(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("falls back to the portal code for unnamed stations and selects markers with the keyboard", () => {
    renderMap([station({ name: "" })]);
    const marker = screen.getByRole("button", { name: /at X/ });
    fireEvent.keyDown(marker, { key: "Tab" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.keyDown(marker, { key: "Enter" });
    expect(screen.getByRole("dialog", { name: "1234567890AB" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(marker, { key: " " });
    expect(marker).toHaveAttribute("aria-pressed", "true");
  });

  it("zooms with the buttons and the mouse wheel and goes back to the whole galaxy", async () => {
    const { user } = renderMap([station()]);
    expect(viewBox()).toEqual([-2048, -2048, 4096, 4096]);
    await user.click(screen.getByRole("button", { name: t("map.zoom_in") }));
    const zoomed = viewBox();
    expect(zoomed[2]).toBeLessThan(4096);
    await user.click(screen.getByRole("button", { name: t("map.zoom_out") }));
    expect(viewBox()[2]).toBeGreaterThan(zoomed[2]);

    const wheel = new WheelEvent("wheel", { deltaY: -100, cancelable: true, clientX: 10, clientY: 10 });
    act(() => {
      svg().dispatchEvent(wheel);
    });
    expect(wheel.defaultPrevented).toBe(true);
    const afterWheelIn = viewBox()[2];
    act(() => {
      svg().dispatchEvent(new WheelEvent("wheel", { deltaY: 100, cancelable: true }));
    });
    expect(viewBox()[2]).toBeGreaterThan(afterWheelIn);

    await user.click(screen.getByRole("button", { name: t("map.reset_view") }));
    expect(viewBox()).toEqual([-2048, -2048, 4096, 4096]);
  });

  it("pans by dragging and does not select the marker released after a drag", async () => {
    const { user } = renderMap([station()]);
    await user.click(screen.getByRole("button", { name: t("map.zoom_in") }));
    const before = viewBox();
    const marker = screen.getByRole("button", { name: /at X/ });

    fireEvent.pointerMove(svg(), { pointerId: 1, clientX: 300, clientY: 300 });
    expect(viewBox()).toEqual(before);
    fireEvent.pointerDown(svg(), { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg(), { pointerId: 2, clientX: 150, clientY: 150 });
    fireEvent.pointerMove(svg(), { pointerId: 1, clientX: 102, clientY: 101 });
    expect(viewBox()).toEqual(before);
    fireEvent.pointerMove(svg(), { pointerId: 1, clientX: 40, clientY: 60 });
    const panned = viewBox();
    expect(panned[0]).toBeGreaterThan(before[0]);
    expect(panned[1]).toBeGreaterThan(before[1]);
    fireEvent.click(marker);
    expect(marker).toHaveAttribute("aria-pressed", "false");
    fireEvent.pointerUp(svg(), { pointerId: 1 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    fireEvent.click(marker);
    expect(marker).toHaveAttribute("aria-pressed", "true");
  });

  it("captures the pointer only once a drag starts, so that clicks still reach the markers", () => {
    renderMap([station()]);
    const capture = vi.fn();
    Object.assign(svg(), { setPointerCapture: capture });
    fireEvent.pointerDown(svg(), { pointerId: 1, clientX: 100, clientY: 100 });
    expect(capture).not.toHaveBeenCalled();
    fireEvent.pointerMove(svg(), { pointerId: 1, clientX: 101, clientY: 100 });
    expect(capture).not.toHaveBeenCalled();
    fireEvent.pointerMove(svg(), { pointerId: 1, clientX: 60, clientY: 60 });
    fireEvent.pointerMove(svg(), { pointerId: 1, clientX: 30, clientY: 30 });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(1);
  });

  it("ignores moves and releases when nothing is being dragged", () => {
    renderMap([station()]);
    const before = viewBox();
    fireEvent.pointerCancel(svg(), { pointerId: 1 });
    fireEvent.pointerMove(svg(), { pointerId: 1, clientX: 10, clientY: 10 });
    expect(viewBox()).toEqual(before);
  });
});
