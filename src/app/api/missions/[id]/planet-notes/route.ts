import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { canViewMission } from "@/lib/missions/missions";
import { readMissions } from "@/lib/missions/store";
import { readAllStationPortals } from "@/lib/stations/stations-store";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { apiError, forbidden, notFound, unauthorized } from "@/lib/utils/api-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withRequestMemo(async function GET(_request: Request, context: RouteContext) {
  const member = await getCurrentMember();
  if (!member) return unauthorized();

  try {
    const { id } = await context.params;
    const mission = (await readMissions()).find((candidate) => candidate.id === id);
    if (!mission) return notFound("errors.mission_not_found");
    if (!hasRole(member, "moderator") && !canViewMission(mission, member)) {
      return forbidden("errors.no_access_to_this_mission");
    }
    const portal = mission.systemAddress.toUpperCase();
    const stations = (await readAllStationPortals()).filter(
      (candidate) => candidate.portal === portal && candidate.galaxy === mission.galaxy,
    );
    const stationWithMissionOwner = stations.find(
      (candidate) => candidate.ownerId === mission.stationOwnerMemberId && candidate.note?.trim(),
    );
    const stationsWithNotes = stations.filter((candidate) => candidate.note?.trim());
    const station = stationWithMissionOwner ?? (stationsWithNotes.length === 1 ? stationsWithNotes[0] : undefined);
    return NextResponse.json({ note: station?.note ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to read mission station note", error);
    return apiError("errors.unable_to_read_the_station_notes", 503);
  }
});
