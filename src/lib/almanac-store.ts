import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBlobAuthOptions } from "@/lib/blob-config";

type AlmanacResponse = Record<string, unknown>;
type AlmanacResponseIndex = Record<string, Record<string, AlmanacResponse>>;
export type CachedAlmanacPlanet = Readonly<{ galaxy: number; response: AlmanacResponse }>;

const blobPath = "alliance-manager/almanac.json";
const localPath = path.join(process.cwd(), "data", "almanac.json");

function normalizeAlmanacIndex(value: unknown): AlmanacResponseIndex {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const index: AlmanacResponseIndex = {};
  for (const [portalCode, galaxies] of Object.entries(value)) {
    if (!/^[0-9A-F]{12}$/i.test(portalCode) || !galaxies || typeof galaxies !== "object" || Array.isArray(galaxies)) continue;
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
  await writeFile(localPath, json, "utf8");
}

export async function readAlmanacResponse(portalCode: string, galaxy: number): Promise<AlmanacResponse | null> {
  const index = await readAlmanacIndex();
  return index[portalCode.toUpperCase()]?.[String(galaxy)] ?? null;
}

export async function readAlmanacResponses(portalCodes: string[]): Promise<Record<string, CachedAlmanacPlanet[]>> {
  const index = await readAlmanacIndex();
  return Object.fromEntries(portalCodes.map((portalCode) => {
    const responses = Object.entries(index[portalCode.toUpperCase()] ?? {})
      .flatMap(([galaxy, response]) => {
        const galaxyIndex = Number(galaxy);
        return Number.isInteger(galaxyIndex) && galaxyIndex >= 0 && galaxyIndex <= 255
          ? [{ galaxy: galaxyIndex, response }]
          : [];
      })
      .sort((left, right) => left.galaxy - right.galaxy);
    return [portalCode.toUpperCase(), responses];
  }));
}

export async function writeAlmanacResponse(portalCode: string, galaxy: number, response: AlmanacResponse): Promise<void> {
  const index = await readAlmanacIndex();
  const canonicalCode = portalCode.toUpperCase();
  index[canonicalCode] ??= {};
  index[canonicalCode][String(galaxy)] = response;
  await writeAlmanacIndex(index);
}