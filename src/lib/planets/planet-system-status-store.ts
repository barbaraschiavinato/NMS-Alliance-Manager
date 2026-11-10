import { readJsonDocument, writeJsonDocument } from "@/lib/storage/json-document";
import { memoizedRead } from "@/lib/storage/request-memo";
import {
  isMissionSystemStatus,
  normalizeMissionSystemStatus,
  parsePlanetSystemStatusAuthors,
  planetSystemStatusKey,
  type MissionSystemStatus,
  type PlanetSystemStatusAuthors,
  type PlanetSystemStatuses,
  type SystemStatusAuthors,
} from "@/lib/planets/planet-system-status";

const statusDocument = "planet-system-status";
const authorsDocument = "planet-system-status-authors";

function normalizeStatuses(value: unknown): {
  data: PlanetSystemStatuses;
  hasLegacyValues: boolean;
  isValid: boolean;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { data: {}, hasLegacyValues: false, isValid: false };
  }

  const data: PlanetSystemStatuses = {};
  let hasLegacyValues = false;
  let isValid = true;
  for (const [key, values] of Object.entries(value)) {
    if (!Array.isArray(values)) {
      isValid = false;
      continue;
    }
    const statuses = values.map(normalizeMissionSystemStatus);
    if (!statuses.every((status): status is MissionSystemStatus => status !== null)) {
      isValid = false;
      continue;
    }
    if (values.some((status) => !isMissionSystemStatus(status))) hasLegacyValues = true;
    data[key] = [...new Set(statuses)];
  }
  return { data, hasLegacyValues, isValid };
}

async function readDocument(name: string): Promise<unknown> {
  return (await memoizedRead(name, () => readJsonDocument(name))) ?? {};
}

async function readStatusData(): Promise<PlanetSystemStatuses> {
  const value = await readDocument(statusDocument);
  const normalized = normalizeStatuses(value);
  if (normalized.hasLegacyValues && normalized.isValid) {
    await writeStatusData(normalized.data);
  }
  return normalized.data;
}

async function writeStatusData(data: PlanetSystemStatuses): Promise<void> {
  await writeJsonDocument(statusDocument, data);
}

export async function readPlanetSystemStatusAuthors(): Promise<PlanetSystemStatusAuthors> {
  return parsePlanetSystemStatusAuthors(await readDocument(authorsDocument));
}

export async function readPlanetSystemStatusAuthor(portal: string, galaxy: number): Promise<SystemStatusAuthors> {
  const data = await readPlanetSystemStatusAuthors();
  return data[planetSystemStatusKey(portal, galaxy)] ?? {};
}

export async function writePlanetSystemStatusAuthor(
  portal: string,
  galaxy: number,
  authors: SystemStatusAuthors,
): Promise<SystemStatusAuthors> {
  const data = await readPlanetSystemStatusAuthors();
  const key = planetSystemStatusKey(portal, galaxy);
  if (Object.keys(authors).length > 0) data[key] = authors;
  else delete data[key];
  await writeJsonDocument(authorsDocument, data);
  return data[key] ?? {};
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
      !Array.isArray(mission.systemStatus)
    )
      return [];
    const statuses = mission.systemStatus.map(normalizeMissionSystemStatus);
    if (!statuses.every((status): status is MissionSystemStatus => status !== null)) return [];
    return [
      {
        key: planetSystemStatusKey(mission.systemAddress, mission.galaxy),
        statuses,
      },
    ];
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
