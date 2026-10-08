import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/authorization";
import { readAlmanacResponse, writeAlmanacResponse } from "@/lib/almanac-store";
import { decodePortalAddress } from "@/lib/missions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const address = (params.get("address") ?? "").toUpperCase();
  const galaxyValue = params.get("galaxy");
  const galaxy = Number(galaxyValue);
  const decoded = decodePortalAddress(address);
  if (
    decoded?.kind !== "portal" ||
    decoded.errors.length > 0 ||
    !galaxyValue ||
    !/^\d+$/.test(galaxyValue) ||
    !Number.isInteger(galaxy) ||
    galaxy < 0 ||
    galaxy > 255
  ) {
    return NextResponse.json({ error: "Indirizzo portale o galassia non validi." }, { status: 400 });
  }

  try {
    const cachedPlanet = await readAlmanacResponse(address, galaxy);
    if (cachedPlanet) {
      return NextResponse.json({ planet: cachedPlanet }, { headers: { "Cache-Control": "no-store" } });
    }

    const response = await fetch(`https://nmsalmanac.com/api/planets/${address}?galaxy=${galaxy + 1}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (response.status === 404) {
      return NextResponse.json({ error: "planet.no_almanac_details_are_archived_for_this_mission" }, { status: 404 });
    }
    if (!response.ok) {
      console.error("NMS Almanac returned an error for planet lookup", { address, galaxy, status: response.status });
      return NextResponse.json({ error: "planet.almanac_lookup_failed" }, { status: 502 });
    }

    const planet: unknown = await response.json();
    if (!planet || typeof planet !== "object" || Array.isArray(planet) ||
      !("portal" in planet) || typeof planet.portal !== "string" || planet.portal.toUpperCase() !== address) {
      console.error("NMS Almanac returned invalid planet data", { address, galaxy });
      return NextResponse.json({ error: "planet.almanac_lookup_failed" }, { status: 502 });
    }
    await writeAlmanacResponse(address, galaxy, planet as Record<string, unknown>);
    return NextResponse.json({ planet }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to read archived Almanac planet", error);
    return NextResponse.json({ error: "planet.almanac_lookup_failed" }, { status: 503 });
  }
}