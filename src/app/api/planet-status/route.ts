import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { canViewMission, decodePortalAddress } from "@/lib/missions/missions";
import {
  isMissionSystemStatus,
  missionSystemStatusRoles,
  missionSystemStatuses,
  type MissionSystemStatus,
  type SystemStatusAuthors,
} from "@/lib/planets/planet-system-status";
import {
  readPlanetSystemStatus,
  readPlanetSystemStatusAuthor,
  readPlanetSystemStatusAuthors,
  readPlanetSystemStatuses,
  writePlanetSystemStatus,
  writePlanetSystemStatusAuthor,
} from "@/lib/planets/planet-system-status-store";
import { readMissions } from "@/lib/missions/store";
import { readAllStationPortals, readStationPortals } from "@/lib/stations/stations-store";

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
      const [missions, statuses, authors] = await Promise.all([
        readMissions(),
        readPlanetSystemStatuses(),
        readPlanetSystemStatusAuthors(),
      ]);
      const visibleKeys = new Set(
        missions
          .filter((mission) => canViewMission(mission, member))
          .map((mission) => `${mission.galaxy}:${mission.systemAddress.toUpperCase()}`),
      );
      for (const station of await readStationPortals(member.publicId)) {
        visibleKeys.add(`${station.galaxy}:${station.portal.toUpperCase()}`);
      }
      const isVisible = (key: string) => hasRole(member, "moderator") || visibleKeys.has(key);
      return NextResponse.json({
        planets: Object.fromEntries(Object.entries(statuses).filter(([key]) => isVisible(key))),
        authors: Object.fromEntries(Object.entries(authors).filter(([key]) => isVisible(key))),
      });
    }
    const galaxy = galaxyValue === null ? NaN : Number(galaxyValue);
    if (
      !portal ||
      decodePortalAddress(portal)?.errors.length !== 0 ||
      !Number.isInteger(galaxy) ||
      galaxy < 0 ||
      galaxy > 255
    ) {
      return NextResponse.json({ error: "Pianeta non valido." }, { status: 400 });
    }
    const canViewAllStations = member.specialty === "explorer" || member.specialty === "builder";
    const hasVisibleStation = canViewAllStations
      ? (await readAllStationPortals()).some(
          (station) => station.portal === portal.toUpperCase() && station.galaxy === galaxy,
        )
      : !hasRole(member, "moderator") &&
        (await readStationPortals(member.publicId)).some(
          (station) => station.portal === portal.toUpperCase() && station.galaxy === galaxy,
        );
    if (
      !hasRole(member, "moderator") &&
      !hasVisibleStation &&
      !missions.some(
        (mission) =>
          mission.systemAddress.toUpperCase() === portal.toUpperCase() &&
          mission.galaxy === galaxy &&
          canViewMission(mission, member),
      )
    ) {
      return NextResponse.json({ error: "Non puoi visualizzare lo stato di questo pianeta." }, { status: 403 });
    }
    const [systemStatuses, systemStatusAuthors] = await Promise.all([
      readPlanetSystemStatus(portal, galaxy),
      readPlanetSystemStatusAuthor(portal, galaxy),
    ]);
    return NextResponse.json({ systemStatuses, systemStatusAuthors });
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
    let ownsStationForRanger = false;
    if (!hasRole(member, "moderator")) {
      const missions = await readMissions();
      const assignedToMember = missions.some(
        (mission) =>
          mission.assignedMemberId === member.publicId &&
          mission.systemAddress.toUpperCase() === input.portal.toUpperCase() &&
          mission.galaxy === input.galaxy,
      );
      const ownsStation = (await readStationPortals(member.publicId)).some(
        (station) => station.portal === input.portal.toUpperCase() && station.galaxy === input.galaxy,
      );
      ownsStationForRanger = ownsStation;
      if (!assignedToMember && !ownsStation) {
        return NextResponse.json(
          { error: "Puoi aggiornare lo stato solo di un pianeta con una missione assegnata a te." },
          { status: 403 },
        );
      }
    }
    const [current, currentAuthors] = await Promise.all([
      readPlanetSystemStatus(input.portal, input.galaxy),
      readPlanetSystemStatusAuthor(input.portal, input.galaxy),
    ]);
    const added = input.systemStatuses.filter((status) => !current.includes(status));
    const changed = [...added, ...current.filter((status) => !input.systemStatuses.includes(status))];
    if (!hasRole(member, "moderator")) {
      if (
        changed.some(
          (status) =>
            missionSystemStatusRoles[status] !== member.specialty &&
            !(ownsStationForRanger && missionSystemStatusRoles[status] === "ranger"),
        )
      ) {
        return NextResponse.json({ error: "Puoi aggiornare solo gli stati del tuo gruppo." }, { status: 403 });
      }
      // The discoverer and the assigned Ranger share the Ranger tasks: whoever checks one first owns it.
      if (
        changed.some((status) => {
          const author = currentAuthors[status];
          return author && current.includes(status) && author.memberId !== member.publicId;
        })
      ) {
        return NextResponse.json(
          { error: "Questo task è già stato preso in carico da un altro membro." },
          { status: 403 },
        );
      }
    }
    const systemStatuses = await writePlanetSystemStatus(input.portal, input.galaxy, input.systemStatuses);
    const nextAuthors: SystemStatusAuthors = {};
    for (const status of systemStatuses) {
      const author = currentAuthors[status];
      if (author && !added.includes(status)) nextAuthors[status] = author;
    }
    // Moderators and admins with full permissions never become authors: credit follows the default rule.
    if (!hasRole(member, "moderator")) {
      for (const status of added) {
        if (missionSystemStatusRoles[status] !== "ranger") continue;
        nextAuthors[status] = { memberId: member.publicId, as: ownsStationForRanger ? "discoverer" : "ranger" };
      }
    }
    const authorsChanged =
      JSON.stringify(Object.entries(nextAuthors).sort()) !== JSON.stringify(Object.entries(currentAuthors).sort());
    const systemStatusAuthors = authorsChanged
      ? await writePlanetSystemStatusAuthor(input.portal, input.galaxy, nextAuthors)
      : currentAuthors;
    return NextResponse.json({
      portal: input.portal.toUpperCase(),
      galaxy: input.galaxy,
      systemStatuses,
      systemStatusAuthors,
    });
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
  return (
    typeof update.portal === "string" &&
    decodePortalAddress(update.portal)?.errors.length === 0 &&
    typeof update.galaxy === "number" &&
    Number.isInteger(update.galaxy) &&
    update.galaxy >= 0 &&
    update.galaxy <= 255 &&
    Array.isArray(update.systemStatuses) &&
    update.systemStatuses.length <= missionSystemStatuses.length &&
    update.systemStatuses.every(isMissionSystemStatus) &&
    new Set(update.systemStatuses).size === update.systemStatuses.length &&
    Object.keys(update).every((key) => ["portal", "galaxy", "systemStatuses"].includes(key))
  );
}
