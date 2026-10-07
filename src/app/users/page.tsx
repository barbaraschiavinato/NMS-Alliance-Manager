import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GoogleLogin } from "@/components/google-login";
import { MembersPage } from "@/components/members-page";
import { PendingApproval } from "@/components/pending-approval";
import { getCurrentMember } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";
import { readMissions } from "@/lib/store";
import { readAllStationPortals } from "@/lib/stations-store";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const accessData = await readAccessData();
  const allianceName = accessData.alliance.name;
  const allianceLogoUrl = accessData.alliance.logoUrl;
  const requiredConfiguration = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ALLIANCE_ADMIN_EMAIL"]
    .filter((key) => !process.env[key]);
  if (requiredConfiguration.length > 0) return <GoogleLogin allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} missingConfiguration={requiredConfiguration} />;

  const session = await auth();
  if (!session?.user?.email) return <GoogleLogin allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;

  const member = await getCurrentMember({ allowPending: true, allowBlocked: true });
  if (!member) return <GoogleLogin allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;
  if (member.membershipStatus !== "approved") return <PendingApproval member={member} />;
  if (member.role !== "admin" && member.role !== "moderator") redirect("/");

  const [missions, stations] = await Promise.all([readMissions(), readAllStationPortals()]);
  const missionOwnerIds = new Set(missions.flatMap((mission) => [mission.assignedMemberId, mission.createdByMemberId, mission.stationOwnerMemberId].filter(Boolean) as string[]));
  const stationOwnerIds = new Set(stations.map((station) => station.ownerId));
  return <MembersPage
    memberActivity={{ missionOwnerIds: [...missionOwnerIds], stationOwnerIds: [...stationOwnerIds] }}
    alliance={accessData.alliance}
    currentMember={member}
    missionCount={missions.length}
    sidebarStationCount={stations.length}
    sidebarUserCount={accessData.members.filter((item) => !item.offline).length}
  />;
}
