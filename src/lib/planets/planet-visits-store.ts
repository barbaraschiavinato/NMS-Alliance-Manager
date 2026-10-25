import { get, put } from "@vercel/blob";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getBlobAuthOptions } from "@/lib/storage/blob-config";
import { localDataPath } from "@/lib/storage/local-data-path";

// Personal "visited" marks: member publicId -> planet keys (see planetVisitKey).
type PlanetVisits = Record<string, string[]>;
const blobPath = "alliance-manager/planet-visits.json";

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
  const options = getBlobAuthOptions();
  let json: string | undefined;
  if (options) {
    const blob = await get(blobPath, { access: "private", useCache: false, ...options });
    if (blob && blob.statusCode !== 304) json = await new Response(blob.stream).text();
  } else {
    try {
      json = await readFile(localDataPath("planet-visits.json"), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return json === undefined ? {} : parseVisits(JSON.parse(json));
}

async function writeVisits(data: PlanetVisits) {
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const options = getBlobAuthOptions();
  if (options) {
    await put(blobPath, json, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      ...options,
    });
    return;
  }
  const file = localDataPath("planet-visits.json");
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, json, "utf8");
  await rename(temporary, file);
}

export async function readPlanetVisits(memberId: string): Promise<string[]> {
  return (await readVisits())[memberId] ?? [];
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
