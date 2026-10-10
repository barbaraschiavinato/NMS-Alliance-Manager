import { isValidNmsFriendCode } from "@/lib/member-types";
import { readAccessData, writeAccessData } from "@/lib/access-store";
import { reassignPrivateMessageMember } from "@/lib/private-messages-store";
import { reassignStationOwner } from "@/lib/stations-store";
import { readMissions, writeMissions } from "@/lib/store";

export async function linkOfflineMember(offlineId: string, targetId: string): Promise<boolean> {
  if (offlineId === targetId) return false;
  const data = await readAccessData();
  const offline = data.members.find((member) => member.publicId === offlineId && member.offline);
  const target = data.members.find((member) => member.publicId === targetId && !member.offline);
  if (!offline || !target) return false;

  const hasProfile = target.nmsName && isValidNmsFriendCode(target.nmsCode) && target.specialty;
  if (!hasProfile) {
    target.nmsName = offline.nmsName;
    target.nmsCode = offline.nmsCode;
    if (offline.telegramName) target.telegramName = offline.telegramName;
    if (offline.discordName) target.discordName = offline.discordName;
    target.platforms = offline.platforms;
    target.specialty = offline.specialty;
  }
  if (target.membershipStatus === "pending") {
    target.membershipStatus = "approved";
    target.approvedBy = offline.approvedBy;
    target.approvedAt = new Date().toISOString();
  }

  const missions = await readMissions();
  await writeMissions(missions.map((mission) => ({
    ...mission,
    ...(mission.createdByMemberId === offlineId ? { createdByMemberId: targetId } : {}),
    ...(mission.stationOwnerMemberId === offlineId ? { stationOwnerMemberId: targetId } : {}),
    ...(mission.assignedMemberId === offlineId ? { assignedMemberId: targetId } : {}),
  })));
  await reassignStationOwner(offlineId, targetId);
  await reassignPrivateMessageMember(offlineId, targetId);

  data.members = data.members.filter((member) => member.publicId !== offlineId);
  await writeAccessData(data);
  return true;
}
