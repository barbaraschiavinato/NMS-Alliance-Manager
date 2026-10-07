import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/authorization";
import { readMissions, writeMissions } from "@/lib/store";
import { isValidNmsFriendCode } from "@/lib/member-types";
import type { Mission } from "@/lib/missions";
import { readAccessData } from "@/lib/access-store";
import { serializeMission } from "@/lib/mission-view";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  if (!member.nmsName.trim() || !isValidNmsFriendCode(member.nmsCode) || !member.specialty) {
    return NextResponse.json({ error: "Completa prima il tuo profilo NMS con nome, codice amico, piattaforme e specializzazione." }, { status: 409 });
  }

  try {
    const { id } = await context.params;
    const missions = await readMissions();
    const index = missions.findIndex((mission) => mission.id === id);
    if (index === -1) return NextResponse.json({ error: "Missione non trovata." }, { status: 404 });
    const mission = missions[index];
    if (mission.targetSpecialty !== "all" && mission.targetSpecialty !== member.specialty) {
      return NextResponse.json({ error: "Questa missione è riservata a un’altra specializzazione." }, { status: 403 });
    }
    if (mission.assignedMemberId || mission.assignedTo.trim()) {
      return NextResponse.json({ error: "Questa missione è già assegnata." }, { status: 409 });
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
    return NextResponse.json({ error: "Impossibile prendere la missione." }, { status: 503 });
  }
}