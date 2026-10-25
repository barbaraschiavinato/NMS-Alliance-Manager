import { auth } from "@/auth";
import { LoginScreen } from "@/components/pages/login-screen";
import { getMissingAuthConfiguration } from "@/lib/auth/local-auth";
import { PendingApproval } from "@/components/pages/pending-approval";
import { StationMapPage } from "@/components/pages/station-map-page";
import { getCurrentMember } from "@/lib/auth/authorization";
import { readAccessData } from "@/lib/members/access-store";
import { readMissions } from "@/lib/missions/store";
import { stationHasMissionOpportunity } from "@/lib/missions/station-mission-availability";
import { readAllStationPortals, readStationPortals } from "@/lib/stations/stations-store";

export const dynamic = "force-dynamic";

// `?galaxy=N&portal=CODE` opens the map on that galaxy and highlights the marker of the portal's region.
export default async function StationMapRoute({
  searchParams = Promise.resolve({}),
}: Readonly<{ searchParams?: Promise<{ galaxy?: string | string[]; portal?: string | string[] }> }> = {}) {
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

  // Same visibility as the Stations page: everyone with a specialty sees all stations, the others only their own.
  const seesAllStations =
    member.role === "admin" ||
    member.role === "moderator" ||
    member.specialty === "explorer" ||
    member.specialty === "builder" ||
    member.specialty === "ranger";
  const [missions, stations] = await Promise.all([
    readMissions(),
    seesAllStations
      ? readAllStationPortals()
      : readStationPortals(member.publicId).then((entries) =>
          entries.map((station) => ({ ...station, ownerId: member.publicId })),
        ),
  ]);
  const canManage = member.role === "admin" || member.role === "moderator";
  const ownerName = (ownerId: string) => {
    const owner = accessData.members.find((candidate) => candidate.publicId === ownerId);
    return owner?.nmsName || owner?.name || "";
  };

  const params = await searchParams;
  const portal =
    typeof params.portal === "string" && /^[0-9A-F]{12}$/i.test(params.portal) ? params.portal.toUpperCase() : "";
  const galaxy =
    typeof params.galaxy === "string" && /^\d{1,3}$/.test(params.galaxy) && Number(params.galaxy) <= 255
      ? Number(params.galaxy)
      : undefined;

  return (
    <StationMapPage
      key={`${galaxy ?? ""}:${portal}`}
      alliance={accessData.alliance}
      currentMember={member}
      highlight={portal && galaxy !== undefined ? { portal, galaxy } : undefined}
      missionCount={missions.length}
      offlineCount={canManage ? accessData.members.filter((item) => item.offline).length : undefined}
      stationCount={stations.length}
      stations={stations.map((station) => ({
        portal: station.portal,
        galaxy: station.galaxy,
        name: station.name ?? "",
        ownerId: station.ownerId,
        ownerName: ownerName(station.ownerId),
        missionAvailable: stationHasMissionOpportunity(station, missions, member, canManage),
      }))}
      userCount={canManage ? accessData.members.filter((item) => !item.offline).length : undefined}
    />
  );
}
