import { describe, expect, it } from "vitest";
import {
  fullMapView,
  galaxyExtent,
  panMapView,
  stationMapMarkerKind,
  stationMapMarkers,
  zoomMapView,
  type StationMapStation,
} from "@/lib/stations/station-map";

const station = (overrides: Partial<StationMapStation> = {}): StationMapStation => ({
  portal: "1234567890AB",
  galaxy: 0,
  name: "Home Base",
  ownerId: "owner-1",
  ownerName: "Owner",
  ...overrides,
});

describe("stationMapMarkers", () => {
  it("places a station by its signed portal coordinates", () => {
    const { markers, hidden } = stationMapMarkers([station({ portal: "1234567890AB" })]);
    // Glyphs: planet 1, system 234, Y 56, Z 789, X 0AB.
    expect(markers).toEqual([
      { key: "171:1929", x: 171, y: 86, z: 1929, stations: [expect.objectContaining({ name: "Home Base" })] },
    ]);
    expect(hidden).toBe(0);
  });

  it("folds the upper half of the range into negative coordinates", () => {
    const { markers } = stationMapMarkers([station({ portal: "0123FF8FFFFF" })]);
    expect(markers[0]).toMatchObject({ x: -1, y: -1, z: -1793 });
  });

  it("groups the stations of the same region in one marker", () => {
    const { markers } = stationMapMarkers([
      station({ portal: "1234567890AB", name: "A" }),
      station({ portal: "2345567890AB", name: "B" }),
      station({ portal: "1234567890AC", name: "C" }),
    ]);
    expect(markers).toHaveLength(2);
    expect(markers.find((marker) => marker.stations.length === 2)?.stations.map((item) => item.name)).toEqual([
      "A",
      "B",
    ]);
  });

  it("leaves out stations of other galaxies and invalid or reserved addresses", () => {
    const { markers, hidden } = stationMapMarkers([
      station(),
      station({ galaxy: 1 }),
      station({ portal: "not-a-portal" }),
      station({ portal: "123456789000" }),
      station({ portal: "123456789800" }),
    ]);
    expect(markers).toHaveLength(1);
    expect(hidden).toBe(4);
  });
});

describe("stationMapMarkerKind", () => {
  const marker = (...owners: string[]) => ({
    key: "k",
    x: 1,
    y: 1,
    z: 1,
    stations: owners.map((ownerId, index) => station({ ownerId, portal: `${index + 1}234567890AB` })),
  });

  it("flags the hub system first, then the member's own stations", () => {
    const hub = { portal: "9234567890AB", galaxy: 0 };
    expect(stationMapMarkerKind(marker("me", "other"), "me", hub)).toBe("hub");
    expect(stationMapMarkerKind(marker("other"), "me", hub)).toBe("hub");
    expect(stationMapMarkerKind(marker("me", "other"), "me", null)).toBe("mine");
    expect(stationMapMarkerKind(marker("other"), "me", null)).toBe("other");
  });

  it("ignores a hub in another galaxy", () => {
    expect(stationMapMarkerKind(marker("other"), "me", { portal: "1234567890AB", galaxy: 3 })).toBe("other");
  });
});

describe("map view", () => {
  it("zooms around the centre by default and around a given point", () => {
    expect(zoomMapView(fullMapView, 2)).toEqual({ x: -1024, y: -1024, size: 2048 });
    const around = zoomMapView(fullMapView, 2, { x: -2048, y: -2048 });
    expect(around).toEqual({ x: -2048, y: -2048, size: 2048 });
  });

  it("never zooms out of the galaxy or deeper than the minimum size", () => {
    expect(zoomMapView(fullMapView, 0.5)).toEqual(fullMapView);
    expect(zoomMapView(fullMapView, 1000).size).toBe(96);
  });

  it("keeps the view inside the galaxy while panning", () => {
    const zoomed = zoomMapView(fullMapView, 4);
    expect(panMapView(zoomed, 100000, 100000)).toEqual({
      x: galaxyExtent - zoomed.size,
      y: galaxyExtent - zoomed.size,
      size: zoomed.size,
    });
    expect(panMapView(zoomed, -100000, -100000)).toEqual({ x: -galaxyExtent, y: -galaxyExtent, size: zoomed.size });
    expect(panMapView(zoomed, 10, -10)).toEqual({ ...zoomed, x: zoomed.x + 10, y: zoomed.y - 10 });
  });
});
