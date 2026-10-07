import { NextResponse } from "next/server";
import { isMissionInput, isMissionStatus, type MissionStatus } from "@/lib/missions";
import { readMissions, writeMissions } from "@/lib/store";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { isValidNmsFriendCode } from "@/lib/member-types";
import { readStationPortals } from "@/lib/stations-store";

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
      const assignedEmail = input.assignedEmail?.trim().toLowerCase();
      let assignedTo = input.assignedTo;
      if (assignedEmail) {
        const { readAccessData } = await import("@/lib/access-store");
        const access = await readAccessData();
        const assignee = access.members.find((candidate) =>
          candidate.email === assignedEmail && candidate.membershipStatus === "approved" && candidate.nmsName && isValidNmsFriendCode(candidate.nmsCode) && candidate.platforms.length > 0 && candidate.specialty,
        );
        if (!assignee) return NextResponse.json({ error: "Membro assegnatario non trovato." }, { status: 400 });
        assignedTo = assignee.nmsName || assignee.name;
      }
      const stationOwner = input.stationOwnerEmail
        ? await findStationOwner(input.stationOwnerEmail, input.systemAddress, input.galaxy)
        : null;
      if (input.stationOwnerEmail && !stationOwner) {
        return NextResponse.json({ error: "Lo scopritore selezionato non risulta proprietario della stazione." }, { status: 400 });
      }
      updated = {
        ...input,
        createdByEmail: missions[index].createdByEmail,
        createdByName: missions[index].createdByName,
        stationOwnerEmail: stationOwner?.email,
        stationOwnerName: stationOwner?.name,
        assignedTo,
        assignedEmail,
        systemAddress: input.systemAddress.toUpperCase(),
        id,
      };
    } else {
      if (missions[index].assignedEmail !== member.email || !isProgressUpdate(input)) {
        return NextResponse.json({ error: "Puoi aggiornare solo l'avanzamento delle missioni assegnate a te." }, { status: 403 });
      }
      updated = { ...missions[index], ...input };
    }
    missions[index] = updated;
    await writeMissions(missions);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Unable to update mission", error);
    return NextResponse.json({ error: "Impossibile aggiornare la missione." }, { status: 503 });
  }
}

async function findStationOwner(email: string, portal: string, galaxy: number) {
  const normalizedEmail = email.trim().toLowerCase();
  const stations = await readStationPortals(normalizedEmail);
  if (!stations.some((station) => station.portal === portal.toUpperCase() && station.galaxy === galaxy)) return null;

  const { readAccessData } = await import("@/lib/access-store");
  const access = await readAccessData();
  const owner = access.members.find((candidate) => candidate.email === normalizedEmail && candidate.membershipStatus === "approved");
  return { email: normalizedEmail, name: owner?.nmsName || owner?.name || normalizedEmail };
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