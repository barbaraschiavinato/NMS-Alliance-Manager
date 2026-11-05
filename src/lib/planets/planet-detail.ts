import type { PlanetDestination } from "@/components/cards/planet-destination-card";
import type { StationDetail } from "@/components/pages/stations-page";
import type { AllianceMember } from "@/lib/members/access-store";
import type { Mission } from "@/lib/missions/missions";
import { readAlmanacResponse } from "@/lib/almanac/almanac-store";
import { isSameSystem, stationId, type DetailOrigin } from "@/lib/navigation/detail-links";
import { loadPlanetDestinations, planetDestinationDetails } from "@/lib/planets/planet-destinations";
import { canMarkPlanetVisited, planetVisitKey } from "@/lib/planets/planet-visits";
import { readPlanetVisits } from "@/lib/planets/planet-visits-store";
import type { OwnedStationPortal } from "@/lib/stations/stations-store";

// What a farm or pet says about its planet; the rest comes from the Almanac cache.
export type PlanetDetailTarget = Readonly<{
  portal: string;
  galaxy: number;
  planetName: string;
  systemName?: string;
}>;

export type PlanetDetailData = Readonly<{
  planetDataUnavailable?: boolean;
  stationDetail?: StationDetail;
  planet?: PlanetDestination;
}>;

function targetPlanet(target: PlanetDetailTarget, cached: Record<string, unknown> | null): PlanetDestination {
  return {
    id: `${target.portal}:${target.galaxy}`,
    portal: target.portal,
    planetPortal: target.portal,
    planetNumber: Math.max(1, Number.parseInt(target.portal[0], 16)),
    galaxy: target.galaxy,
    system: target.systemName,
    almanacName: target.planetName,
    almanacSearchIndex: target.planetName,
    almanacFacts: [],
    systemFacts: [],
    plants: [],
    minerals: [],
    valuables: [],
    dissonant: false,
    paradise: false,
    blackMarket: false,
    ...(cached ? planetDestinationDetails(cached) : {}),
  };
}

// Cache-only detail of a planet that belongs to a farm or a pet: the registered station of its system (with the
// missions, system and planets) when the member can see one, otherwise just the planet if the Almanac cache has it.
export async function loadPlanetDetail({
  member,
  members,
  missions,
  stations,
  target,
  origin,
}: Readonly<{
  member: AllianceMember;
  members: AllianceMember[];
  missions: Mission[];
  stations: OwnedStationPortal[];
  target: PlanetDetailTarget;
  origin: DetailOrigin;
}>): Promise<PlanetDetailData> {
  const station = stations.find((entry) => isSameSystem(entry, target));
  if (station) {
    const systemMissions = missions.filter((mission) =>
      isSameSystem({ portal: mission.systemAddress, galaxy: mission.galaxy }, target),
    );
    const systemStations = stations.filter((entry) => isSameSystem(entry, target));
    const loaded = await loadPlanetDestinations(member, members, systemMissions, systemStations, {
      featuredPlanet: target,
      cacheOnly: true,
    });
    let featuredPlanet: PlanetDestination | undefined = loaded.planets.find(
      (planet) => planet.planetPortal === target.portal && planet.galaxy === target.galaxy,
    );
    let planetDataUnavailable = false;
    if (!featuredPlanet) {
      const cached = await readAlmanacResponse(target.portal, target.galaxy, true);
      const canMarkVisited = canMarkPlanetVisited(member, systemMissions, systemStations, target.portal, target.galaxy);
      const visited = canMarkVisited
        ? (await readPlanetVisits(member.publicId)).includes(planetVisitKey(target.portal, target.galaxy))
        : false;
      featuredPlanet = {
        ...targetPlanet(target, cached),
        portal: station.portal,
        system: target.systemName || station.name,
        station: {
          id: stationId(station),
          portal: station.portal,
          galaxy: station.galaxy,
          name: station.name,
        },
        ...(canMarkVisited ? { canMarkVisited: true, visited } : {}),
      };
      planetDataUnavailable = !cached;
    }
    return {
      planetDataUnavailable,
      stationDetail: {
        station: { portal: station.portal, galaxy: station.galaxy, ownerId: station.ownerId },
        system: { portal: station.portal, galaxy: station.galaxy },
        origin,
        ...loaded,
        featuredPlanet,
      },
    };
  }
  const cached = await readAlmanacResponse(target.portal, target.galaxy, true);
  if (!cached) return {};
  const canMarkVisited = canMarkPlanetVisited(member, missions, stations, target.portal, target.galaxy);
  const visited = canMarkVisited
    ? (await readPlanetVisits(member.publicId)).includes(planetVisitKey(target.portal, target.galaxy))
    : false;
  return { planet: { ...targetPlanet(target, cached), ...(canMarkVisited ? { canMarkVisited: true, visited } : {}) } };
}
