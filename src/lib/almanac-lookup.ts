import { readAlmanacResponse, writeAlmanacResponse } from "@/lib/almanac-store";

export async function lookupAlmanacPlanet(portal: string, galaxy: number): Promise<Record<string, unknown> | null> {
  const address = portal.toUpperCase();
  const cachedPlanet = await readAlmanacResponse(address, galaxy);
  if (cachedPlanet) return cachedPlanet;

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
  const result = planet as Record<string, unknown>;
  await writeAlmanacResponse(address, galaxy, result);
  return result;
}
