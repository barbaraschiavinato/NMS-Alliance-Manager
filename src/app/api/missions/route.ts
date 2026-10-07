import { NextResponse } from "next/server";
import { canViewMission, isMissionInput, type Mission } from "@/lib/missions";
import { readMissions, writeMissions } from "@/lib/store";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";
import { readStationPortals } from "@/lib/stations-store";
import { isValidNmsFriendCode } from "@/lib/member-types";
import { serializeMission } from "@/lib/mission-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const member = await getCurrentMember();
    if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
    const [missions, accessData] = await Promise.all([readMissions(), readAccessData()]);
    const canManage = hasRole(member, "moderator");
    const visibleMissions = canManage ? missions : missions.filter((mission) => canViewMission(mission, member));
    return NextResponse.json(visibleMissions.map((mission) => serializeMission(mission, accessData.members)));
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
    const assignedMember = typeof input.assignedMemberId === "string"
      ? await findAssignableMember(input.assignedMemberId)
      : null;
    if (input.assignedMemberId && !assignedMember) {
      return NextResponse.json({ error: "Seleziona un membro registrato per l'assegnazione." }, { status: 400 });
    }
    const stationOwner = typeof input.stationOwnerMemberId === "string"
      ? await findStationOwner(input.stationOwnerMemberId, input.systemAddress, input.galaxy)
      : null;
    if (input.stationOwnerMemberId && !stationOwner) {
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
        createdByMemberId: member.publicId,
        createdByName: member.nmsName || member.name,
        stationOwnerMemberId: stationOwner?.publicId,
        stationOwnerName: stationOwner?.name,
        assignedTo: assignee?.nmsName || assignee?.name || "",
        assignedMemberId: assignee?.publicId,
        systemAddress: input.systemAddress.toUpperCase(),
        id: crypto.randomUUID(),
      };
    });
    await writeMissions([...createdMissions, ...missions]);
    const accessData = await readAccessData();
    return NextResponse.json(createdMissions.map((mission) => serializeMission(mission, accessData.members)), { status: 201 });
  } catch (error) {
    console.error("Unable to save mission", error);
    return NextResponse.json({ error: "Impossibile salvare la missione." }, { status: 503 });
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

async function findAssignableMember(publicId: string) {
  const data = await readAccessData();
  return data.members.find((candidate) =>
    candidate.publicId === publicId.trim() && candidate.membershipStatus === "approved" && candidate.nmsName && isValidNmsFriendCode(candidate.nmsCode) && candidate.platforms.length > 0 && candidate.specialty,
  ) ?? null;
}