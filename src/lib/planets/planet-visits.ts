import type { Mission } from "@/lib/missions/missions";

export function planetVisitKey(planetPortal: string, galaxy: number) {
  return `${galaxy}:${planetPortal.toUpperCase()}`;
}

type StationRef = Readonly<{ portal: string; galaxy: number; ownerId: string }>;

// Members mark planets as visited when they discovered the system's station (any specialty), or when they are an
// explorer or builder with a mission assigned to them in the system.
export function canMarkPlanetVisited(
  member: Readonly<{ publicId: string; specialty: string }>,
  missions: readonly Mission[],
  stations: readonly StationRef[],
  planetPortal: string,
  galaxy: number,
) {
  const system = planetPortal.slice(1).toUpperCase();
  if (
    stations.some(
      (station) =>
        station.ownerId === member.publicId &&
        station.galaxy === galaxy &&
        station.portal.slice(1).toUpperCase() === system,
    )
  )
    return true;
  if (member.specialty !== "explorer" && member.specialty !== "builder") return false;
  return missions.some(
    (mission) =>
      mission.assignedMemberId === member.publicId &&
      mission.galaxy === galaxy &&
      mission.systemAddress.slice(1).toUpperCase() === system,
  );
}
