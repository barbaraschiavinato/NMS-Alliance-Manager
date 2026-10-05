import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBlobAuthOptions } from "@/lib/blob-config";
import type { Mission } from "@/lib/missions";
import { initialMissions } from "@/lib/seed";

const blobPath = "alliance-manager/missions.json";
const localPath = path.join(process.cwd(), "data", "missions.json");

function migrateMissions(value: unknown): Mission[] {
  if (!Array.isArray(value)) return initialMissions;

  return value.map((entry) => {
    const mission = entry as Partial<Mission>;
    const matchingSeed = initialMissions.find((seed) =>
      seed.id === mission.id && seed.title === mission.title && seed.system === mission.system,
    );
    const missingAddress = typeof mission.systemAddress !== "string" || mission.systemAddress.length === 0;
    let galaxy = typeof mission.galaxy === "number" ? mission.galaxy : 0;
    if (missingAddress && matchingSeed) galaxy = matchingSeed.galaxy;
    return {
      ...mission,
      system: typeof mission.system === "string" ? mission.system : "",
      systemAddress: missingAddress ? matchingSeed?.systemAddress ?? "" : mission.systemAddress,
      galaxy,
      targetSpecialty: mission.targetSpecialty === "builder" || mission.targetSpecialty === "ranger" || mission.targetSpecialty === "explorer" || mission.targetSpecialty === "all"
        ? mission.targetSpecialty
        : "all",
    } as Mission;
  });
}

export async function readMissions(): Promise<Mission[]> {
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    const blob = await get(blobPath, { access: "private", useCache: false, ...blobAuthOptions });
    if (!blob || blob.statusCode === 304) return initialMissions;
    return migrateMissions(JSON.parse(await new Response(blob.stream).text()));
  }

  try {
    return migrateMissions(JSON.parse(await readFile(localPath, "utf8")));
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