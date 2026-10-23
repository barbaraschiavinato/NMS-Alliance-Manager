import { auth } from "@/auth";
import { LoginScreen } from "@/components/pages/login-screen";
import { getMissingAuthConfiguration } from "@/lib/auth/local-auth";
import { MessagesPage } from "@/components/pages/messages-page";
import { PendingApproval } from "@/components/pages/pending-approval";
import { getCurrentMember } from "@/lib/auth/authorization";
import { readAccessData } from "@/lib/members/access-store";
import { readMissions } from "@/lib/missions/store";
import { readAllStationPortals, readStationPortals } from "@/lib/stations/stations-store";
import { readPrivateMessages } from "@/lib/messages/private-messages-store";
import { findMessageRoot } from "@/lib/messages/message-thread";
import { notFound } from "next/navigation";

export async function renderMessagesRoute(detailId?: string) {
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
    const messages = (await readPrivateMessages()).filter(
      (message) =>
        message.subjectType !== "help" &&
        message.subjectType !== "taxi" &&
        (member.role === "admin" ||
          message.senderMemberId === member.publicId ||
          message.recipientMemberId === member.publicId),
    );
    const root = findMessageRoot(messages, detailId);
    if (!root) notFound();
    detailRootId = root.id;
  }
  const isModerator = member.role === "admin" || member.role === "moderator";
  const [missions, stations] = await Promise.all([
    readMissions(),
    isModerator ? readAllStationPortals() : readStationPortals(member.publicId),
  ]);
  return (
    <MessagesPage
      detailRootId={detailRootId}
      alliance={accessData.alliance}
      currentMember={member}
      missionCount={missions.length}
      stationCount={stations.length}
      offlineCount={isModerator ? accessData.members.filter((item) => item.offline).length : undefined}
      userCount={isModerator ? accessData.members.filter((item) => !item.offline).length : undefined}
    />
  );
}
