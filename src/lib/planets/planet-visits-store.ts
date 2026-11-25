import { readJsonDocument, writeJsonDocument } from "@/lib/storage/json-document";

// Personal "visited" marks: member publicId -> planet keys (see planetVisitKey).
type PlanetVisits = Record<string, string[]>;

function parseVisits(value: unknown): PlanetVisits {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid planet visit storage.");
  return Object.fromEntries(
    Object.entries(value).map(([memberId, keys]) => {
      if (!Array.isArray(keys) || !keys.every((key) => typeof key === "string"))
        throw new Error("Invalid planet visit storage.");
      return [memberId, [...new Set(keys as string[])]];
    }),
  );
}

async function readVisits(): Promise<PlanetVisits> {
  const value = await readJsonDocument("planet-visits");
  return value === undefined ? {} : parseVisits(value);
}

function writeVisits(data: PlanetVisits): Promise<void> {
  return writeJsonDocument("planet-visits", data);
}

export async function readPlanetVisits(memberId: string): Promise<string[]> {
  return (await readVisits())[memberId] ?? [];
}

// Only how many planets each member visited is shared (the leaderboard), never which ones.
export async function readPlanetVisitCounts(): Promise<Map<string, number>> {
  return new Map(Object.entries(await readVisits()).map(([memberId, keys]) => [memberId, keys.length]));
}

export async function setPlanetVisit(memberId: string, key: string, visited: boolean): Promise<void> {
  const data = await readVisits();
  const keys = new Set(data[memberId] ?? []);
  if (visited) keys.add(key);
  else keys.delete(key);
  if (keys.size > 0) data[memberId] = [...keys];
  else delete data[memberId];
  await writeVisits(data);
}
