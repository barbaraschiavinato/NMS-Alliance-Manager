import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBlobAuthOptions } from "@/lib/blob-config";
import {
  isMissionPriority,
  isMissionStatus,
  normalizeMissionPriority,
  normalizeMissionStatus,
  type Mission,
} from "@/lib/missions";
import { migrateLegacyPlanetSystemStatuses } from "@/lib/planet-system-status-store";
import { initialMissions } from "@/lib/seed";

const blobPath = "alliance-manager/missions.json";
const localPath = path.join(process.cwd(), "data", "missions.json");

function migrateMissions(value: unknown): { missions: Mission[]; hasLegacyValues: boolean } {
  if (!Array.isArray(value)) return { missions: initialMissions, hasLegacyValues: false };

  let hasLegacyValues = false;
  const missions = value.map((entry) => {
    const mission = entry as Partial<Mission>;
    const status = normalizeMissionStatus(mission.status);
    if (!status) throw new Error("Invalid mission status in stored mission data.");
    const priority = normalizeMissionPriority(mission.priority);
    if (!priority) throw new Error("Invalid mission priority in stored mission data.");
    if (!isMissionStatus(mission.status) || !isMissionPriority(mission.priority)) hasLegacyValues = true;
    const missionData = Object.fromEntries(
      Object.entries(entry as Record<string, unknown>).filter(([key]) => key !== "systemStatus"),
    );
    const matchingSeed = initialMissions.find((seed) =>
      seed.id === mission.id && seed.title === mission.title && seed.system === mission.system,
    );
    const missingAddress = typeof mission.systemAddress !== "string" || mission.systemAddress.length === 0;
    let galaxy = typeof mission.galaxy === "number" ? mission.galaxy : 0;
    if (missingAddress && matchingSeed) galaxy = matchingSeed.galaxy;
    return {
      ...missionData,
      system: typeof mission.system === "string" ? mission.system : "",
      systemAddress: missingAddress ? matchingSeed?.systemAddress ?? "" : mission.systemAddress,
      galaxy,
      status,
      priority,
      targetSpecialty: mission.targetSpecialty === "builder" || mission.targetSpecialty === "ranger" || mission.targetSpecialty === "explorer" || mission.targetSpecialty === "other" || mission.targetSpecialty === "all"
        ? mission.targetSpecialty
        : "all",
    } as Mission;
  });
  return { missions, hasLegacyValues };
}

async function readAndMigrateMissions(value: unknown): Promise<Mission[]> {
  await migrateLegacyPlanetSystemStatuses(value);
  const migrated = migrateMissions(value);
  if (migrated.hasLegacyValues) await writeMissions(migrated.missions);
  return migrated.missions;
}

export async function readMissions(): Promise<Mission[]> {
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    const blob = await get(blobPath, { access: "private", useCache: false, ...blobAuthOptions });
    if (!blob || blob.statusCode === 304) return initialMissions;
    return readAndMigrateMissions(JSON.parse(await new Response(blob.stream).text()));
  }

  try {
    return await readAndMigrateMissions(JSON.parse(await readFile(localPath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return initialMissions;
    throw error;
  }
}

export async function writeMissions(missions: Mission[]): Promise<void> {
  const json = `${JSON.stringify(missions, null, 2)}\n`;
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