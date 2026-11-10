import { NextResponse } from "next/server";
import {
  isDifferentPlanetInSameSystem,
  isMissionInput,
  isMissionStatus,
  specialtyAlreadyCovered,
  type MissionStatus,
} from "@/lib/missions/missions";
import { readMissions, writeMissions } from "@/lib/missions/store";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { isValidNmsFriendCode } from "@/lib/members/member-types";
import { readAllStationPortals, readStationPortals } from "@/lib/stations/stations-store";
import { readAccessData } from "@/lib/members/access-store";
import { serializeMission } from "@/lib/missions/mission-view";
import { withRequestMemo } from "@/lib/storage/request-memo";
import {
  apiError,
  badRequest,
  conflict,
  forbidden,
  moderatorRequired,
  notFound,
  unauthorized,
} from "@/lib/utils/api-responses";

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withRequestMemo(async function PATCH(request: Request, context: RouteContext) {
  const input: unknown = await request.json().catch(() => null);
  const member = await getCurrentMember();
  if (!member) return unauthorized();

  try {
    const { id } = await context.params;
    const missions = await readMissions();
    const index = missions.findIndex((mission) => mission.id === id);
    if (index === -1) return notFound("errors.mission_not_found");
    let updated;
    if (hasRole(member, "moderator") && !isProgressUpdate(input)) {
      if (!isMissionInput(input)) return badRequest("errors.invalid_mission_data");
      const existingMission = missions[index];
      const stations = await readAllStationPortals();
      const conflictsWithRegisteredPlanet = [
        ...missions
          .filter((mission) => mission.id !== id)
          .map((mission) => ({ portal: mission.systemAddress, galaxy: mission.galaxy })),
        ...stations.map((station) => ({ portal: station.portal, galaxy: station.galaxy })),
      ].some((entry) => isDifferentPlanetInSameSystem(input.systemAddress, input.galaxy, entry.portal, entry.galaxy));
      if (
        input.targetSpecialty !== existingMission.targetSpecialty &&
        specialtyAlreadyCovered(input.targetSpecialty, missions, input.systemAddress, input.galaxy, id)
      ) {
        return conflict("errors.mission_of_this_type_already_exists_for_the_station");
      }
      if (conflictsWithRegisteredPlanet) {
        return conflict("errors.another_planet_from_system_already_registered");
      }
      const access = await readAccessData();
      const assignedMemberId = input.assignedMemberId?.trim() || undefined;
      const assignedMember = assignedMemberId
        ? access.members.find(
            (candidate) =>
              candidate.publicId === assignedMemberId &&
              candidate.membershipStatus === "approved" &&
              candidate.nmsName &&
              (candidate.offline || isValidNmsFriendCode(candidate.nmsCode)) &&
              candidate.specialty,
          )
        : null;
      if (assignedMemberId && !assignedMember && assignedMemberId !== existingMission.assignedMemberId) {
        return badRequest("errors.assigned_member_not_found");
      }
      const stationOwner = input.stationOwnerMemberId
        ? await findStationOwner(input.stationOwnerMemberId, input.systemAddress, input.galaxy)
        : null;
      if (
        input.stationOwnerMemberId &&
        !stationOwner &&
        input.stationOwnerMemberId !== existingMission.stationOwnerMemberId
      ) {
        return badRequest("stations.the_selected_discoverer_is_not_the_station_owner");
      }
      updated = {
        ...input,
        createdAt: existingMission.createdAt,
        createdByMemberId: existingMission.createdByMemberId,
        createdByName: existingMission.createdByName,
        stationOwnerMemberId: stationOwner?.publicId,
        stationOwnerName: stationOwner?.name,
        assignedTo:
          assignedMember?.nmsName || assignedMember?.name || (assignedMemberId ? existingMission.assignedTo : ""),
        assignedMemberId: assignedMember?.publicId ?? assignedMemberId,
        systemAddress: input.systemAddress.toUpperCase(),
        id,
      };
    } else {
      if (missions[index].assignedMemberId !== member.publicId || !isProgressUpdate(input)) {
        return forbidden("missions.you_can_only_update_progress_on_missions_assigned_to_you");
      }
      if (missions[index].status === "completed" && input.status === "completed") {
        return conflict("errors.mission_already_completed");
      }
      updated = { ...missions[index], ...input };
    }
    missions[index] = updated;
    await writeMissions(missions);
    const accessData = await readAccessData();
    return NextResponse.json(serializeMission(updated, accessData.members));
  } catch (error) {
    console.error("Unable to update mission", error);
    return apiError("errors.unable_to_update_the_mission", 503);
  }
});

async function findStationOwner(publicId: string, portal: string, galaxy: number) {
  const access = await readAccessData();
  const owner = access.members.find(
    (candidate) => candidate.publicId === publicId && candidate.membershipStatus === "approved",
  );
  if (!owner) return null;
  const stations = await readStationPortals(owner.publicId);
  if (!stations.some((station) => station.portal === portal.toUpperCase() && station.galaxy === galaxy)) return null;
  return { publicId: owner.publicId, name: owner.nmsName || owner.name };
}

export const DELETE = withRequestMemo(async function DELETE(_request: Request, context: RouteContext) {
  const member = await getCurrentMember();
  if (!member) return unauthorized();
  if (!hasRole(member, "moderator")) {
    return moderatorRequired();
  }
  try {
    const { id } = await context.params;
    const missions = await readMissions();
    const remaining = missions.filter((mission) => mission.id !== id);
    if (remaining.length === missions.length) {
      return notFound("errors.mission_not_found");
    }
    await writeMissions(remaining);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to delete mission", error);
    return apiError("errors.unable_to_delete_the_mission", 503);
  }
});

function isProgressUpdate(value: unknown): value is { status: MissionStatus; progress: number } {
  if (!value || typeof value !== "object") return false;
  const update = value as Record<string, unknown>;
  return (
    isMissionStatus(update.status) &&
    typeof update.progress === "number" &&
    Number.isInteger(update.progress) &&
    update.progress >= 0 &&
    update.progress <= 100 &&
    Object.keys(update).every((key) => key === "status" || key === "progress")
  );
}
