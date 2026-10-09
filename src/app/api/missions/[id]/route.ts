import { NextResponse } from "next/server";
import { isDifferentPlanetInSameSystem, isMissionInput, isMissionStatus, specialtyAlreadyCovered, type MissionStatus } from "@/lib/missions";
import { readMissions, writeMissions } from "@/lib/store";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { isValidNmsFriendCode } from "@/lib/member-types";
import { readAllStationPortals, readStationPortals } from "@/lib/stations-store";
import { readAccessData } from "@/lib/access-store";
import { serializeMission } from "@/lib/mission-view";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const input: unknown = await request.json().catch(() => null);
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });

  try {
    const { id } = await context.params;
    const missions = await readMissions();
    const index = missions.findIndex((mission) => mission.id === id);
    if (index === -1) return NextResponse.json({ error: "Missione non trovata." }, { status: 404 });
    let updated;
    if (hasRole(member, "moderator")) {
      if (!isMissionInput(input)) return NextResponse.json({ error: "Dati missione non validi." }, { status: 400 });
      const existingMission = missions[index];
      const stations = await readAllStationPortals();
      const conflictsWithRegisteredPlanet = [
        ...missions.filter((mission) => mission.id !== id)
          .map((mission) => ({ portal: mission.systemAddress, galaxy: mission.galaxy })),
        ...stations.map((station) => ({ portal: station.portal, galaxy: station.galaxy })),
      ].some((entry) => isDifferentPlanetInSameSystem(
        input.systemAddress,
        input.galaxy,
        entry.portal,
        entry.galaxy,
      ));
      if (input.targetSpecialty !== existingMission.targetSpecialty && specialtyAlreadyCovered(input.targetSpecialty, missions, input.systemAddress, input.galaxy, id)) {
        return NextResponse.json({ error: "Esiste già una missione di questo tipo per la stazione." }, { status: 409 });
      }
      if (conflictsWithRegisteredPlanet) {
        return NextResponse.json({ error: "errors.another_planet_from_system_already_registered" }, { status: 409 });
      }
      const access = await readAccessData();
      const assignedMemberId = input.assignedMemberId?.trim() || undefined;
      const assignedMember = assignedMemberId
        ? access.members.find((candidate) => candidate.publicId === assignedMemberId &&
          candidate.membershipStatus === "approved" && candidate.nmsName &&
          isValidNmsFriendCode(candidate.nmsCode) && candidate.specialty)
        : null;
      if (assignedMemberId && !assignedMember && assignedMemberId !== existingMission.assignedMemberId) {
        return NextResponse.json({ error: "Membro assegnatario non trovato." }, { status: 400 });
      }
      const stationOwner = input.stationOwnerMemberId
        ? await findStationOwner(input.stationOwnerMemberId, input.systemAddress, input.galaxy)
        : null;
      if (input.stationOwnerMemberId && !stationOwner && input.stationOwnerMemberId !== existingMission.stationOwnerMemberId) {
        return NextResponse.json({ error: "Lo scopritore selezionato non risulta proprietario della stazione." }, { status: 400 });
      }
      updated = {
        ...input,
        createdAt: existingMission.createdAt,
        createdByMemberId: existingMission.createdByMemberId,
        createdByName: existingMission.createdByName,
        stationOwnerMemberId: stationOwner?.publicId,
        stationOwnerName: stationOwner?.name,
        assignedTo: assignedMember?.nmsName || assignedMember?.name || (assignedMemberId ? existingMission.assignedTo : ""),
        assignedMemberId: assignedMember?.publicId ?? assignedMemberId,
        systemAddress: input.systemAddress.toUpperCase(),
        id,
      };
    } else {
      if (missions[index].assignedMemberId !== member.publicId || !isProgressUpdate(input)) {
        return NextResponse.json({ error: "Puoi aggiornare solo l'avanzamento delle missioni assegnate a te." }, { status: 403 });
      }
      updated = { ...missions[index], ...input };
    }
    missions[index] = updated;
    await writeMissions(missions);
    const accessData = await readAccessData();
    return NextResponse.json(serializeMission(updated, accessData.members));
  } catch (error) {
    console.error("Unable to update mission", error);
    return NextResponse.json({ error: "Impossibile aggiornare la missione." }, { status: 503 });
  }
}

async function findStationOwner(publicId: string, portal: string, galaxy: number) {
  const access = await readAccessData();
  const owner = access.members.find((candidate) =>
    candidate.publicId === publicId && candidate.membershipStatus === "approved",
  );
  if (!owner) return null;
  const stations = await readStationPortals(owner.publicId);
  if (!stations.some((station) => station.portal === portal.toUpperCase() && station.galaxy === galaxy)) return null;
  return { publicId: owner.publicId, name: owner.nmsName || owner.name };
}

export async function DELETE(_request: Request, context: RouteContext) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  if (!hasRole(member, "moderator")) {
    return NextResponse.json({ error: "Permesso moderator richiesto." }, { status: 403 });
  }
  try {
    const { id } = await context.params;
    const missions = await readMissions();
    const remaining = missions.filter((mission) => mission.id !== id);
    if (remaining.length === missions.length) {
      return NextResponse.json({ error: "Missione non trovata." }, { status: 404 });
    }
    await writeMissions(remaining);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to delete mission", error);
    return NextResponse.json({ error: "Impossibile eliminare la missione." }, { status: 503 });
  }
}

function isProgressUpdate(value: unknown): value is { status: MissionStatus; progress: number } {
  if (!value || typeof value !== "object") return false;
  const update = value as Record<string, unknown>;
  return isMissionStatus(update.status) &&
    typeof update.progress === "number" && Number.isInteger(update.progress) &&
    update.progress >= 0 && update.progress <= 100 &&
    Object.keys(update).every((key) => key === "status" || key === "progress");
}