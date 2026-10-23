import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginScreen } from "@/components/pages/login-screen";
import { getMissingAuthConfiguration } from "@/lib/auth/local-auth";
import { OfflinePlayersPage } from "@/components/pages/offline-players-page";
import { PendingApproval } from "@/components/pages/pending-approval";
import { getCurrentMember } from "@/lib/auth/authorization";
import { readAccessData } from "@/lib/members/access-store";
import { readMissions } from "@/lib/missions/store";
import { readAllStationPortals } from "@/lib/stations/stations-store";

export const dynamic = "force-dynamic";

export default async function OfflinePlayersRoute() {
  const accessData = await readAccessData();
  const allianceName = accessData.alliance.name;
  const allianceLogoUrl = accessData.alliance.logoUrl;
  const requiredConfiguration = getMissingAuthConfiguration();
  if (requiredConfiguration.length > 0)
    return (
      <LoginScreen
        allianceLogoUrl={allianceLogoUrl}
        allianceName={allianceName}
        missingConfiguration={requiredConfiguration}
      />
    );

  const session = await auth();
  if (!session?.user?.email) return <LoginScreen allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;

  const member = await getCurrentMember({ allowPending: true, allowBlocked: true });
  if (!member) return <LoginScreen allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;
  if (member.membershipStatus !== "approved") return <PendingApproval member={member} />;
  if (member.role !== "admin" && member.role !== "moderator") redirect("/");

  const [missions, stations] = await Promise.all([readMissions(), readAllStationPortals()]);
  const missionOwnerIds = new Set(
    missions.flatMap(
      (mission) =>
        [mission.assignedMemberId, mission.createdByMemberId, mission.stationOwnerMemberId].filter(Boolean) as string[],
    ),
  );
  const stationOwnerIds = new Set(stations.map((station) => station.ownerId));
  return (
    <OfflinePlayersPage
      memberActivity={{ missionOwnerIds: [...missionOwnerIds], stationOwnerIds: [...stationOwnerIds] }}
      alliance={accessData.alliance}
      currentMember={member}
      missionCount={missions.length}
      sidebarStationCount={stations.length}
      sidebarOfflineCount={accessData.members.filter((item) => item.offline).length}
      sidebarUserCount={accessData.members.filter((item) => !item.offline).length}
    />
  );
}
