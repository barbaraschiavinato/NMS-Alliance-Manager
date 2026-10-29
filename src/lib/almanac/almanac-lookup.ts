import {
  readAlmanacCache,
  readAlmanacResponse,
  writeAlmanacResponse,
  writeAlmanacResponses,
} from "@/lib/almanac/almanac-store";
import { normalizeAlmanacPlanet } from "@/lib/almanac/almanac-normalize";
import { almanacRetryAfterSeconds, noteAlmanacRateLimit } from "@/lib/almanac/almanac-rate-limit";

async function fetchAlmanacPlanet(address: string, galaxy: number): Promise<Record<string, unknown> | null> {
  if (almanacRetryAfterSeconds() > 0) throw new Error("planet.almanac_lookup_failed");
  const response = await fetch(`https://nmsalmanac.com/api/planets/${address}?galaxy=${galaxy + 1}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (response.status === 429) {
    noteAlmanacRateLimit(response);
    throw new Error("planet.almanac_lookup_failed");
  }
  if (!response.ok) {
    console.error("NMS Almanac returned an error for planet lookup", { address, galaxy, status: response.status });
    throw new Error("planet.almanac_lookup_failed");
  }

  const planet: unknown = await response.json();
  if (
    !planet ||
    typeof planet !== "object" ||
    Array.isArray(planet) ||
    !("portal" in planet) ||
    typeof planet.portal !== "string" ||
    (planet.portal.toUpperCase() !== address &&
      !(address.startsWith("0") && planet.portal.toUpperCase() === `1${address.slice(1)}`))
  ) {
    console.error("NMS Almanac returned invalid planet data", { address, galaxy });
    throw new Error("planet.almanac_lookup_failed");
  }
  return normalizeAlmanacPlanet(planet as Record<string, unknown>);
}

export async function lookupAlmanacPlanet(portal: string, galaxy: number): Promise<Record<string, unknown> | null> {
  const address = portal.toUpperCase();
  const cachedPlanet = await readAlmanacResponse(address, galaxy);
  if (cachedPlanet) return cachedPlanet;
  if (address.startsWith("0")) {
    const cachedPlanetOne = await readAlmanacResponse(`1${address.slice(1)}`, galaxy);
    if (cachedPlanetOne) {
      await writeAlmanacResponse(address, galaxy, cachedPlanetOne);
      return cachedPlanetOne;
    }
  }

  const result = await fetchAlmanacPlanet(address, galaxy);
  if (result) await writeAlmanacResponse(address, galaxy, result);
  return result;
}

export type AlmanacLookupResult = Readonly<{ planet: Record<string, unknown> | null; failed: boolean }>;

// Legge la cache una sola volta, scarica solo i pianeti mancanti e salva tutto con un'unica scrittura.
export async function lookupAlmanacPlanets(
  targets: ReadonlyArray<Readonly<{ portal: string; galaxy: number }>>,
): Promise<Map<string, AlmanacLookupResult>> {
  let getCached: Awaited<ReturnType<typeof readAlmanacCache>>;
  try {
    getCached = await readAlmanacCache();
  } catch (error) {
    console.error("Unable to read NMS Almanac cache", error);
    return new Map(
      targets.map(({ portal, galaxy }) => [`${portal.toUpperCase()}:${galaxy}`, { planet: null, failed: true }]),
    );
  }
  const results = new Map<string, AlmanacLookupResult>();
  const missing: { address: string; galaxy: number; key: string }[] = [];
  for (const { portal, galaxy } of targets) {
    const address = portal.toUpperCase();
    const key = `${address}:${galaxy}`;
    const cached = getCached(address, galaxy);
    if (cached && !(cached.kind === "planet" && cached.lines === undefined))
      results.set(key, { planet: cached, failed: false });
    else if (!results.has(key) && !missing.some((item) => item.key === key)) missing.push({ address, galaxy, key });
  }

  const fetched: { portalCode: string; galaxy: number; response: Record<string, unknown> }[] = [];
  for (let index = 0; index < missing.length; index += 6) {
    await Promise.all(
      missing.slice(index, index + 6).map(async ({ address, galaxy, key }) => {
        try {
          const cached = getCached(address, galaxy);
          const planet = cached ? await normalizeAlmanacPlanet(cached) : await fetchAlmanacPlanet(address, galaxy);
          results.set(key, { planet, failed: false });
          if (planet) fetched.push({ portalCode: address, galaxy, response: planet });
        } catch (error) {
          // While rate limited, the single warning from noteAlmanacRateLimit is enough.
          if (almanacRetryAfterSeconds() === 0)
            console.error("Unable to load NMS Almanac planet", { address, galaxy }, error);
          results.set(key, { planet: null, failed: true });
        }
      }),
    );
  }
  try {
    await writeAlmanacResponses(fetched);
  } catch (error) {
    console.error("Unable to save NMS Almanac planets", error);
  }
  return results;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function almanacSystemLabel(response: Record<string, unknown>): string | null {
  const lines = isRecord(response.lines) ? response.lines : null;
  const band = lines && isRecord(lines.band) ? lines.band : null;
  const words = ["star", "economy", "conflict", "race"].flatMap((key) => {
    const attribute = band && isRecord(band[key]) ? band[key] : null;
    return attribute && typeof attribute.word === "string" && attribute.word.trim() ? [attribute.word.trim()] : [];
  });
  return words.length > 0 ? words.join(" · ") : null;
}
