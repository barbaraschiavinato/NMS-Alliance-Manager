import { NextResponse } from "next/server";
import { canViewMission, isDifferentPlanetInSameSystem, isMissionInput, specialtyAlreadyCovered, type Mission } from "@/lib/missions";
import { readMissions, writeMissions } from "@/lib/store";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";
import { readAllStationPortals, readStationPortals } from "@/lib/stations-store";
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
  const isModerator = hasRole(member, "moderator");
  const canCreateOwnSpecialtyMission = !isModerator &&
    (member.specialty === "explorer" || member.specialty === "builder");
  if (!isModerator && member.specialty !== "ranger" && !canCreateOwnSpecialtyMission) {
    return NextResponse.json({ error: "Permesso moderator richiesto." }, { status: 403 });
  }
  const input: unknown = await request.json().catch(() => null);
  if (!isMissionInput(input)) {
    return NextResponse.json({ error: "Dati missione non validi." }, { status: 400 });
  }
  if (!isModerator && member.specialty === "ranger" && (
    input.stationOwnerMemberId !== member.publicId ||
    input.assignedMemberId ||
    !["explorer_builder", "explorer", "builder"].includes(input.targetSpecialty)
  )) {
    return NextResponse.json({ error: "I Ranger possono creare missioni solo per le proprie stazioni, per Esploratori e Costruttori." }, { status: 403 });
  }
  if (canCreateOwnSpecialtyMission && (
    input.targetSpecialty !== member.specialty ||
    input.assignedMemberId !== member.publicId ||
    !input.stationOwnerMemberId
  )) {
    return NextResponse.json({ error: "missions.only_create_and_assign_your_specialty" }, { status: 403 });
  }

  try {
    const [missions, stations] = await Promise.all([readMissions(), readAllStationPortals()]);
    if (
      canCreateOwnSpecialtyMission &&
      specialtyAlreadyCovered(input.targetSpecialty, missions, input.systemAddress, input.galaxy)
    ) {
      return NextResponse.json({ error: "missions.mission_already_exists_for_specialty" }, { status: 409 });
    }
    const conflictsWithRegisteredPlanet = [
      ...missions.map((mission) => ({ portal: mission.systemAddress, galaxy: mission.galaxy })),
      ...stations.map((station) => ({ portal: station.portal, galaxy: station.galaxy })),
    ].some((entry) => isDifferentPlanetInSameSystem(
      input.systemAddress,
      input.galaxy,
      entry.portal,
      entry.galaxy,
    ));
    if (conflictsWithRegisteredPlanet) {
      return NextResponse.json({ error: "errors.another_planet_from_system_already_registered" }, { status: 409 });
    }
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
      : input.targetSpecialty === "explorer_builder"
        ? ["builder", "explorer"] as const
        : [input.targetSpecialty];
    const createdMissions: Mission[] = targetSpecialties.map((targetSpecialty) => {
      const assignedMemberMatches = input.targetSpecialty !== "all" && input.targetSpecialty !== "explorer_builder" || assignedMember?.specialty === targetSpecialty;
      const assignee = assignedMemberMatches ? assignedMember : null;
      return {
        ...input,
        targetSpecialty,
        createdAt: new Date().toISOString(),
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
    candidate.publicId === publicId.trim() && candidate.membershipStatus === "approved" && candidate.nmsName && isValidNmsFriendCode(candidate.nmsCode) && candidate.specialty,
  ) ?? null;
}