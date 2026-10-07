import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { canViewMission } from "@/lib/missions";
import { readMissions } from "@/lib/store";
import { readAllStationPortals } from "@/lib/stations-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });

  try {
    const { id } = await context.params;
    const mission = (await readMissions()).find((candidate) => candidate.id === id);
    if (!mission) return NextResponse.json({ error: "Missione non trovata." }, { status: 404 });
    if (!hasRole(member, "moderator") && !canViewMission(mission, member)) {
      return NextResponse.json({ error: "Non hai accesso a questa missione." }, { status: 403 });
    }
    const portal = mission.systemAddress.toUpperCase();
    const stations = (await readAllStationPortals()).filter((candidate) =>
      candidate.portal === portal && candidate.galaxy === mission.galaxy,
    );
    const stationWithMissionOwner = stations.find((candidate) =>
      candidate.ownerId === mission.stationOwnerMemberId && candidate.note?.trim(),
    );
    const stationsWithNotes = stations.filter((candidate) => candidate.note?.trim());
    const station = stationWithMissionOwner ??
      (stationsWithNotes.length === 1 ? stationsWithNotes[0] : undefined);
    return NextResponse.json({ note: station?.note ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to read mission station note", error);
    return NextResponse.json({ error: "Impossibile leggere le note della stazione." }, { status: 503 });
  }
}
