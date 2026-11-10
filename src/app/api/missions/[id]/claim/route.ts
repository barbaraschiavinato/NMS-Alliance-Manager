import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth/authorization";
import { readMissions, writeMissions } from "@/lib/missions/store";
import { isValidNmsFriendCode } from "@/lib/members/member-types";
import type { Mission } from "@/lib/missions/missions";
import { readAccessData } from "@/lib/members/access-store";
import { serializeMission } from "@/lib/missions/mission-view";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { apiError, conflict, forbidden, notFound, unauthorized } from "@/lib/utils/api-responses";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withRequestMemo(async function POST(_request: Request, context: RouteContext) {
  const member = await getCurrentMember();
  if (!member) return unauthorized();
  if (!member.nmsName.trim() || !isValidNmsFriendCode(member.nmsCode) || !member.specialty) {
    return conflict("errors.complete_your_nms_profile_with_a_name_friend_code_platforms_and_specialty_first");
  }

  try {
    const { id } = await context.params;
    const missions = await readMissions();
    const index = missions.findIndex((mission) => mission.id === id);
    if (index === -1) return notFound("errors.mission_not_found");
    const mission = missions[index];
    if (mission.targetSpecialty !== "all" && mission.targetSpecialty !== member.specialty) {
      return forbidden("profile.this_mission_is_reserved_for_another_specialty");
    }
    if (mission.assignedMemberId || mission.assignedTo.trim()) {
      return conflict("missions.this_mission_is_already_assigned");
    }
    const claimed: Mission = {
      ...mission,
      assignedTo: member.nmsName,
      assignedMemberId: member.publicId,
      status: "in_progress",
    };
    missions[index] = claimed;
    await writeMissions(missions);
    const accessData = await readAccessData();
    return NextResponse.json(serializeMission(claimed, accessData.members));
  } catch (error) {
    console.error("Unable to claim mission", error);
    return apiError("errors.unable_to_claim_the_mission", 503);
  }
});
