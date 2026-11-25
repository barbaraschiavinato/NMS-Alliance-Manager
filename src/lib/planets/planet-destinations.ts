import { hasRole } from "@/lib/auth/authorization";
import { readFarms } from "@/lib/farms/farms-store";
import { readPets } from "@/lib/pets/pets-store";
import type { AllianceMember } from "@/lib/members/access-store";
import { canViewMission, type Mission } from "@/lib/missions/missions";
import { isSameSystem, type SystemIdentity } from "@/lib/navigation/detail-links";
import { availableMissionSpecialties, canCreateMissionFromStation } from "@/lib/missions/station-mission-availability";
import { serializeMission } from "@/lib/missions/mission-view";
import { getSystemPlanetAddresses } from "@/lib/planets/planet-addresses";
import { systemFeature } from "@/lib/planets/system-feature";
import { canMarkPlanetVisited, planetVisitKey } from "@/lib/planets/planet-visits";
import { readPlanetVisits } from "@/lib/planets/planet-visits-store";
import { almanacSystemLabel, lookupAlmanacPlanets } from "@/lib/almanac/almanac-lookup";
import type { OwnedStationPortal } from "@/lib/stations/stations-store";
import { readMissions, writeMissions } from "@/lib/missions/store";
import { almanacDiscoveryCounts, type AlmanacDiscoveryCounts } from "@/lib/almanac/almanac-discovery-counts";
import { almanacStarCount, almanacSystemFacts, almanacWealth, almanacWord } from "@/lib/almanac/almanac-facts";
import { almanacImageUrl } from "@/lib/almanac/almanac-config";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function almanacResourceNames(value: unknown, kinds: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.flatMap((entry) => {
        const record = asRecord(entry);
        return typeof record?.name === "string" && typeof record.kind === "string" && kinds.includes(record.kind)
          ? [record.name]
          : [];
      }),
    ),
  ];
}

function almanacSearchValues(value: unknown, parentKey = ""): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((entry) => almanacSearchValues(entry, parentKey));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) => {
      if (parentKey === "band" && ["star", "economy", "conflict", "race"].includes(key)) return [];
      return [key, ...almanacSearchValues(entry, key)];
    });
  }
  return [];
}

export function planetDestinationDetails(almanac: Record<string, unknown>) {
  const lines = asRecord(almanac.lines);
  const band = asRecord(lines?.band);
  const headline = asRecord(lines?.headline);
  const imageUrl = almanacImageUrl(asRecord(almanac.pictures)?.disc);
  const planetType = almanacWord(band?.type);
  const economyStars = almanacStarCount(band?.economy);
  const wealth = almanacWealth(band?.economy);
  const almanacName = typeof headline?.word === "string" ? headline.word : undefined;
  return {
    ...(imageUrl ? { imageUrl } : {}),
    ...(almanacName ? { almanacName } : {}),
    almanacSearchIndex: almanacSearchValues(almanac).join(" "),
    almanacFacts: (
      [
        ["common.planet_type_label", planetType],
        ["planet.size", almanacWord(band?.size)],
        ["planet.weather", almanacWord(band?.weather)],
        ["planet.water", almanacWord(band?.water)],
        ["planet.sentinels", almanacWord(band?.sentinels)],
      ] as const
    ).flatMap(([label, value]) => (value ? [{ label, value }] : [])),
    systemFacts: almanacSystemFacts(band),
    discoveryCounts: almanacDiscoveryCounts(band),
    ...(planetType ? { planetType } : {}),
    ...(economyStars !== undefined ? { economyStars } : {}),
    ...(wealth ? { wealth } : {}),
    plants: almanacResourceNames(almanac.carries, ["plant", "consumable"]),
    minerals: almanacResourceNames(almanac.carries, ["mineral"]),
    valuables: almanacResourceNames(almanac.carries, ["tradeable"]),
    dissonant: asRecord(band?.sentinels)?.ink === "exotic",
    paradise: almanac.paradise === true,
    blackMarket: asRecord(band?.economy)?.black_market === true,
  };
}

// Completa le etichette sistema rimaste vuote perché Almanac non era raggiungibile al momento della creazione.
async function fillEmptyMissionSystemLabels(results: Awaited<ReturnType<typeof lookupAlmanacPlanets>>) {
  const labelFor = (mission: { systemAddress: string; galaxy: number }) => {
    const planet = results.get(`${mission.systemAddress.toUpperCase()}:${mission.galaxy}`)?.planet;
    return planet ? almanacSystemLabel(planet) : null;
  };
  try {
    const current = await readMissions();
    if (!current.some((mission) => !mission.system.trim() && labelFor(mission))) return;
    await writeMissions(
      (await readMissions()).map((mission) => {
        const label = mission.system.trim() ? null : labelFor(mission);
        return label ? { ...mission, system: label, systemLabelFromAlmanac: true } : mission;
      }),
    );
  } catch (error) {
    console.error("Unable to reconcile mission system labels", error);
  }
}

export async function loadPlanetDestinations(
  member: AllianceMember,
  members: AllianceMember[],
  missions: Mission[],
  stations: OwnedStationPortal[],
  { featuredPlanet, cacheOnly = false }: Readonly<{ featuredPlanet?: SystemIdentity; cacheOnly?: boolean }> = {},
) {
  const canManage = hasRole(member, "moderator");
  const visibleMissions = missions
    .filter((mission) => canManage || canViewMission(mission, member))
    .map((mission) => serializeMission(mission, members));
  const visibleByAddress = new Map(
    visibleMissions.map((mission) => [`${mission.systemAddress.slice(1).toUpperCase()}:${mission.galaxy}`, mission]),
  );
  const earliestCreatedAt = new Map<string, string>();
  for (const item of [...missions.map((mission) => ({ ...mission, portal: mission.systemAddress })), ...stations]) {
    if (!item.createdAt) continue;
    const key = `${item.portal.slice(1).toUpperCase()}:${item.galaxy}`;
    const current = earliestCreatedAt.get(key);
    if (!current || Date.parse(item.createdAt) < Date.parse(current)) earliestCreatedAt.set(key, item.createdAt);
  }
  const systemsByAddress = new Map(
    missions.map((mission) => {
      const key = `${mission.systemAddress.slice(1).toUpperCase()}:${mission.galaxy}`;
      const visibleMission = visibleByAddress.get(key);
      return [
        key,
        {
          id: visibleMission?.id ?? key,
          portal: mission.systemAddress,
          galaxy: mission.galaxy,
          ...(visibleMission
            ? {
                title: visibleMission.title,
                description: visibleMission.description,
                system: visibleMission.system,
                systemLabelFromAlmanac: visibleMission.systemLabelFromAlmanac,
              }
            : {}),
          stationOwnerMemberId: mission.stationOwnerMemberId,
          ...(earliestCreatedAt.has(key) ? { createdAt: earliestCreatedAt.get(key) } : {}),
        },
      ] as const;
    }),
  );
  for (const station of stations) {
    const key = `${station.portal.slice(1).toUpperCase()}:${station.galaxy}`;
    if (!systemsByAddress.has(key)) {
      systemsByAddress.set(key, {
        id: key,
        portal: station.portal,
        galaxy: station.galaxy,
        stationOwnerMemberId: station.ownerId,
        ...(earliestCreatedAt.has(key) ? { createdAt: earliestCreatedAt.get(key) } : {}),
      });
    }
  }
  // Visited marks are personal.
  const visits = new Set<string>();
  try {
    for (const key of await readPlanetVisits(member.publicId)) visits.add(key);
  } catch (error) {
    console.error("Unable to read planet visits", error instanceof Error ? error.message : "Unknown error");
  }
  // Farms are visible to every approved member; the newest one per planet is linked.
  const farmByPlanet = new Map<string, { id: string; createdAt: string }>();
  try {
    for (const farm of await readFarms()) {
      const key = `${farm.portal.toUpperCase()}:${farm.galaxy}`;
      const current = farmByPlanet.get(key);
      if (!current || farm.createdAt.localeCompare(current.createdAt) > 0)
        farmByPlanet.set(key, { id: farm.id, createdAt: farm.createdAt });
    }
  } catch (error) {
    console.error("Unable to read farms", error instanceof Error ? error.message : "Unknown error");
  }
  // Pets are visible to every approved member; the newest one per planet is linked.
  const petByPlanet = new Map<string, { id: string; createdAt: string }>();
  try {
    for (const pet of await readPets()) {
      const key = `${pet.portal.toUpperCase()}:${pet.galaxy}`;
      const current = petByPlanet.get(key);
      if (!current || pet.createdAt.localeCompare(current.createdAt) > 0)
        petByPlanet.set(key, { id: pet.id, createdAt: pet.createdAt });
    }
  } catch (error) {
    console.error("Unable to read pets", error instanceof Error ? error.message : "Unknown error");
  }
  const planetCandidates = (
    await Promise.all(
      [...systemsByAddress.values()].map(async (system) => {
        const planetaryAddresses = await getSystemPlanetAddresses(system.portal, system.galaxy);
        if (featuredPlanet && isSameSystem(featuredPlanet, system)) {
          const portal = featuredPlanet.portal.toUpperCase();
          if (!planetaryAddresses.some((planet) => planet.portal === portal)) {
            planetaryAddresses.push({ portal, number: planetaryAddresses.length + 1 });
          }
        }
        const feature = await systemFeature(system.portal, system.galaxy).catch(() => null);
        const associatedStation = stations.find(
          (station) =>
            (system.stationOwnerMemberId ? station.ownerId === system.stationOwnerMemberId : true) &&
            isSameSystem(station, system),
        );
        return planetaryAddresses.map(({ portal, number }) => ({
          ...system,
          ...(feature ? { systemFeature: feature } : {}),
          ...(canMarkPlanetVisited(member, missions, stations, portal, system.galaxy)
            ? { canMarkVisited: true, visited: visits.has(planetVisitKey(portal, system.galaxy)) }
            : {}),
          id: `${portal}:${system.galaxy}`,
          planetPortal: portal,
          planetNumber: number,
          ...(farmByPlanet.has(`${portal}:${system.galaxy}`)
            ? { farmId: farmByPlanet.get(`${portal}:${system.galaxy}`)?.id }
            : {}),
          ...(petByPlanet.has(`${portal}:${system.galaxy}`)
            ? { petId: petByPlanet.get(`${portal}:${system.galaxy}`)?.id }
            : {}),
          ...(associatedStation
            ? {
                station: {
                  id: `${associatedStation.ownerId}:${associatedStation.portal}:${associatedStation.galaxy}`,
                  portal: associatedStation.portal,
                  galaxy: associatedStation.galaxy,
                  ...(associatedStation.name ? { name: associatedStation.name } : {}),
                  ...(associatedStation.createdAt ? { createdAt: associatedStation.createdAt } : {}),
                  hasMissions: missions.some(
                    (mission) =>
                      mission.galaxy === associatedStation.galaxy &&
                      mission.systemAddress.slice(1).toUpperCase() === associatedStation.portal.slice(1).toUpperCase(),
                  ),
                  canCreateMission: canCreateMissionFromStation(
                    {
                      ownerId: associatedStation.ownerId,
                      availableSpecialties: availableMissionSpecialties(
                        missions,
                        associatedStation.portal,
                        associatedStation.galaxy,
                      ),
                    },
                    member,
                    canManage,
                  ),
                },
              }
            : {}),
        }));
      }),
    )
  ).flat();
  const lookupResults: {
    planet:
      | ((typeof planetCandidates)[number] & {
          imageUrl?: string;
          almanacName?: string;
          almanacSearchIndex: string;
          almanacFacts: { label: string; value: string }[];
          systemFacts: { label: string; value: string }[];
          planetType?: string;
          economyStars?: number;
          wealth?: string;
          discoveryCounts: AlmanacDiscoveryCounts;
          plants: string[];
          minerals: string[];
          valuables: string[];
          dissonant: boolean;
          paradise: boolean;
          blackMarket: boolean;
        })
      | null;
    failed: boolean;
  }[] = [];
  const almanacResults = await lookupAlmanacPlanets(
    planetCandidates.map((planet) => ({ portal: planet.planetPortal, galaxy: planet.galaxy })),
    { cacheOnly },
  );
  await fillEmptyMissionSystemLabels(almanacResults);
  {
    const batch = planetCandidates.map((planet) => {
      try {
        const lookup = almanacResults.get(`${planet.planetPortal.toUpperCase()}:${planet.galaxy}`);
        if (lookup?.failed) return { planet: null, failed: true };
        const almanac = lookup?.planet ?? null;
        return {
          planet: almanac ? { ...planet, ...planetDestinationDetails(almanac) } : null,
          failed: false,
        };
      } catch {
        return { planet: null, failed: true };
      }
    });
    lookupResults.push(...batch);
  }
  const planetsWithData = lookupResults.flatMap((result) => (result.planet ? [result.planet] : []));
  const almanacLookupFailed = lookupResults.some((result) => result.failed);
  return { planets: planetsWithData, almanacLookupFailed };
}
