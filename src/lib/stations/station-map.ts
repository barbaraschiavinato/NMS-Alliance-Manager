import { decodePortalAddress } from "@/lib/missions/missions";
import { isSameSystem, type SystemIdentity } from "@/lib/navigation/detail-links";

// Portal coordinates are signed voxel offsets from the galactic centre: X and Z span -2048..2047.
export const galaxyExtent = 2048;
export const euclidGalaxy = 0;
const minViewSize = 96;

export type StationMapStation = Readonly<{
  portal: string;
  galaxy: number;
  name: string;
  ownerId: string;
  ownerName: string;
}>;

export type StationMapMarker = Readonly<{
  key: string;
  x: number;
  y: number;
  z: number;
  stations: readonly StationMapStation[];
}>;

export type StationMapMarkerKind = "hub" | "mine" | "other";

// A region with several stations takes the most notable kind: the alliance hub, then the member's own stations.
export function stationMapMarkerKind(
  marker: StationMapMarker,
  memberId: string,
  hub: SystemIdentity | null,
): StationMapMarkerKind {
  if (hub && marker.stations.some((station) => isSameSystem(station, hub))) return "hub";
  return marker.stations.some((station) => station.ownerId === memberId) ? "mine" : "other";
}

export type StationMapView = Readonly<{ x: number; y: number; size: number }>;

export const fullMapView: StationMapView = { x: -galaxyExtent, y: -galaxyExtent, size: galaxyExtent * 2 };

// Galaxies that hold stations, Euclid (the default) always included.
export function stationMapGalaxies(stations: readonly StationMapStation[]): number[] {
  return [...new Set([euclidGalaxy, ...stations.map((station) => station.galaxy)])].sort((a, b) => a - b);
}

function placedRegion(portal: string) {
  const decoded = decodePortalAddress(portal);
  return decoded && decoded.errors.length === 0 && decoded.x !== null && decoded.z !== null
    ? { x: decoded.x, y: decoded.y, z: decoded.z }
    : null;
}

const regionKey = (region: Readonly<{ x: number; z: number }>) => `${region.x}:${region.z}`;

// Key of the marker that holds a portal address (the region it belongs to), or null for an invalid address.
export function stationMapRegionKey(portal: string): string | null {
  const region = placedRegion(portal);
  return region ? regionKey(region) : null;
}

// Stations of the same region share one marker; `hidden` counts the stations of the galaxy without a valid address.
export function stationMapMarkers(stations: readonly StationMapStation[], galaxy = euclidGalaxy) {
  const byRegion = new Map<string, { x: number; y: number; z: number; stations: StationMapStation[] }>();
  let hidden = 0;
  for (const station of stations) {
    if (station.galaxy !== galaxy) continue;
    const placed = placedRegion(station.portal);
    if (!placed) {
      hidden += 1;
      continue;
    }
    const key = regionKey(placed);
    const region = byRegion.get(key) ?? { ...placed, stations: [] };
    region.stations.push(station);
    byRegion.set(key, region);
  }
  const markers: StationMapMarker[] = [...byRegion].map(([key, region]) => ({ key, ...region }));
  return { markers, hidden };
}

function clampView(view: StationMapView): StationMapView {
  const size = Math.min(Math.max(view.size, minViewSize), fullMapView.size);
  return {
    size,
    x: Math.min(Math.max(view.x, -galaxyExtent), galaxyExtent - size),
    y: Math.min(Math.max(view.y, -galaxyExtent), galaxyExtent - size),
  };
}

// Zooms around a point of the map (the centre of the view by default), keeping that point under the pointer.
export function zoomMapView(view: StationMapView, factor: number, around?: Readonly<{ x: number; y: number }>) {
  const size = Math.min(Math.max(view.size / factor, minViewSize), fullMapView.size);
  const focus = around ?? { x: view.x + view.size / 2, y: view.y + view.size / 2 };
  const ratio = size / view.size;
  return clampView({ size, x: focus.x - (focus.x - view.x) * ratio, y: focus.y - (focus.y - view.y) * ratio });
}

export function panMapView(view: StationMapView, dx: number, dy: number) {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy });
}
