import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { EventsPage } from "@/components/pages/events-page";
import { LoginScreen } from "@/components/pages/login-screen";
import { PendingApproval } from "@/components/pages/pending-approval";
import { getCurrentMember } from "@/lib/auth/authorization";
import { getMissingAuthConfiguration } from "@/lib/auth/local-auth";
import { readEvents } from "@/lib/events/events-store";
import { readAccessData } from "@/lib/members/access-store";
import { readMissions } from "@/lib/missions/store";
import { parseDetailOrigin, stationId } from "@/lib/navigation/detail-links";
import { readVisibleStationPortals } from "@/lib/stations/visible-stations";

export async function renderEventsRoute({
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

  if (detailId !== undefined && !(await readEvents()).some((event) => event.id === detailId)) notFound();
  const [missions, stations] = await Promise.all([readMissions(), readVisibleStationPortals(member)]);
  const isModerator = member.role === "admin" || member.role === "moderator";
  const params = await searchParams;
  return (
    <EventsPage
      alliance={accessData.alliance}
      currentMember={member}
      detail={detailId === undefined ? undefined : { id: detailId, origin: parseDetailOrigin(params.from, "events") }}
      missionCount={missions.length}
      stations={stations.map((station) => ({
        id: stationId(station),
        portal: station.portal,
        galaxy: station.galaxy,
        ...(station.name ? { name: station.name } : {}),
      }))}
      stationCount={
        isModerator ? stations.length : stations.filter((station) => station.ownerId === member.publicId).length
      }
      offlineCount={isModerator ? accessData.members.filter((entry) => entry.offline).length : undefined}
      userCount={isModerator ? accessData.members.filter((entry) => !entry.offline).length : undefined}
    />
  );
}
