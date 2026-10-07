import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { canViewMission } from "@/lib/missions";
import { readMissions } from "@/lib/store";
import { readStationPortals } from "@/lib/stations-store";
import { readAccessData } from "@/lib/access-store";

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
    if (!mission.stationOwnerMemberId) {
      return NextResponse.json({ note: null }, { headers: { "Cache-Control": "no-store" } });
    }

    const owner = (await readAccessData()).members.find((candidate) =>
      candidate.publicId === mission.stationOwnerMemberId && candidate.membershipStatus === "approved",
    );
    if (!owner) return NextResponse.json({ note: null }, { headers: { "Cache-Control": "no-store" } });
    const stations = await readStationPortals(owner.email);
    const station = stations.find((candidate) =>
      candidate.portal === mission.systemAddress.toUpperCase() && candidate.galaxy === mission.galaxy,
    );
    return NextResponse.json({ note: station?.note ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to read mission station note", error);
    return NextResponse.json({ error: "Impossibile leggere le note della stazione." }, { status: 503 });
  }
}
