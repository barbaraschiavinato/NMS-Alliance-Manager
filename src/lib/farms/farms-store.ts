import { get, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { localDataPath } from "@/lib/storage/local-data-path";
import { getBlobAuthOptions } from "@/lib/storage/blob-config";
import { normalizeStoredFarm, type Farm, type FarmInput } from "@/lib/farms/farms";

const blobPath = "alliance-manager/farms.json";
const localPath = () => localDataPath("farms.json");

export async function readFarms(): Promise<Farm[]> {
  let raw: unknown;
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    const blob = await get(blobPath, { access: "private", useCache: false, ...blobAuthOptions });
    if (!blob || blob.statusCode === 304) return [];
    raw = JSON.parse(await new Response(blob.stream).text());
  } else {
    try {
      raw = JSON.parse(await readFile(localPath(), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((entry) => {
    const farm = normalizeStoredFarm(entry);
    if (!farm || seen.has(farm.id)) return [];
    seen.add(farm.id);
    return [farm];
  });
}

async function writeFarms(farms: readonly Farm[]): Promise<void> {
  const json = `${JSON.stringify(farms, null, 2)}\n`;
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
  const filePath = localPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, json, "utf8");
}

function farmFields(input: FarmInput) {
  return {
    name: input.name,
    portal: input.portal,
    galaxy: input.galaxy,
    ...(input.systemName ? { systemName: input.systemName } : {}),
    planetName: input.planetName,
    resources: [...input.resources],
    ...(input.coordinates ? { coordinates: input.coordinates } : {}),
    ...(input.note ? { note: input.note } : {}),
  };
}

export async function addFarm(input: FarmInput, ownerId: Farm["ownerId"], createdByMemberId: string): Promise<Farm> {
  const farms = await readFarms();
  const farm: Farm = {
    id: randomUUID(),
    ...farmFields(input),
    ownerId,
    createdByMemberId,
    createdAt: new Date().toISOString(),
  };
  await writeFarms([...farms, farm]);
  return farm;
}

export async function updateFarm(id: string, input: FarmInput, ownerId: Farm["ownerId"]): Promise<Farm | null> {
  const farms = await readFarms();
  const current = farms.find((farm) => farm.id === id);
  if (!current) return null;
  const updated: Farm = {
    id: current.id,
    ...farmFields(input),
    ownerId,
    ...(current.createdByMemberId ? { createdByMemberId: current.createdByMemberId } : {}),
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await writeFarms(farms.map((farm) => (farm.id === id ? updated : farm)));
  return updated;
}

export async function removeFarm(id: string): Promise<boolean> {
  const farms = await readFarms();
  const remaining = farms.filter((farm) => farm.id !== id);
  if (remaining.length === farms.length) return false;
  await writeFarms(remaining);
  return true;
}

export async function reassignFarmOwner(fromMemberId: string, toMemberId: string): Promise<void> {
  const farms = await readFarms();
  if (!farms.some((farm) => farm.ownerId === fromMemberId || farm.createdByMemberId === fromMemberId)) return;
  await writeFarms(
    farms.map((farm) => ({
      ...farm,
      ownerId: farm.ownerId === fromMemberId ? toMemberId : farm.ownerId,
      ...(farm.createdByMemberId === fromMemberId ? { createdByMemberId: toMemberId } : {}),
    })),
  );
}
