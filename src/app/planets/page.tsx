import { auth } from "@/auth";
import { LoginScreen } from "@/components/pages/login-screen";
import { getMissingAuthConfiguration } from "@/lib/local-auth";
import { PlanetsPage } from "@/components/pages/planets-page";
import { PendingApproval } from "@/components/pages/pending-approval";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";
import { readAllStationPortals, readStationPortals } from "@/lib/stations-store";
import { readMissions } from "@/lib/store";
import { loadPlanetDestinations } from "@/lib/planet-destinations";

export const dynamic = "force-dynamic";

export default async function PlanetsRoute() {
  const accessData = await readAccessData();
  const { alliance } = accessData;
  const missingConfiguration = getMissingAuthConfiguration();
  if (missingConfiguration.length > 0) {
    return (
      <LoginScreen
        allianceLogoUrl={alliance.logoUrl}
        allianceName={alliance.name}
        missingConfiguration={missingConfiguration}
      />
    );
  }
  const session = await auth();
  if (!session?.user?.email) return <LoginScreen allianceLogoUrl={alliance.logoUrl} allianceName={alliance.name} />;
  const member = await getCurrentMember({ allowPending: true, allowBlocked: true });
  if (!member) return <LoginScreen allianceLogoUrl={alliance.logoUrl} allianceName={alliance.name} />;
  if (member.membershipStatus !== "approved") return <PendingApproval member={member} />;

  const canManage = hasRole(member, "moderator");
  const [missions, stations] = await Promise.all([
    readMissions(),
    canManage || member.specialty === "explorer" || member.specialty === "builder" || member.specialty === "ranger"
      ? readAllStationPortals()
      : readStationPortals(member.publicId).then((entries) =>
          entries.map((station) => ({ ...station, ownerId: member.publicId })),
        ),
  ]);
  const destinations = await loadPlanetDestinations(member, accessData.members, missions, stations);
  return (
    <PlanetsPage
      alliance={alliance}
      currentMember={member}
      {...destinations}
      missionCount={missions.length}
      stationCount={stations.length}
      offlineCount={canManage ? accessData.members.filter((item) => item.offline).length : undefined}
      userCount={canManage ? accessData.members.filter((item) => !item.offline).length : undefined}
    />
  );
}
