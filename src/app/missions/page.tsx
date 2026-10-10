import { MissionDashboard } from "@/components/pages/mission-dashboard";
import { GoogleLogin } from "@/components/pages/google-login";
import { auth } from "@/auth";
import { getCurrentMember } from "@/lib/authorization";
import { PendingApproval } from "@/components/pages/pending-approval";
import { readAccessData } from "@/lib/access-store";
import { readAllStationPortals, readStationPortals } from "@/lib/stations-store";

export const dynamic = "force-dynamic";

export default async function MissionsRoute({ searchParams }: Readonly<{
  searchParams: Promise<{ search?: string | string[] }>;
}>) {
  const accessData = await readAccessData();
  const { alliance } = accessData;
  const allianceName = alliance.name;
  const allianceLogoUrl = alliance.logoUrl;
  const missingConfiguration = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ALLIANCE_ADMIN_EMAIL"]
    .filter((key) => !process.env[key]);
  if (missingConfiguration.length > 0) return <GoogleLogin allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} missingConfiguration={missingConfiguration} />;

  const session = await auth();
  if (!session?.user?.email) return <GoogleLogin allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;

  const member = await getCurrentMember({ allowPending: true, allowBlocked: true });
  if (!member) return <GoogleLogin allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;
  if (member.membershipStatus !== "approved") return <PendingApproval member={member} />;
  const params = await searchParams;
  const initialSearch = typeof params.search === "string" ? params.search.slice(0, 80) : "";
  const stations = member.role === "admin" || member.role === "moderator"
    ? await readAllStationPortals()
    : await readStationPortals(member.publicId);
  return <MissionDashboard
    alliance={alliance}
    currentMember={member}
    initialSearch={initialSearch}
    sidebarStationCount={stations.length}
    sidebarOfflineCount={member.role === "admin" || member.role === "moderator" ? accessData.members.filter((item) => item.offline).length : undefined}
    sidebarUserCount={member.role === "admin" || member.role === "moderator" ? accessData.members.filter((item) => !item.offline).length : undefined}
  />;
}