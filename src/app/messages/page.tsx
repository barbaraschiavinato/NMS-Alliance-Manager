import { auth } from "@/auth";
import { GoogleLogin } from "@/components/pages/google-login";
import { MessagesPage } from "@/components/pages/messages-page";
import { PendingApproval } from "@/components/pages/pending-approval";
import { getCurrentMember } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";
import { readMissions } from "@/lib/store";
import { readAllStationPortals, readStationPortals } from "@/lib/stations-store";

export const dynamic = "force-dynamic";

export default async function MessagesRoute() {
  const accessData = await readAccessData();
  const allianceName = accessData.alliance.name;
  const allianceLogoUrl = accessData.alliance.logoUrl;
  const missingConfiguration = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ALLIANCE_ADMIN_EMAIL"]
    .filter((key) => !process.env[key]);
  if (missingConfiguration.length > 0) {
    return <GoogleLogin allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} missingConfiguration={missingConfiguration} />;
  }

  const session = await auth();
  if (!session?.user?.email) return <GoogleLogin allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;

  const member = await getCurrentMember({ allowPending: true, allowBlocked: true });
  if (!member) return <GoogleLogin allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;
  if (member.membershipStatus !== "approved") return <PendingApproval member={member} />;

  const isModerator = member.role === "admin" || member.role === "moderator";
  const [missions, stations] = await Promise.all([
    readMissions(),
    isModerator ? readAllStationPortals() : readStationPortals(member.publicId),
  ]);
  return <MessagesPage
    alliance={accessData.alliance}
    currentMember={member}
    missionCount={missions.length}
    stationCount={stations.length}
    offlineCount={isModerator ? accessData.members.filter((item) => item.offline).length : undefined}
    userCount={isModerator ? accessData.members.filter((item) => !item.offline).length : undefined}
  />;
}
