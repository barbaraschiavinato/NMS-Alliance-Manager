import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { LoginScreen } from "@/components/pages/login-screen";
import { FarmsPage, type FarmDetail } from "@/components/pages/farms-page";
import { PendingApproval } from "@/components/pages/pending-approval";
import type { PlanetDestination } from "@/components/cards/planet-destination-card";
import { getMissingAuthConfiguration } from "@/lib/auth/local-auth";
import { getCurrentMember } from "@/lib/auth/authorization";
import { readAccessData } from "@/lib/members/access-store";
import { readMissions } from "@/lib/missions/store";
import { readFarms } from "@/lib/farms/farms-store";
import { readVisibleStationPortals } from "@/lib/stations/visible-stations";
import { isSameSystem, parseDetailOrigin, stationId } from "@/lib/navigation/detail-links";
import { loadPlanetDestinations, planetDestinationDetails } from "@/lib/planets/planet-destinations";
import { readAlmanacResponse } from "@/lib/almanac/almanac-store";
import { canMarkPlanetVisited, planetVisitKey } from "@/lib/planets/planet-visits";
import { readPlanetVisits } from "@/lib/planets/planet-visits-store";
import type { Farm } from "@/lib/farms/farms";

function farmPlanet(farm: Farm, cached: Record<string, unknown> | null): PlanetDestination {
  return {
    id: `${farm.portal}:${farm.galaxy}`,
    portal: farm.portal,
    planetPortal: farm.portal,
    planetNumber: Math.max(1, Number.parseInt(farm.portal[0], 16)),
    galaxy: farm.galaxy,
    system: farm.systemName,
    almanacName: farm.planetName,
    almanacSearchIndex: farm.planetName,
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

export async function renderFarmsRoute({
  detailId,
  searchParams = Promise.resolve({}),
}: Readonly<{
  detailId?: string;
  searchParams?: Promise<{ from?: string | string[] }>;
}> = {}) {
  const accessData = await readAccessData();
  const allianceName = accessData.alliance.name;
  const allianceLogoUrl = accessData.alliance.logoUrl;
  const missingConfiguration = getMissingAuthConfiguration();
  if (missingConfiguration.length > 0) {
    return (
      <LoginScreen
        allianceLogoUrl={allianceLogoUrl}
        allianceName={allianceName}
        missingConfiguration={missingConfiguration}
      />
    );
  }
  const session = await auth();
  if (!session?.user?.email) return <LoginScreen allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;
  const member = await getCurrentMember({ allowPending: true, allowBlocked: true });
  if (!member) return <LoginScreen allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;
  if (member.membershipStatus !== "approved") return <PendingApproval member={member} />;

  const farm = detailId === undefined ? undefined : (await readFarms()).find((entry) => entry.id === detailId);
  if (detailId !== undefined && !farm) notFound();
  const [missions, stations] = await Promise.all([readMissions(), readVisibleStationPortals(member)]);
  const isModerator = member.role === "admin" || member.role === "moderator";
  let detail: FarmDetail | undefined;
  if (farm) {
    const params = await searchParams;
    detail = { id: farm.id, origin: parseDetailOrigin(params.from, "farms") };
    const station = stations.find((entry) => isSameSystem(entry, farm));
    if (station) {
      const systemMissions = missions.filter((mission) =>
        isSameSystem({ portal: mission.systemAddress, galaxy: mission.galaxy }, farm),
      );
      const systemStations = stations.filter((entry) => isSameSystem(entry, farm));
      const loaded = await loadPlanetDestinations(member, accessData.members, systemMissions, systemStations, {
        featuredPlanet: farm,
        cacheOnly: true,
      });
      let featuredPlanet: PlanetDestination | undefined = loaded.planets.find(
        (planet) => planet.planetPortal === farm.portal && planet.galaxy === farm.galaxy,
      );
      let planetDataUnavailable = false;
      if (!featuredPlanet) {
        const cached = await readAlmanacResponse(farm.portal, farm.galaxy, true);
        const canMarkVisited = canMarkPlanetVisited(member, systemMissions, systemStations, farm.portal, farm.galaxy);
        const visited = canMarkVisited
          ? (await readPlanetVisits(member.publicId)).includes(planetVisitKey(farm.portal, farm.galaxy))
          : false;
        featuredPlanet = {
          ...farmPlanet(farm, cached),
          portal: station.portal,
          system: farm.systemName || station.name,
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
      detail = {
        ...detail,
        planetDataUnavailable,
        stationDetail: {
          station: { portal: station.portal, galaxy: station.galaxy, ownerId: station.ownerId },
          system: { portal: station.portal, galaxy: station.galaxy },
          origin: "farms",
          ...loaded,
          featuredPlanet,
        },
      };
    } else {
      const cached = await readAlmanacResponse(farm.portal, farm.galaxy, true);
      if (cached) {
        const canMarkVisited = canMarkPlanetVisited(member, missions, stations, farm.portal, farm.galaxy);
        const visited = canMarkVisited
          ? (await readPlanetVisits(member.publicId)).includes(planetVisitKey(farm.portal, farm.galaxy))
          : false;
        detail = {
          ...detail,
          planet: {
            ...farmPlanet(farm, cached),
            ...(canMarkVisited ? { canMarkVisited: true, visited } : {}),
          },
        };
      }
    }
  }
  return (
    <FarmsPage
      alliance={accessData.alliance}
      currentMember={member}
      detail={detail}
      missionCount={missions.length}
      stationCount={
        isModerator ? stations.length : stations.filter((station) => station.ownerId === member.publicId).length
      }
      stationNames={stations.flatMap((station) =>
        station.name ? [{ portal: station.portal, galaxy: station.galaxy, name: station.name }] : [],
      )}
      offlineCount={isModerator ? accessData.members.filter((entry) => entry.offline).length : undefined}
      userCount={isModerator ? accessData.members.filter((entry) => !entry.offline).length : undefined}
    />
  );
}
