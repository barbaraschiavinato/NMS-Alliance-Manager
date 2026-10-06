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

  const url = new URL(`https://nmsalmanac.com/api/planets/${address}`);
  url.searchParams.set("galaxy", String(galaxy + 1));

  try {
    const cachedResponse = await readAlmanacResponse(address, galaxy);
    if (cachedResponse) {
      return NextResponse.json({ found: true, systemLabel: almanacSystemLabel(cachedResponse), planetType: almanacPlanetType(cachedResponse), cached: true }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (response.status === 404) {
      return NextResponse.json({ found: false }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!response.ok) {
      const headers = new Headers({ "Cache-Control": "no-store" });
      const retryAfter = response.headers.get("Retry-After");
      if (retryAfter) headers.set("Retry-After", retryAfter);
      return NextResponse.json({ error: "NMS Almanac non disponibile." }, {
        status: response.status === 429 ? 429 : 502,
        headers,
      });
    }

    const result: unknown = await response.json();
    const found = isRecord(result) && typeof result.portal === "string" && result.portal.toUpperCase() === address;
    if (!found) throw new Error("NMS Almanac returned an unexpected response");

    await writeAlmanacResponse(address, galaxy, result);

    return NextResponse.json({ found: true, systemLabel: almanacSystemLabel(result), planetType: almanacPlanetType(result), cached: false }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Unable to verify portal address in NMS Almanac", error);
    return NextResponse.json({ error: "NMS Almanac non disponibile." }, { status: 502 });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function almanacSystemLabel(response: Record<string, unknown>) {
  const lines = isRecord(response.lines) ? response.lines : null;
  const band = lines && isRecord(lines.band) ? lines.band : null;
  const attributes = ["star", "economy", "conflict", "race"];
  const words = attributes.flatMap((key) => {
    const attribute = band && isRecord(band[key]) ? band[key] : null;
    return attribute && typeof attribute.word === "string" && attribute.word.trim()
      ? [attribute.word.trim()]
      : [];
  });
  return words.length > 0 ? words.join(" · ") : null;
}

function almanacPlanetType(response: Record<string, unknown>) {
  const lines = isRecord(response.lines) ? response.lines : null;
  const headline = lines && isRecord(lines.headline) ? lines.headline : null;
  if (headline && typeof headline.word === "string" && headline.word.trim()) return headline.word.trim();
  const band = lines && isRecord(lines.band) ? lines.band : null;
  const type = band && isRecord(band.type) ? band.type : null;
  return type && typeof type.word === "string" && type.word.trim() ? type.word.trim() : null;
}