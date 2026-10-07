import { isEmailAddress, type AllianceMember } from "@/lib/member-types";
import type { Mission } from "@/lib/missions";

export function serializeMission(
  mission: Mission,
  members: readonly AllianceMember[],
  includeEmails: boolean,
): Mission {
  const findMember = (email?: string) => email
    ? members.find((candidate) => candidate.email.toLowerCase() === email.toLowerCase())
    : undefined;
  const assignedMember = findMember(mission.assignedEmail);
  const stationOwner = members.find((candidate) => candidate.publicId === mission.stationOwnerMemberId);
  const creator = findMember(mission.createdByEmail);
  const safeName = (value: string | undefined, fallback?: string) => {
    const name = value?.trim();
    if (name && !isEmailAddress(name)) return name;
    const fallbackName = fallback?.trim();
    if (fallbackName && !isEmailAddress(fallbackName)) return fallbackName;
    return name ? "Former member" : "";
  };
  const {
    createdByEmail,
    assignedEmail,
    ...safeMission
  } = mission;
  return {
    ...safeMission,
    createdByName: safeName(mission.createdByName, creator?.nmsName || creator?.name),
    createdByMemberId: creator?.publicId,
    stationOwnerName: safeName(mission.stationOwnerName, stationOwner?.nmsName || stationOwner?.name),
    stationOwnerMemberId: stationOwner?.publicId ?? mission.stationOwnerMemberId,
    assignedTo: safeName(mission.assignedTo, assignedMember?.nmsName || assignedMember?.name || (assignedEmail ? "Former member" : "")),
    assignedMemberId: assignedMember?.publicId,
    ...(includeEmails ? { createdByEmail, assignedEmail } : {}),
  };
}
