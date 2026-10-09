import { auth } from "@/auth";
import { GoogleLogin } from "@/components/google-login";
import { PlanetsPage } from "@/components/planets-page";
import { PendingApproval } from "@/components/pending-approval";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";
import { canViewMission, isDifferentPlanetInSameSystem } from "@/lib/missions";
import { serializeMission } from "@/lib/mission-view";
import { getSystemPlanetAddresses } from "@/lib/planet-addresses";
import { almanacSystemLabel, lookupAlmanacPlanets } from "@/lib/almanac-lookup";
import { readAllStationPortals, readStationPortals } from "@/lib/stations-store";
import { readMissions, writeMissions } from "@/lib/store";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function almanacWord(value: unknown): string | undefined {
  const record = asRecord(value);
  return typeof record?.word === "string" ? record.word : undefined;
}

function almanacStarCount(value: unknown): number | undefined {
  const record = asRecord(value);
  if (typeof record?.stars !== "number" || !Number.isFinite(record.stars)) return undefined;
  return Math.max(0, Math.min(3, Math.floor(record.stars)));
}

function almanacResourceNames(value: unknown, kinds: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((entry) => {
    const record = asRecord(entry);
    return typeof record?.name === "string" && typeof record.kind === "string" && kinds.includes(record.kind)
      ? [record.name]
      : [];
  }))];
}

const dissonantResources = ["Radiant Shard", "Atlantideum", "Echo Seed", "Inverted Mirror"];

function hasDissonantResources(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => {
    const name = asRecord(entry)?.name;
    return typeof name === "string" && dissonantResources.includes(name);
  });
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

// Completa le etichette sistema rimaste vuote perché Almanac non era raggiungibile al momento della creazione.
async function fillEmptyMissionSystemLabels(results: Awaited<ReturnType<typeof lookupAlmanacPlanets>>) {
  const labelFor = (mission: { systemAddress: string; galaxy: number }) => {
    const planet = results.get(`${mission.systemAddress.toUpperCase()}:${mission.galaxy}`)?.planet;
    return planet ? almanacSystemLabel(planet) : null;
  };
  try {
    const current = await readMissions();
    if (!current.some((mission) => !mission.system.trim() && labelFor(mission))) return;
    await writeMissions((await readMissions()).map((mission) => {
      const label = mission.system.trim() ? null : labelFor(mission);
      return label ? { ...mission, system: label, systemLabelFromAlmanac: true } : mission;
    }));
  } catch (error) {
    console.error("Unable to reconcile mission system labels", error);
  }
}

export default async function PlanetsRoute() {
  const accessData = await readAccessData();
  const { alliance } = accessData;
  const missingConfiguration = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ALLIANCE_ADMIN_EMAIL"]
    .filter((key) => !process.env[key]);
  if (missingConfiguration.length > 0) {
    return <GoogleLogin allianceLogoUrl={alliance.logoUrl} allianceName={alliance.name} missingConfiguration={missingConfiguration} />;
  }

  const session = await auth();
  if (!session?.user?.email) return <GoogleLogin allianceLogoUrl={alliance.logoUrl} allianceName={alliance.name} />;

  const member = await getCurrentMember({ allowPending: true, allowBlocked: true });
  if (!member) return <GoogleLogin allianceLogoUrl={alliance.logoUrl} allianceName={alliance.name} />;
  if (member.membershipStatus !== "approved") return <PendingApproval member={member} />;

  const canManage = hasRole(member, "moderator");
  const [missions, stations] = await Promise.all([
    readMissions(),
    canManage || member.specialty === "explorer" || member.specialty === "builder" || member.specialty === "ranger"
      ? readAllStationPortals()
      : readStationPortals(member.publicId).then((entries) =>
        entries.map((station) => ({ ...station, ownerId: member.publicId })),
      ),
  ]);
  const visibleMissions = missions
    .filter((mission) => canManage || canViewMission(mission, member))
    .map((mission) => serializeMission(mission, accessData.members));
  const visibleByAddress = new Map(visibleMissions.map((mission) => [
    `${mission.systemAddress.slice(1).toUpperCase()}:${mission.galaxy}`,
    mission,
  ]));
  const earliestCreatedAt = new Map<string, string>();
  for (const item of [...missions.map((mission) => ({ ...mission, portal: mission.systemAddress })), ...stations]) {
    if (!item.createdAt) continue;
    const key = `${item.portal.slice(1).toUpperCase()}:${item.galaxy}`;
    const current = earliestCreatedAt.get(key);
    if (!current || Date.parse(item.createdAt) < Date.parse(current)) earliestCreatedAt.set(key, item.createdAt);
  }
  const systemsByAddress = new Map(missions.map((mission) => {
    const key = `${mission.systemAddress.slice(1).toUpperCase()}:${mission.galaxy}`;
    const visibleMission = visibleByAddress.get(key);
    return [key, {
      id: visibleMission?.id ?? key,
      portal: mission.systemAddress,
      galaxy: mission.galaxy,
      ...(visibleMission ? {
        title: visibleMission.title,
        description: visibleMission.description,
        system: visibleMission.system,
        systemLabelFromAlmanac: visibleMission.systemLabelFromAlmanac,
      } : {}),
      stationOwnerMemberId: mission.stationOwnerMemberId,
      ...(earliestCreatedAt.has(key) ? { createdAt: earliestCreatedAt.get(key) } : {}),
    }] as const;
  }));
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
  const planetCandidates = (await Promise.all([...systemsByAddress.values()].map(async (system) => {
    const planetaryAddresses = await getSystemPlanetAddresses(system.portal, system.galaxy);
    const associatedStation = stations.find((station) =>
      (system.stationOwnerMemberId ? station.ownerId === system.stationOwnerMemberId : true) &&
      (station.portal === system.portal ||
        isDifferentPlanetInSameSystem(station.portal, station.galaxy, system.portal, system.galaxy)),
    );
    return planetaryAddresses.map(({ portal, number }) => ({
      ...system,
      id: `${portal}:${system.galaxy}`,
      planetPortal: portal,
      planetNumber: number,
      ...(associatedStation ? {
        station: {
          id: `${associatedStation.ownerId}:${associatedStation.portal}:${associatedStation.galaxy}`,
          portal: associatedStation.portal,
          galaxy: associatedStation.galaxy,
          ...(associatedStation.name ? { name: associatedStation.name } : {}),
        },
      } : {}),
    }));
  }))).flat();
  const lookupResults: {
    planet: ((typeof planetCandidates)[number] & {
      imageUrl?: string;
      almanacName?: string;
      almanacSearchIndex: string;
      almanacFacts: { label: string; value: string }[];
      systemFacts: { label: string; value: string }[];
      planetType?: string;
      economyStars?: number;
      plants: string[];
      minerals: string[];
      valuables: string[];
      dissonant: boolean;
    }) | null;
    failed: boolean;
  }[] = [];
  const almanacResults = await lookupAlmanacPlanets(planetCandidates.map((planet) => ({ portal: planet.planetPortal, galaxy: planet.galaxy })));
  await fillEmptyMissionSystemLabels(almanacResults);
  {
    const batch = planetCandidates.map((planet) => {
      try {
        const lookup = almanacResults.get(`${planet.planetPortal.toUpperCase()}:${planet.galaxy}`);
        if (lookup?.failed) return { planet: null, failed: true };
        const almanac = lookup?.planet ?? null;
        const lines = asRecord(almanac?.lines);
        const band = asRecord(lines?.band);
        const headline = asRecord(lines?.headline);
        const pictures = asRecord(almanac?.pictures);
        const disc = pictures?.disc;
        const carries = almanac?.carries;
        const almanacName = typeof headline?.word === "string" ? headline.word : undefined;
        const planetType = almanacWord(band?.type);
        const economyStars = almanacStarCount(band?.economy);
        const almanacFacts = ([
          ["common.planet_type_label", planetType],
          ["planet.size", almanacWord(band?.size)],
          ["planet.weather", almanacWord(band?.weather)],
          ["planet.water", almanacWord(band?.water)],
          ["planet.sentinels", almanacWord(band?.sentinels)],
        ] as const).flatMap(([label, value]) => value ? [{ label, value }] : []);
        const systemFacts = ([
          ["planet.star", almanacWord(band?.star)],
          ["common.economy", almanacWord(band?.economy)],
          ["common.conflict", almanacWord(band?.conflict)],
          ["common.race", almanacWord(band?.race)],
        ] as const).flatMap(([label, value]) => value ? [{ label, value }] : []);
        return {
          planet: almanac ? {
            ...planet,
            ...(typeof disc === "string" && disc.startsWith("/planets/")
              ? { imageUrl: `https://nmsalmanac.com/api${disc}` }
              : {}),
            ...(almanacName ? { almanacName } : {}),
            almanacSearchIndex: almanacSearchValues(almanac).join(" "),
            almanacFacts,
            systemFacts,
            ...(planetType ? { planetType } : {}),
            ...(economyStars !== undefined ? { economyStars } : {}),
            plants: almanacResourceNames(carries, ["plant", "consumable"]),
            minerals: almanacResourceNames(carries, ["mineral"]),
            valuables: almanacResourceNames(carries, ["tradeable"]),
            dissonant: hasDissonantResources(carries),
          } : null,
          failed: false,
        };
      } catch {
        return { planet: null, failed: true };
      }
    });
    lookupResults.push(...batch);
  }
  const planetsWithData = lookupResults.flatMap((result) => result.planet ? [result.planet] : []);
  const almanacLookupFailed = lookupResults.some((result) => result.failed);
  return <PlanetsPage
    alliance={alliance}
    currentMember={member}
    planets={planetsWithData}
    almanacLookupFailed={almanacLookupFailed}
    missionCount={missions.length}
    stationCount={stations.length}
    offlineCount={canManage ? accessData.members.filter((item) => item.offline).length : undefined}
    userCount={canManage ? accessData.members.filter((item) => !item.offline).length : undefined}
  />;
}
