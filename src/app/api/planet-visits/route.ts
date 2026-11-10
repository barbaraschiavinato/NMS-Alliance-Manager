import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth/authorization";
import { decodePortalAddress } from "@/lib/missions/missions";
import { readMissions } from "@/lib/missions/store";
import { readAllStationPortals } from "@/lib/stations/stations-store";
import { canMarkPlanetVisited, planetVisitKey } from "@/lib/planets/planet-visits";
import { setPlanetVisit } from "@/lib/planets/planet-visits-store";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { apiError, badRequest, forbidden, unauthorized } from "@/lib/utils/api-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRequestMemo(async function PATCH(request: Request) {
  const member = await getCurrentMember();
  if (!member) return unauthorized();

  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object") return badRequest("errors.invalid_data");
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
    return badRequest("errors.invalid_data");

  try {
    const [missions, stations] = await Promise.all([readMissions(), readAllStationPortals()]);
    if (!canMarkPlanetVisited(member, missions, stations, planetPortal, galaxy))
      return forbidden("errors.you_can_only_mark_planets_of_your_stations_or_missions_as_visited");
    await setPlanetVisit(member.publicId, planetVisitKey(planetPortal, galaxy), visited);
    return NextResponse.json({ planetPortal: planetPortal.toUpperCase(), galaxy, visited });
  } catch (error) {
    console.error("Unable to save planet visit", error instanceof Error ? error.message : "Unknown error");
    return apiError("errors.unable_to_save_the_planet_visit", 503);
  }
});
