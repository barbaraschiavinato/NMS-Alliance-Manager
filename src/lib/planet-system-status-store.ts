import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBlobAuthOptions } from "@/lib/blob-config";
import {
  isMissionSystemStatus,
  planetSystemStatusKey,
  type MissionSystemStatus,
  type PlanetSystemStatuses,
} from "@/lib/planet-system-status";

const blobPath = "alliance-manager/planet-system-status.json";
const localPath = path.join(process.cwd(), "data", "planet-system-status.json");

function normalizeStatuses(value: unknown): PlanetSystemStatuses {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, statuses]) => {
      if (!Array.isArray(statuses) || !statuses.every(isMissionSystemStatus)) return [];
      return [[key, [...new Set(statuses)]]];
    }),
  );
}

async function readStatusData(): Promise<PlanetSystemStatuses> {
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    const blob = await get(blobPath, { access: "private", useCache: false, ...blobAuthOptions });
    if (!blob || blob.statusCode === 304) return {};
    return normalizeStatuses(JSON.parse(await new Response(blob.stream).text()));
  }

  try {
    return normalizeStatuses(JSON.parse(await readFile(localPath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function writeStatusData(data: PlanetSystemStatuses): Promise<void> {
  const json = `${JSON.stringify(data, null, 2)}\n`;
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

export async function readPlanetSystemStatuses(): Promise<PlanetSystemStatuses> {
  return readStatusData();
}

export async function readPlanetSystemStatus(portal: string, galaxy: number): Promise<MissionSystemStatus[]> {
  const data = await readStatusData();
  return data[planetSystemStatusKey(portal, galaxy)] ?? [];
}

export async function writePlanetSystemStatus(
  portal: string,
  galaxy: number,
  statuses: MissionSystemStatus[],
): Promise<MissionSystemStatus[]> {
  const data = await readStatusData();
  const normalized = [...new Set(statuses)];
  data[planetSystemStatusKey(portal, galaxy)] = normalized;
  await writeStatusData(data);
  return normalized;
}

export async function migrateLegacyPlanetSystemStatuses(value: unknown): Promise<void> {
  if (!Array.isArray(value)) return;
  const legacyEntries = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const mission = entry as Record<string, unknown>;
    if (
      typeof mission.systemAddress !== "string" ||
      !/^[0-9a-f]{12}$/i.test(mission.systemAddress) ||
      typeof mission.galaxy !== "number" ||
      !Number.isInteger(mission.galaxy) ||
      mission.galaxy < 0 ||
      mission.galaxy > 255 ||
      !Array.isArray(mission.systemStatus) ||
      !mission.systemStatus.every(isMissionSystemStatus)
    ) return [];
    return [{ key: planetSystemStatusKey(mission.systemAddress, mission.galaxy), statuses: mission.systemStatus }];
  });
  if (legacyEntries.length === 0) return;

  const data = await readStatusData();
  let changed = false;
  for (const { key, statuses } of legacyEntries) {
    if (key in data) continue;
    data[key] = [...new Set(statuses)];
    changed = true;
  }
  if (changed) await writeStatusData(data);
}
