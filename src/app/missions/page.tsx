import { MissionDashboard } from "@/components/pages/mission-dashboard";
import { LoginScreen } from "@/components/pages/login-screen";
import { getMissingAuthConfiguration } from "@/lib/auth/local-auth";
import { auth } from "@/auth";
import { getCurrentMember } from "@/lib/auth/authorization";
import { PendingApproval } from "@/components/pages/pending-approval";
import { readAccessData } from "@/lib/members/access-store";
import { readAllStationPortals, readStationPortals } from "@/lib/stations/stations-store";

export const dynamic = "force-dynamic";

export default async function MissionsRoute({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ search?: string | string[] }>;
}>) {
  const accessData = await readAccessData();
  const { alliance } = accessData;
  const allianceName = alliance.name;
  const allianceLogoUrl = alliance.logoUrl;
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
  const params = await searchParams;
  const initialSearch = typeof params.search === "string" ? params.search.slice(0, 80) : "";
  const stations =
    member.role === "admin" || member.role === "moderator"
      ? await readAllStationPortals()
      : await readStationPortals(member.publicId);
  return (
    <MissionDashboard
      alliance={alliance}
      currentMember={member}
      initialSearch={initialSearch}
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
