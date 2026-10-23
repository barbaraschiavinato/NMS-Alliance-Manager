import { auth } from "@/auth";
import { LoginScreen } from "@/components/pages/login-screen";
import { getMissingAuthConfiguration } from "@/lib/auth/local-auth";
import { PendingApproval } from "@/components/pages/pending-approval";
import { StationsPage } from "@/components/pages/stations-page";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { readAccessData } from "@/lib/members/access-store";
import { readMissions } from "@/lib/missions/store";
import { readAllStationPortals, readStationPortals } from "@/lib/stations/stations-store";
import { notFound } from "next/navigation";
import { findMissionStation, isSameSystem, parseStationId, parseDetailOrigin } from "@/lib/navigation/detail-links";
import { loadPlanetDestinations } from "@/lib/planets/planet-destinations";
import { canViewMission } from "@/lib/missions/missions";

export async function renderStationsRoute({
  searchParams,
  detailId,
  missionDetailId,
}: Readonly<{
  searchParams: Promise<{
    search?: string | string[];
    portal?: string | string[];
    galaxy?: string | string[];
    ownerId?: string | string[];
    createStation?: string | string[];
    from?: string | string[];
    source?: string | string[];
  }>;
  detailId?: string;
  missionDetailId?: string;
}>) {
  const accessData = await readAccessData();
  const allianceName = accessData.alliance.name;
  const allianceLogoUrl = accessData.alliance.logoUrl;
  const missingConfiguration = getMissingAuthConfiguration();
  if (missingConfiguration.length > 0)
    return (
      <LoginScreen
        allianceLogoUrl={allianceLogoUrl}
        allianceName={allianceName}
        missingConfiguration={missingConfiguration}
      />
    );

  const session = await auth();
  if (!session?.user?.email) return <LoginScreen allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;

  const member = await getCurrentMember({ allowPending: true, allowBlocked: true });
  if (!member) return <LoginScreen allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;
  if (member.membershipStatus !== "approved") return <PendingApproval member={member} />;

  const [missions, stations] = await Promise.all([
    readMissions(),
    member.role === "admin" ||
    member.role === "moderator" ||
    member.specialty === "explorer" ||
    member.specialty === "builder" ||
    member.specialty === "ranger"
      ? readAllStationPortals()
      : readStationPortals(member.publicId).then((entries) =>
          entries.map((station) => ({ ...station, ownerId: member.publicId })),
        ),
  ]);
  const detailMission =
    missionDetailId === undefined ? undefined : missions.find((mission) => mission.id === missionDetailId);
  const missionStation = detailMission ? findMissionStation(detailMission, stations) : undefined;
  if (
    missionDetailId !== undefined &&
    (!detailMission || (!missionStation && !hasRole(member, "moderator") && !canViewMission(detailMission, member)))
  ) {
    notFound();
  }
  const detailStation = detailId === undefined ? (missionStation ?? null) : parseStationId(detailId);
  if (
    detailId !== undefined &&
    (!detailStation ||
      !stations.some(
        (station) =>
          station.portal === detailStation.portal &&
          station.galaxy === detailStation.galaxy &&
          station.ownerId === detailStation.ownerId,
      ))
  ) {
    notFound();
  }
  const params = await searchParams;
  const detailSystem = detailMission
    ? { portal: detailMission.systemAddress, galaxy: detailMission.galaxy }
    : detailStation;
  const detail = detailSystem
    ? {
        station: detailStation,
        system: detailSystem,
        missionId: detailMission?.id,
        associatedFirst: Boolean(detailMission && params.source === "station-card"),
        origin: parseDetailOrigin(params.from ?? (detailMission ? "missions" : undefined)),
        ...(await loadPlanetDestinations(
          member,
          accessData.members,
          missions.filter(
            (mission) =>
              isSameSystem({ portal: mission.systemAddress, galaxy: mission.galaxy }, detailSystem) &&
              (detailStation || hasRole(member, "moderator") || canViewMission(mission, member)),
          ),
          stations.filter((station) => isSameSystem(station, detailSystem)),
        )),
      }
    : undefined;
  const initialSearch = typeof params.search === "string" ? params.search.slice(0, 254) : "";
  const portal = typeof params.portal === "string" ? params.portal.toUpperCase() : "";
  const galaxy = typeof params.galaxy === "string" && /^\d+$/.test(params.galaxy) ? Number(params.galaxy) : -1;
  const ownerId = typeof params.ownerId === "string" ? params.ownerId : "";
  const canCreateStation = params.createStation === "1" && (member.role === "admin" || member.role === "moderator");
  const initialCreateStation =
    canCreateStation && /^[0-9A-F]{12}$/.test(portal) && Number.isInteger(galaxy) && galaxy >= 0 && galaxy <= 255
      ? {
          portal,
          galaxy,
          ownerId: accessData.members.some(
            (candidate) => candidate.publicId === ownerId && candidate.membershipStatus === "approved",
          )
            ? ownerId
            : member.publicId,
        }
      : null;
  const initialStation =
    !initialCreateStation &&
    /^[0-9A-F]{12}$/.test(portal) &&
    Number.isInteger(galaxy) &&
    galaxy >= 0 &&
    galaxy <= 255 &&
    ownerId
      ? { portal, galaxy, ownerId }
      : null;
  return (
    <StationsPage
      alliance={accessData.alliance}
      currentMember={member}
      initialSearch={initialSearch}
      initialCreateStation={initialCreateStation}
      initialStation={detailStation ?? initialStation}
      detail={detail}
      missionCount={missions.length}
      sidebarStationCount={stations.length}
      sidebarOfflineCount={
        member.role === "admin" || member.role === "moderator"
          ? accessData.members.filter((item) => item.offline).length
          : undefined
      }
      sidebarUserCount={
        member.role === "admin" || member.role === "moderator"
          ? accessData.members.filter((item) => !item.offline).length
          : undefined
      }
    />
  );
}
