import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth/authorization";
import { decodePortalAddress } from "@/lib/missions/missions";
import { readMissions } from "@/lib/missions/store";
import { readAllStationPortals } from "@/lib/stations/stations-store";
import { canMarkPlanetVisited, planetVisitKey } from "@/lib/planets/planet-visits";
import { setPlanetVisit } from "@/lib/planets/planet-visits-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });

  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object") return NextResponse.json({ error: "Dati non validi." }, { status: 400 });
  const { planetPortal, galaxy, visited } = input as Record<string, unknown>;
  if (
    typeof planetPortal !== "string" ||
    decodePortalAddress(planetPortal)?.errors.length !== 0 ||
    typeof galaxy !== "number" ||
    !Number.isInteger(galaxy) ||
    galaxy < 0 ||
    galaxy > 255 ||
    typeof visited !== "boolean"
  )
    return NextResponse.json({ error: "Dati non validi." }, { status: 400 });

  try {
    const [missions, stations] = await Promise.all([readMissions(), readAllStationPortals()]);
    if (!canMarkPlanetVisited(member, missions, stations, planetPortal, galaxy))
      return NextResponse.json(
        { error: "Puoi segnare come visitati solo i pianeti di una tua stazione o di una missione assegnata a te." },
        { status: 403 },
      );
    await setPlanetVisit(member.publicId, planetVisitKey(planetPortal, galaxy), visited);
    return NextResponse.json({ planetPortal: planetPortal.toUpperCase(), galaxy, visited });
  } catch (error) {
    console.error("Unable to save planet visit", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Impossibile salvare la visita del pianeta." }, { status: 503 });
  }
}
