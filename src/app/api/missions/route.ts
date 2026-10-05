import { NextResponse } from "next/server";
import { canViewMission, isMissionInput, type Mission } from "@/lib/missions";
import { readMissions, writeMissions } from "@/lib/store";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { readStationPortals } from "@/lib/stations-store";
import { isValidNmsFriendCode } from "@/lib/member-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const member = await getCurrentMember();
    if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
    const missions = await readMissions();
    return NextResponse.json(hasRole(member, "moderator") ? missions : missions.filter((mission) => canViewMission(mission, member)));
  } catch (error) {
    console.error("Unable to read missions", error);
    return NextResponse.json({ error: "Impossibile leggere le missioni." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  if (!hasRole(member, "moderator")) {
    return NextResponse.json({ error: "Permesso moderator richiesto." }, { status: 403 });
  }
  const input: unknown = await request.json().catch(() => null);
  if (!isMissionInput(input)) {
    return NextResponse.json({ error: "Dati missione non validi." }, { status: 400 });
  }

  try {
    const missions = await readMissions();
    const assignedMember = typeof input.assignedEmail === "string"
      ? await findAssignableMember(input.assignedEmail)
      : null;
    if (input.assignedEmail && !assignedMember) {
      return NextResponse.json({ error: "Seleziona un membro registrato per l'assegnazione." }, { status: 400 });
    }
    const stationOwner = typeof input.stationOwnerEmail === "string"
      ? await findStationOwner(input.stationOwnerEmail, input.systemAddress, input.galaxy)
      : null;
    if (input.stationOwnerEmail && !stationOwner) {
      return NextResponse.json({ error: "La stazione indicata non appartiene all’utente selezionato." }, { status: 400 });
    }
    const targetSpecialties = input.targetSpecialty === "all"
      ? ["builder", "ranger", "explorer"] as const
      : [input.targetSpecialty];
    const createdMissions: Mission[] = targetSpecialties.map((targetSpecialty) => {
      const assignedMemberMatches = input.targetSpecialty !== "all" || assignedMember?.specialty === targetSpecialty;
      const assignee = assignedMemberMatches ? assignedMember : null;
      return {
        ...input,
        targetSpecialty,
        createdByEmail: member.email,
        createdByName: member.nmsName || member.name,
        stationOwnerEmail: stationOwner?.email,
        stationOwnerName: stationOwner?.name,
        assignedTo: assignee?.nmsName || assignee?.name || "",
        assignedEmail: assignee?.email,
        systemAddress: input.systemAddress.toUpperCase(),
        id: crypto.randomUUID(),
      };
    });
    await writeMissions([...createdMissions, ...missions]);
    return NextResponse.json(createdMissions, { status: 201 });
  } catch (error) {
    console.error("Unable to save mission", error);
    return NextResponse.json({ error: "Impossibile salvare la missione." }, { status: 503 });
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

async function findAssignableMember(email: string) {
  const { readAccessData } = await import("@/lib/access-store");
  const data = await readAccessData();
  return data.members.find((candidate) =>
    candidate.email === email.trim().toLowerCase() && candidate.membershipStatus === "approved" && candidate.nmsName && isValidNmsFriendCode(candidate.nmsCode) && candidate.platforms.length > 0 && candidate.specialty,
  ) ?? null;
}