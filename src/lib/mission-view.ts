import { isEmailAddress, type AllianceMember } from "@/lib/member-types";
import type { Mission } from "@/lib/missions";

export function serializeMission(
  mission: Mission,
  members: readonly AllianceMember[],
): Mission {
  const assignedMember = members.find((candidate) => candidate.publicId === mission.assignedMemberId);
  const stationOwner = members.find((candidate) => candidate.publicId === mission.stationOwnerMemberId);
  const creator = members.find((candidate) => candidate.publicId === mission.createdByMemberId);
  const safeName = (value: string | undefined, fallback?: string) => {
    const name = value?.trim();
    if (name && !isEmailAddress(name)) return name;
    const fallbackName = fallback?.trim();
    if (fallbackName && !isEmailAddress(fallbackName)) return fallbackName;
    return name ? "Former member" : "";
  };
  return {
    ...mission,
    createdByName: safeName(mission.createdByName, creator?.nmsName || creator?.name),
    createdByMemberId: creator?.publicId ?? mission.createdByMemberId,
    stationOwnerName: safeName(mission.stationOwnerName, stationOwner?.nmsName || stationOwner?.name),
    stationOwnerMemberId: stationOwner?.publicId ?? mission.stationOwnerMemberId,
    assignedTo: safeName(mission.assignedTo, assignedMember?.nmsName || assignedMember?.name || (mission.assignedMemberId ? "Former member" : "")),
    assignedMemberId: assignedMember?.publicId ?? mission.assignedMemberId,
  };
}
