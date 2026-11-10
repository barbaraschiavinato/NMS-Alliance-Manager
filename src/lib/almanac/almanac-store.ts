import { readJsonDocument, writeJsonDocument } from "@/lib/storage/json-document";
import { memoizedRead } from "@/lib/storage/request-memo";
import { normalizeAlmanacPictures, normalizeAlmanacPlanet } from "@/lib/almanac/almanac-normalize";

type AlmanacResponse = Record<string, unknown>;
type AlmanacResponseIndex = Record<string, Record<string, AlmanacResponse>>;
export type CachedAlmanacPlanet = Readonly<{ galaxy: number; response: AlmanacResponse }>;

const almanacDocument = "almanac";

function normalizeAlmanacIndex(value: unknown): AlmanacResponseIndex {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const index: AlmanacResponseIndex = {};
  for (const [portalCode, galaxies] of Object.entries(value)) {
    if (!/^[0-9A-F]{12}$/i.test(portalCode) || !galaxies || typeof galaxies !== "object" || Array.isArray(galaxies))
      continue;
    const galaxyResponses: Record<string, AlmanacResponse> = {};
    for (const [galaxy, response] of Object.entries(galaxies)) {
      if (!/^\d+$/.test(galaxy) || !response || typeof response !== "object" || Array.isArray(response)) continue;
      galaxyResponses[galaxy] = response as AlmanacResponse;
    }
    if (Object.keys(galaxyResponses).length > 0) index[portalCode.toUpperCase()] = galaxyResponses;
  }
  return index;
}

// Plain reads share one copy per request; the serialized read-modify-write cycles below read the store directly, so a
// write never starts from a copy older than the one it replaces.
function readAlmanacIndex(): Promise<AlmanacResponseIndex> {
  return memoizedRead("almanac", readAlmanacIndexFromStore);
}

async function readAlmanacIndexFromStore(): Promise<AlmanacResponseIndex> {
  // The cache can be rebuilt, so an unreadable local file must not break every lookup (a copy is kept for inspection).
  return normalizeAlmanacIndex(await readJsonDocument(almanacDocument, { quarantineCorruptLocalFile: true }));
}

function writeAlmanacIndex(index: AlmanacResponseIndex): Promise<void> {
  return writeJsonDocument(almanacDocument, index);
}

// Read-modify-write cycles on the cache run one at a time, otherwise concurrent requests overwrite each other's entries.
let writeQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task);
  writeQueue = result.catch(() => undefined);
  return result;
}

export async function readAlmanacResponse(
  portalCode: string,
  galaxy: number,
  cacheOnly = false,
): Promise<AlmanacResponse | null> {
  const index = await readAlmanacIndex();
  const response = index[portalCode.toUpperCase()]?.[String(galaxy)];
  if (!response) return null;
  if (cacheOnly) return normalizeAlmanacPictures(response);
  const normalized = await normalizeAlmanacPlanet(response);
  if (normalized !== response) await writeAlmanacResponse(portalCode, galaxy, normalized);
  return normalized;
}

export async function readAlmanacResponses(
  portalCodes: string[],
  cacheOnly = false,
): Promise<Record<string, CachedAlmanacPlanet[]>> {
  const index = await readAlmanacIndex();
  const results: Record<string, CachedAlmanacPlanet[]> = Object.fromEntries(
    await Promise.all(
      portalCodes.map(async (portalCode) => {
        const responses = Object.entries(index[portalCode.toUpperCase()] ?? {})
          .flatMap(([galaxy, response]) => {
            const galaxyIndex = Number(galaxy);
            return Number.isInteger(galaxyIndex) && galaxyIndex >= 0 && galaxyIndex <= 255
              ? [{ galaxy: galaxyIndex, response }]
              : [];
          })
          .sort((left, right) => left.galaxy - right.galaxy);
        return [
          portalCode.toUpperCase(),
          (
            await Promise.all(
              responses.map(async (entry) => {
                try {
                  return {
                    ...entry,
                    response: cacheOnly
                      ? normalizeAlmanacPictures(entry.response)
                      : await normalizeAlmanacPlanet(entry.response),
                  };
                } catch (error) {
                  console.error(
                    "Unable to normalize cached NMS Almanac planet",
                    { portalCode, galaxy: entry.galaxy },
                    error,
                  );
                  return null;
                }
              }),
            )
          ).filter((entry) => entry !== null),
        ];
      }),
    ),
  );
  try {
    if (!cacheOnly)
      await writeAlmanacResponses(
        Object.entries(results).flatMap(([portalCode, entries]) =>
          entries
            .filter((entry) => entry.response !== index[portalCode]?.[String(entry.galaxy)])
            .map((entry) => ({ portalCode, galaxy: entry.galaxy, response: entry.response })),
        ),
      );
  } catch (error) {
    console.error("Unable to save migrated NMS Almanac planets", error);
  }
  return results;
}

export async function writeAlmanacResponse(
  portalCode: string,
  galaxy: number,
  response: AlmanacResponse,
  cacheOnly = false,
): Promise<void> {
  const normalized = cacheOnly ? normalizeAlmanacPictures(response) : await normalizeAlmanacPlanet(response);
  await serialized(async () => {
    const index = await readAlmanacIndexFromStore();
    const canonicalCode = portalCode.toUpperCase();
    index[canonicalCode] ??= {};
    index[canonicalCode][String(galaxy)] = normalized;
    await writeAlmanacIndex(index);
  });
}
export async function readAlmanacCache(): Promise<(portalCode: string, galaxy: number) => AlmanacResponse | null> {
  const index = await readAlmanacIndex();
  for (const galaxies of Object.values(index)) {
    for (const [galaxy, response] of Object.entries(galaxies)) {
      galaxies[galaxy] = normalizeAlmanacPictures(response);
    }
  }
  return (portalCode, galaxy) => index[portalCode.toUpperCase()]?.[String(galaxy)] ?? null;
}

export async function writeAlmanacResponses(
  entries: ReadonlyArray<Readonly<{ portalCode: string; galaxy: number; response: AlmanacResponse }>>,
): Promise<void> {
  if (entries.length === 0) return;
  const normalizedEntries = await Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      response: await normalizeAlmanacPlanet(entry.response),
    })),
  );
  await serialized(async () => {
    const index = await readAlmanacIndexFromStore();
    for (const { portalCode, galaxy, response } of normalizedEntries) {
      const canonicalCode = portalCode.toUpperCase();
      index[canonicalCode] ??= {};
      index[canonicalCode][String(galaxy)] = response;
    }
    await writeAlmanacIndex(index);
  });
}
