export type SystemIdentity = Readonly<{ portal: string; galaxy: number }>;
export type StationIdentity = SystemIdentity & Readonly<{ ownerId: string }>;
export const detailOrigins = {
  stations: { href: "/stations", label: "details.back_to_stations" },
  planets: { href: "/planets", label: "details.back_to_planets" },
  map: { href: "/map", label: "details.back_to_map" },
  missions: { href: "/missions", label: "details.back_to_missions" },
  messages: { href: "/messages", label: "details.back_to_messages" },
  help: { href: "/help-requests", label: "details.back_to_help" },
  taxi: { href: "/taxi", label: "details.back_to_taxi" },
} as const;
export type DetailOrigin = keyof typeof detailOrigins;

export function internalDetailDestination(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 8192 || /[\\\s#]/.test(value)) return undefined;
  if (!/^\/(stations|missions|planets|map|messages|help-requests|taxi)(\/[^/?]+)?(?:\?[^#]*)?$/.test(value))
    return undefined;
  if (
    value
      .split("?")[0]
      .split("/")
      .some((part) => part === "." || part === "..")
  )
    return undefined;
  if (/%2f|%5c|%2e/i.test(value.split("?")[0])) return undefined;
  return value;
}

export function contextualDetailHref(href: string, current: string): string {
  const source = internalDetailDestination(current);
  if (!source || href.split("?")[0] === source.split("?")[0]) return href;
  const url = new URL(href, "https://navigation.invalid");
  url.searchParams.set("returnTo", source);
  return `${url.pathname}${url.search}`;
}

export function detailReturnDestination(current: string, fallback: string, deletedPath?: string): string {
  const url = new URL(current || "/", "https://navigation.invalid");
  const destination = internalDetailDestination(url.searchParams.get("returnTo"));
  if (!destination || destination.split("?")[0] === (deletedPath ?? url.pathname)) return fallback;
  return destination;
}

export function parseDetailOrigin(value: unknown): DetailOrigin {
  return typeof value === "string" && Object.hasOwn(detailOrigins, value) ? (value as DetailOrigin) : "stations";
}

export function stationId(station: StationIdentity) {
  return `${station.ownerId}:${station.portal.toUpperCase()}:${station.galaxy}`;
}

export function stationDetailHref(station: StationIdentity | string, origin?: DetailOrigin) {
  const href = `/stations/${encodeURIComponent(typeof station === "string" ? station : stationId(station))}`;
  return origin ? `${href}?from=${origin}` : href;
}

export function missionDetailHref(id: string, origin: DetailOrigin = "missions") {
  return `/missions/${encodeURIComponent(id)}?from=${origin}`;
}

export function taxiDetailHref(id: string) {
  return `/taxi/${encodeURIComponent(id)}`;
}

export function findMissionStation<T extends SystemIdentity>(
  mission: Readonly<{ systemAddress: string; galaxy: number }>,
  stations: readonly T[],
): T | undefined {
  return stations.find(
    (station) => station.portal === mission.systemAddress.toUpperCase() && station.galaxy === mission.galaxy,
  );
}

export function parseStationId(id: string): StationIdentity | null {
  let decodedId: string;
  try {
    decodedId = decodeURIComponent(id);
  } catch (error) {
    if (error instanceof URIError) return null;
    throw error;
  }
  const match = /^([^:]+):([0-9a-f]{12}):(\d{1,3})$/i.exec(decodedId);
  if (!match || Number(match[3]) > 255) return null;
  return { ownerId: match[1], portal: match[2].toUpperCase(), galaxy: Number(match[3]) };
}

export function isSameSystem(first: SystemIdentity, second: SystemIdentity) {
  return first.galaxy === second.galaxy && first.portal.slice(1).toUpperCase() === second.portal.slice(1).toUpperCase();
}
