import type { AllianceMember } from "@/lib/members/member-types";
import { coveredSpecialties, missionSpecialties, type Mission, type MissionSpecialty } from "@/lib/missions/missions";

export function availableMissionSpecialties(
  missions: readonly Mission[],
  portal: string,
  galaxy: number,
): MissionSpecialty[] {
  const matchingMissions = missions.filter(
    (mission) => mission.systemAddress.toUpperCase() === portal.toUpperCase() && mission.galaxy === galaxy,
  );
  if (matchingMissions.length === 0) return [...missionSpecialties];

  const covered = new Set(matchingMissions.flatMap((mission) => coveredSpecialties(mission.targetSpecialty)));
  return missionSpecialties.filter(
    (specialty) => specialty !== "all" && specialty !== "explorer_builder" && !covered.has(specialty),
  );
}

export function canCreateMissionFromStation(
  station: Readonly<{ ownerId: string; availableSpecialties: readonly MissionSpecialty[] }>,
  member: Pick<AllianceMember, "publicId" | "specialty">,
  canManage: boolean,
): boolean {
  if (canManage) return station.availableSpecialties.length > 0;
  if (member.specialty === "explorer" || member.specialty === "builder") {
    return station.availableSpecialties.includes(member.specialty);
  }
  return (
    member.specialty === "ranger" &&
    station.ownerId === member.publicId &&
    station.availableSpecialties.some((specialty) => ["explorer_builder", "explorer", "builder"].includes(specialty))
  );
}

// True when a free mission of the member's specialty is waiting at the station, or the member can still create one.
export function stationHasMissionOpportunity(
  station: Readonly<{ portal: string; galaxy: number; ownerId: string }>,
  missions: readonly Mission[],
  member: Pick<AllianceMember, "publicId" | "specialty">,
  canManage: boolean,
): boolean {
  const here = missions.filter(
    (mission) =>
      mission.systemAddress.toUpperCase() === station.portal.toUpperCase() && mission.galaxy === station.galaxy,
  );
  const specialty = member.specialty;
  const claimable =
    (specialty === "explorer" || specialty === "builder") &&
    here.some(
      (mission) =>
        mission.status === "pending" &&
        !mission.assignedMemberId &&
        !mission.assignedTo.trim() &&
        coveredSpecialties(mission.targetSpecialty).includes(specialty),
    );
  const availableSpecialties = availableMissionSpecialties(missions, station.portal, station.galaxy);
  return (
    claimable || canCreateMissionFromStation({ ownerId: station.ownerId, availableSpecialties }, member, canManage)
  );
}
