import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { LoginScreen } from "@/components/pages/login-screen";
import { FarmsPage, type FarmDetail } from "@/components/pages/farms-page";
import { PendingApproval } from "@/components/pages/pending-approval";
import { getMissingAuthConfiguration } from "@/lib/auth/local-auth";
import { getCurrentMember } from "@/lib/auth/authorization";
import { readAccessData } from "@/lib/members/access-store";
import { readMissions } from "@/lib/missions/store";
import { readFarms } from "@/lib/farms/farms-store";
import { readVisibleStationPortals } from "@/lib/stations/visible-stations";
import { parseDetailOrigin } from "@/lib/navigation/detail-links";
import { loadPlanetDetail } from "@/lib/planets/planet-detail";

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
    detail = {
      ...detail,
      ...(await loadPlanetDetail({
        member,
        members: accessData.members,
        missions,
        stations,
        target: farm,
        origin: "farms",
      })),
    };
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
