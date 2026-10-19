import { get, put } from "@vercel/blob";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { localDataPath } from "@/lib/local-data-path";
import { getBlobAuthOptions } from "@/lib/blob-config";
import { normalizeAlmanacPlanet } from "@/lib/almanac-normalize";

type AlmanacResponse = Record<string, unknown>;
type AlmanacResponseIndex = Record<string, Record<string, AlmanacResponse>>;
export type CachedAlmanacPlanet = Readonly<{ galaxy: number; response: AlmanacResponse }>;

const blobPath = "alliance-manager/almanac.json";
const localPath = localDataPath("almanac.json");

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

async function readAlmanacIndex(): Promise<AlmanacResponseIndex> {
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    const blob = await get(blobPath, { access: "private", useCache: false, ...blobAuthOptions });
    if (!blob || blob.statusCode === 304) return {};
    return normalizeAlmanacIndex(JSON.parse(await new Response(blob.stream).text()));
  }

  try {
    return normalizeAlmanacIndex(JSON.parse(await readFile(localPath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    if (error instanceof SyntaxError) {
      // The cache can be rebuilt, so an unreadable file must not break every lookup. Keep a copy for inspection.
      console.error("Unreadable Almanac cache, starting from an empty one", error);
      await rename(localPath, `${localPath}.corrupt-${Date.now()}`).catch(() => undefined);
      return {};
    }
    throw error;
  }
}

async function writeAlmanacIndex(index: AlmanacResponseIndex): Promise<void> {
  const json = `${JSON.stringify(index, null, 2)}\n`;
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    await put(blobPath, json, {
      access: "private",
      ...blobAuthOptions,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }

  await mkdir(path.dirname(localPath), { recursive: true });
  // Write a temporary file and rename it, so a reader never sees a half-written cache.
  const temporaryPath = `${localPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, json, "utf8");
  await rename(temporaryPath, localPath);
}

// Read-modify-write cycles on the cache run one at a time, otherwise concurrent requests overwrite each other's entries.
let writeQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task);
  writeQueue = result.catch(() => undefined);
  return result;
}

export async function readAlmanacResponse(portalCode: string, galaxy: number): Promise<AlmanacResponse | null> {
  const index = await readAlmanacIndex();
  const response = index[portalCode.toUpperCase()]?.[String(galaxy)];
  if (!response) return null;
  const normalized = await normalizeAlmanacPlanet(response);
  if (normalized !== response) await writeAlmanacResponse(portalCode, galaxy, normalized);
  return normalized;
}

export async function readAlmanacResponses(portalCodes: string[]): Promise<Record<string, CachedAlmanacPlanet[]>> {
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
                  return { ...entry, response: await normalizeAlmanacPlanet(entry.response) };
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
): Promise<void> {
  const normalized = await normalizeAlmanacPlanet(response);
  await serialized(async () => {
    const index = await readAlmanacIndex();
    const canonicalCode = portalCode.toUpperCase();
    index[canonicalCode] ??= {};
    index[canonicalCode][String(galaxy)] = normalized;
    await writeAlmanacIndex(index);
  });
}
export async function readAlmanacCache(): Promise<(portalCode: string, galaxy: number) => AlmanacResponse | null> {
  const index = await readAlmanacIndex();
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
    const index = await readAlmanacIndex();
    for (const { portalCode, galaxy, response } of normalizedEntries) {
      const canonicalCode = portalCode.toUpperCase();
      index[canonicalCode] ??= {};
      index[canonicalCode][String(galaxy)] = response;
    }
    await writeAlmanacIndex(index);
  });
}
