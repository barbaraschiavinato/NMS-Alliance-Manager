import type { AllianceMember } from "@/lib/member-types";
import { coveredSpecialties, missionSpecialties, type Mission, type MissionSpecialty } from "@/lib/missions";

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
