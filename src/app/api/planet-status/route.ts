import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { canViewMission, decodePortalAddress } from "@/lib/missions";
import {
  isMissionSystemStatus,
  missionSystemStatuses,
  type MissionSystemStatus,
} from "@/lib/planet-system-status";
import {
  readPlanetSystemStatus,
  readPlanetSystemStatuses,
  writePlanetSystemStatus,
} from "@/lib/planet-system-status-store";
import { readMissions } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });

  try {
    const missions = await readMissions();
    const url = new URL(request.url);
    const portal = url.searchParams.get("portal");
    const galaxyValue = url.searchParams.get("galaxy");
    if (portal === null && galaxyValue === null) {
      const [missions, statuses] = await Promise.all([readMissions(), readPlanetSystemStatuses()]);
      const visibleKeys = new Set(
        missions
          .filter((mission) => canViewMission(mission, member))
          .map((mission) => `${mission.galaxy}:${mission.systemAddress.toUpperCase()}`),
      );
      return NextResponse.json({
        planets: Object.fromEntries(Object.entries(statuses).filter(([key]) =>
          hasRole(member, "moderator") || visibleKeys.has(key),
        )),
      });
    }
    const galaxy = galaxyValue === null ? NaN : Number(galaxyValue);
    if (!portal || decodePortalAddress(portal)?.errors.length !== 0 ||
      !Number.isInteger(galaxy) || galaxy < 0 || galaxy > 255) {
      return NextResponse.json({ error: "Pianeta non valido." }, { status: 400 });
    }
    if (!hasRole(member, "moderator") && !missions.some((mission) =>
      mission.systemAddress.toUpperCase() === portal.toUpperCase() &&
      mission.galaxy === galaxy &&
      canViewMission(mission, member),
    )) {
      return NextResponse.json({ error: "Non puoi visualizzare lo stato di questo pianeta." }, { status: 403 });
    }
    return NextResponse.json({ systemStatuses: await readPlanetSystemStatus(portal, galaxy) });
  } catch (error) {
    console.error("Unable to read planet system status", error);
    return NextResponse.json({ error: "Impossibile leggere lo stato del pianeta." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });

  const input: unknown = await request.json().catch(() => null);
  if (!isPlanetStatusUpdate(input)) {
    return NextResponse.json({ error: "Dati dello stato pianeta non validi." }, { status: 400 });
  }
  try {
    if (!hasRole(member, "moderator")) {
      const missions = await readMissions();
      const assignedToMember = missions.some((mission) =>
        mission.assignedMemberId === member.publicId &&
        mission.systemAddress.toUpperCase() === input.portal.toUpperCase() &&
        mission.galaxy === input.galaxy,
      );
      if (!assignedToMember) {
        return NextResponse.json({ error: "Puoi aggiornare lo stato solo di un pianeta con una missione assegnata a te." }, { status: 403 });
      }
    }
    const systemStatuses = await writePlanetSystemStatus(input.portal, input.galaxy, input.systemStatuses);
    return NextResponse.json({ portal: input.portal.toUpperCase(), galaxy: input.galaxy, systemStatuses });
  } catch (error) {
    console.error("Unable to save planet system status", error);
    return NextResponse.json({ error: "Impossibile salvare lo stato del pianeta." }, { status: 503 });
  }
}

function isPlanetStatusUpdate(value: unknown): value is {
  portal: string;
  galaxy: number;
  systemStatuses: MissionSystemStatus[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const update = value as Record<string, unknown>;
  return typeof update.portal === "string" &&
    decodePortalAddress(update.portal)?.errors.length === 0 &&
    typeof update.galaxy === "number" && Number.isInteger(update.galaxy) &&
    update.galaxy >= 0 && update.galaxy <= 255 &&
    Array.isArray(update.systemStatuses) &&
    update.systemStatuses.length <= missionSystemStatuses.length &&
    update.systemStatuses.every(isMissionSystemStatus) &&
    new Set(update.systemStatuses).size === update.systemStatuses.length &&
    Object.keys(update).every((key) => ["portal", "galaxy", "systemStatuses"].includes(key));
}
