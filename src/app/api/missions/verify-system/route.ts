import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth/authorization";
import { readAlmanacCache, readAlmanacResponse, writeAlmanacResponse } from "@/lib/almanac/almanac-store";
import { decodePortalAddress } from "@/lib/missions/missions";
import { normalizeAlmanacPlanet } from "@/lib/almanac/almanac-normalize";
import { almanacRetryAfterSeconds, noteAlmanacRateLimit } from "@/lib/almanac/almanac-rate-limit";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { almanacPlanetUrl } from "@/lib/almanac/almanac-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRequestMemo(async function GET(request: Request) {
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

  const planetOneAddress = address.startsWith("0") ? `1${address.slice(1)}` : null;

  try {
    const lookupMode = params.get("lookup");
    const farmLookup = lookupMode === "farm-create";
    const cacheOnly = lookupMode === "cache-only";
    const getCached = farmLookup || cacheOnly ? await readAlmanacCache() : undefined;
    const cachedResponse = getCached ? getCached(address, galaxy) : await readAlmanacResponse(address, galaxy);
    if (cachedResponse) {
      return NextResponse.json(
        {
          found: true,
          systemLabel: almanacSystemLabel(cachedResponse),
          planetType: almanacPlanetType(cachedResponse),
          planetName: almanacPlanetName(cachedResponse),
          cached: true,
        },
        {
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const cachedPlanetOne = planetOneAddress
      ? getCached
        ? getCached(planetOneAddress, galaxy)
        : await readAlmanacResponse(planetOneAddress, galaxy)
      : null;
    if (cachedPlanetOne) {
      await writeAlmanacResponse(address, galaxy, cachedPlanetOne, Boolean(getCached));
      return NextResponse.json(
        {
          found: true,
          systemLabel: almanacSystemLabel(cachedPlanetOne),
          planetType: almanacPlanetType(cachedPlanetOne),
          planetName: almanacPlanetName(cachedPlanetOne),
          cached: true,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (cacheOnly)
      return NextResponse.json({ found: false, cacheOnly: true }, { headers: { "Cache-Control": "no-store" } });

    if (almanacRetryAfterSeconds() > 0) {
      return NextResponse.json(
        { error: "NMS Almanac non disponibile." },
        { status: 429, headers: { "Cache-Control": "no-store" } },
      );
    }

    for (const lookupAddress of planetOneAddress ? [address, planetOneAddress] : [address]) {
      const response = await fetch(almanacPlanetUrl(lookupAddress, galaxy + 1), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      if (response.status === 404) continue;
      if (response.status === 429) {
        noteAlmanacRateLimit(response);
        const headers = new Headers({ "Cache-Control": "no-store" });
        const retryAfter = response.headers.get("Retry-After");
        if (retryAfter) headers.set("Retry-After", retryAfter);
        return NextResponse.json({ error: "NMS Almanac non disponibile." }, { status: 429, headers });
      }
      if (!response.ok) {
        const headers = new Headers({ "Cache-Control": "no-store" });
        const retryAfter = response.headers.get("Retry-After");
        if (retryAfter) headers.set("Retry-After", retryAfter);
        return NextResponse.json({ error: "NMS Almanac non disponibile." }, { status: 502, headers });
      }

      const result: unknown = await response.json();
      if (!isRecord(result) || typeof result.portal !== "string")
        throw new Error("NMS Almanac returned an unexpected response");
      const responsePortal = result.portal.toUpperCase();
      if (responsePortal !== lookupAddress && !(lookupAddress === address && responsePortal === planetOneAddress))
        throw new Error("NMS Almanac returned an unexpected response");

      const normalized = await normalizeAlmanacPlanet(result);
      if (responsePortal !== address) await writeAlmanacResponse(responsePortal, galaxy, normalized);
      if (lookupAddress !== address) await writeAlmanacResponse(lookupAddress, galaxy, normalized);
      await writeAlmanacResponse(address, galaxy, normalized);

      return NextResponse.json(
        {
          found: true,
          systemLabel: almanacSystemLabel(normalized),
          planetType: almanacPlanetType(normalized),
          planetName: almanacPlanetName(normalized),
          cached: false,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json({ found: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to verify portal address in NMS Almanac", error);
    return NextResponse.json({ error: "NMS Almanac non disponibile." }, { status: 502 });
  }
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function almanacSystemLabel(response: Record<string, unknown>) {
  const lines = isRecord(response.lines) ? response.lines : null;
  const band = lines && isRecord(lines.band) ? lines.band : null;
  const attributes = ["star", "economy", "conflict", "race"];
  const words = attributes.flatMap((key) => {
    const attribute = band && isRecord(band[key]) ? band[key] : null;
    return attribute && typeof attribute.word === "string" && attribute.word.trim() ? [attribute.word.trim()] : [];
  });
  return words.length > 0 ? words.join(" · ") : null;
}

// In-game planet name only, without the biome fallback of almanacPlanetType.
function almanacPlanetName(response: Record<string, unknown>) {
  const lines = isRecord(response.lines) ? response.lines : null;
  const headline = lines && isRecord(lines.headline) ? lines.headline : null;
  return headline && typeof headline.word === "string" && headline.word.trim() ? headline.word.trim() : null;
}

function almanacPlanetType(response: Record<string, unknown>) {
  const lines = isRecord(response.lines) ? response.lines : null;
  const headline = lines && isRecord(lines.headline) ? lines.headline : null;
  if (headline && typeof headline.word === "string" && headline.word.trim()) return headline.word.trim();
  const band = lines && isRecord(lines.band) ? lines.band : null;
  const type = band && isRecord(band.type) ? band.type : null;
  return type && typeof type.word === "string" && type.word.trim() ? type.word.trim() : null;
}
