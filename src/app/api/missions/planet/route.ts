import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/authorization";
import { readAlmanacResponse } from "@/lib/almanac-store";
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
    const planet = await readAlmanacResponse(address, galaxy);
    if (!planet) return NextResponse.json({ error: "Scheda Almanac non archiviata." }, { status: 404 });
    return NextResponse.json({ planet }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to read archived Almanac planet", error);
    return NextResponse.json({ error: "Impossibile leggere la scheda del pianeta." }, { status: 503 });
  }
}