import { auth } from "@/auth";
import { GuideAppPage } from "@/components/pages/guide-app-page";
import { LoginScreen } from "@/components/pages/login-screen";
import { PendingApproval } from "@/components/pages/pending-approval";
import { GuideContent } from "@/components/guide/guide-content";
import { Hero } from "@/components/layout/hero";
import { getCurrentMember } from "@/lib/auth/authorization";
import { readAccessData } from "@/lib/members/access-store";
import { getMissingAuthConfiguration } from "@/lib/auth/local-auth";
import { readMissions } from "@/lib/missions/store";
import { readAllStationPortals } from "@/lib/stations/stations-store";

export const dynamic = "force-dynamic";

export default async function MemberGuideRoute() {
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

  const [missions, stations] = await Promise.all([readMissions(), readAllStationPortals()]);
  const isModerator = member.role === "admin" || member.role === "moderator";

  return (
    <GuideAppPage
      alliance={accessData.alliance}
      currentMember={member}
      missionCount={missions.length}
      offlineCount={isModerator ? accessData.members.filter((item) => item.offline).length : undefined}
      stationCount={stations.length}
      userCount={isModerator ? accessData.members.filter((item) => !item.offline).length : undefined}
    >
      <Hero settings={accessData.alliance} subtitle="Cosa puoi fare, pagina per pagina" title="Guida" />
      <GuideContent alliance={accessData.alliance} standalone={false} />
    </GuideAppPage>
  );
}
