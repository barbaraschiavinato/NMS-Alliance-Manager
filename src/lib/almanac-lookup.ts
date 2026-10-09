import { readAlmanacCache, readAlmanacResponse, writeAlmanacResponse, writeAlmanacResponses } from "@/lib/almanac-store";

async function fetchAlmanacPlanet(address: string, galaxy: number): Promise<Record<string, unknown> | null> {
  const response = await fetch(`https://nmsalmanac.com/api/planets/${address}?galaxy=${galaxy + 1}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    console.error("NMS Almanac returned an error for planet lookup", { address, galaxy, status: response.status });
    throw new Error("planet.almanac_lookup_failed");
  }

  const planet: unknown = await response.json();
  if (!planet || typeof planet !== "object" || Array.isArray(planet) ||
    !("portal" in planet) || typeof planet.portal !== "string" || planet.portal.toUpperCase() !== address) {
    console.error("NMS Almanac returned invalid planet data", { address, galaxy });
    throw new Error("planet.almanac_lookup_failed");
  }
  return planet as Record<string, unknown>;
}

export async function lookupAlmanacPlanet(portal: string, galaxy: number): Promise<Record<string, unknown> | null> {
  const address = portal.toUpperCase();
  const cachedPlanet = await readAlmanacResponse(address, galaxy);
  if (cachedPlanet) return cachedPlanet;

  const result = await fetchAlmanacPlanet(address, galaxy);
  if (result) await writeAlmanacResponse(address, galaxy, result);
  return result;
}

export type AlmanacLookupResult = Readonly<{ planet: Record<string, unknown> | null; failed: boolean }>;

// Legge la cache una sola volta, scarica solo i pianeti mancanti e salva tutto con un'unica scrittura.
export async function lookupAlmanacPlanets(
  targets: ReadonlyArray<Readonly<{ portal: string; galaxy: number }>>,
): Promise<Map<string, AlmanacLookupResult>> {
  const getCached = await readAlmanacCache();
  const results = new Map<string, AlmanacLookupResult>();
  const missing: { address: string; galaxy: number; key: string }[] = [];
  for (const { portal, galaxy } of targets) {
    const address = portal.toUpperCase();
    const key = `${address}:${galaxy}`;
    const cached = getCached(address, galaxy);
    if (cached) results.set(key, { planet: cached, failed: false });
    else if (!results.has(key) && !missing.some((item) => item.key === key)) missing.push({ address, galaxy, key });
  }

  const fetched: { portalCode: string; galaxy: number; response: Record<string, unknown> }[] = [];
  for (let index = 0; index < missing.length; index += 6) {
    await Promise.all(missing.slice(index, index + 6).map(async ({ address, galaxy, key }) => {
      try {
        const planet = await fetchAlmanacPlanet(address, galaxy);
        results.set(key, { planet, failed: false });
        if (planet) fetched.push({ portalCode: address, galaxy, response: planet });
      } catch {
        results.set(key, { planet: null, failed: true });
      }
    }));
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
