import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { readAccessData, type AllianceMember } from "@/lib/access-store";
import { readAlmanacResponse, readAlmanacResponses, writeAlmanacResponse } from "@/lib/almanac-store";
import { decodePortalAddress, missionSpecialties, type MissionSpecialty } from "@/lib/missions";
import { addStationPortal, readAllStationPortals, readStationPortals, removeStationPortal } from "@/lib/stations-store";
import { readMissions } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  try {
    return NextResponse.json({ stations: await readStations(member) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to read station portals", error);
    return NextResponse.json({ error: "Impossibile leggere le stazioni spaziali." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const portal = typeof payload.portal === "string"
    ? payload.portal.toUpperCase()
    : "";
  const galaxy = payload.galaxy;
  const requestedOwner = typeof payload.owner === "string" ? payload.owner.trim().toLowerCase() : member.email.toLowerCase();
  const decoded = decodePortalAddress(portal);
  if (!decoded || decoded.errors.length > 0 || typeof galaxy !== "number" || !Number.isInteger(galaxy) || galaxy < 0 || galaxy > 255) {
    return NextResponse.json({ error: "Inserisci un portale valido e seleziona una galassia." }, { status: 400 });
  }
  if (!requestedOwner) {
    return NextResponse.json({ error: "Seleziona il proprietario della stazione." }, { status: 400 });
  }
  if (!hasRole(member, "moderator") && requestedOwner !== member.email.toLowerCase()) {
    return NextResponse.json({ error: "Non puoi creare stazioni per un altro membro." }, { status: 403 });
  }

  try {
    const ownerMember = (await readAccessData()).members.find((candidate) =>
      candidate.email.toLowerCase() === requestedOwner && candidate.membershipStatus === "approved",
    );
    if (!ownerMember) {
      return NextResponse.json({ error: "Il proprietario selezionato non è un membro approvato." }, { status: 400 });
    }
    if ((await readStationPortals(requestedOwner)).some((station) => station.portal === portal && station.galaxy === galaxy)) {
      return NextResponse.json({ error: "Questo portale è già presente nella lista del proprietario selezionato." }, { status: 409 });
    }
    await addStationPortal(requestedOwner, portal, galaxy);
    await cacheStationPlanet(portal, galaxy);
    return NextResponse.json({ stations: await readStations(member) }, { status: 201 });
  } catch (error) {
    console.error("Unable to save station portal", error);
    return NextResponse.json({ error: "Impossibile salvare la stazione spaziale." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const portal = typeof payload.portal === "string"
    ? payload.portal.toUpperCase()
    : "";
  const galaxy = payload.galaxy;
  const decoded = decodePortalAddress(portal);
  if (!decoded || decoded.errors.length > 0 || typeof galaxy !== "number" || !Number.isInteger(galaxy) || galaxy < 0 || galaxy > 255) {
    return NextResponse.json({ error: "Portale o galassia non validi." }, { status: 400 });
  }

  try {
    const missions = await readMissions();
    if (missions.some((mission) => mission.systemAddress.toUpperCase() === portal && mission.galaxy === galaxy)) {
      return NextResponse.json({ error: "Questa stazione è associata a una missione e non può essere rimossa." }, { status: 409 });
    }
    await removeStationPortal(member.email, portal, galaxy);
    return NextResponse.json({ stations: await readStations(member) });
  } catch (error) {
    console.error("Unable to remove station portal", error);
    return NextResponse.json({ error: "Impossibile rimuovere la stazione spaziale." }, { status: 503 });
  }
}

async function readStations(member: AllianceMember) {
  const stations = hasRole(member, "moderator")
    ? await readAllStationPortals()
    : (await readStationPortals(member.email)).map((station) => ({ ...station, owner: member.email }));
  const [almanacByPortal, missions] = await Promise.all([
    readAlmanacResponses(stations.map((station) => station.portal)),
    readMissions(),
  ]);
  return stations.map((station) => {
    const matchingMissions = missions.filter((mission) =>
      mission.systemAddress.toUpperCase() === station.portal && mission.galaxy === station.galaxy,
    );
    const completedSpecialties = new Set<MissionSpecialty>();
    for (const mission of matchingMissions) {
      if (mission.targetSpecialty === "all") {
        completedSpecialties.add("builder");
        completedSpecialties.add("ranger");
        completedSpecialties.add("explorer");
      } else {
        completedSpecialties.add(mission.targetSpecialty);
      }
    }
    const availableSpecialties = completedSpecialties.size === 0
      ? [...missionSpecialties]
      : missionSpecialties.filter((specialty) => specialty !== "all" && !completedSpecialties.has(specialty));

    return {
      ...station,
      planet: almanacByPortal[station.portal]?.find((entry) => entry.galaxy === station.galaxy)?.response ?? null,
      hasMissions: matchingMissions.length > 0,
      availableSpecialties,
    };
  });
}

async function cacheStationPlanet(portal: string, galaxy: number) {
  try {
    if (await readAlmanacResponse(portal, galaxy)) return;

    const response = await fetch(`https://nmsalmanac.com/api/planets/${portal}?galaxy=${galaxy + 1}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!response.ok) return;

    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("portal" in result) || typeof result.portal !== "string" || result.portal.toUpperCase() !== portal) return;
    await writeAlmanacResponse(portal, galaxy, result);
  } catch (error) {
    console.error("Unable to cache station planet from NMS Almanac", error);
  }
}