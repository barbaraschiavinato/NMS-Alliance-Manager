import { auth } from "@/auth";
import { LoginScreen } from "@/components/pages/login-screen";
import { getMissingAuthConfiguration } from "@/lib/local-auth";
import { HelpRequestsPage } from "@/components/pages/help-requests-page";
import { PendingApproval } from "@/components/pages/pending-approval";
import { getCurrentMember } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";
import { readMissions } from "@/lib/store";
import { readAllStationPortals, readStationPortals } from "@/lib/stations-store";
import { readHelpRequests } from "@/lib/private-messages-store";
import { findMessageRoot } from "@/lib/message-thread";
import { notFound } from "next/navigation";

export async function renderRequestBoard(kind: "help" | "taxi" = "help", detailId?: string) {
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

  let detailRootId: string | undefined;
  if (detailId !== undefined) {
    const root = findMessageRoot(await readHelpRequests(kind), detailId);
    if (!root || root.replyToId) notFound();
    detailRootId = root.id;
  }
  const isModerator = member.role === "admin" || member.role === "moderator";
  const [missions, stations] = await Promise.all([
    readMissions(),
    isModerator || kind === "taxi" ? readAllStationPortals() : readStationPortals(member.publicId),
  ]);
  return (
    <HelpRequestsPage
      detailRootId={detailRootId}
      alliance={accessData.alliance}
      currentMember={member}
      kind={kind}
      taxiStations={
        kind === "taxi"
          ? stations.map((station) => ({
              id: `${"ownerId" in station ? station.ownerId : member.publicId}:${station.portal}:${station.galaxy}`,
              portal: station.portal,
              galaxy: station.galaxy,
              ...(station.name ? { name: station.name } : {}),
            }))
          : undefined
      }
      missionCount={missions.length}
      stationCount={
        isModerator || kind === "help"
          ? stations.length
          : stations.filter((station) => "ownerId" in station && station.ownerId === member.publicId).length
      }
      offlineCount={isModerator ? accessData.members.filter((item) => item.offline).length : undefined}
      userCount={isModerator ? accessData.members.filter((item) => !item.offline).length : undefined}
    />
  );
}
