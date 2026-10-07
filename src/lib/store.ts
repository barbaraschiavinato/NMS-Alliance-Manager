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
import { readAccessData } from "@/lib/access-store";
import { initialMissions } from "@/lib/seed";

const blobPath = "alliance-manager/missions.json";
const localPath = path.join(process.cwd(), "data", "missions.json");

function migrateMissions(value: unknown, members: Awaited<ReturnType<typeof readAccessData>>["members"]): { missions: Mission[]; hasLegacyValues: boolean } {
  if (!Array.isArray(value)) return { missions: initialMissions, hasLegacyValues: false };

  let hasLegacyValues = false;
  const missions = value.map((entry) => {
    const mission = entry as Partial<Mission>;
    const rawMission = entry as Record<string, unknown>;
    const legacyOwnerEmail = rawMission.stationOwnerEmail;
    const legacyCreatorEmail = rawMission.createdByEmail;
    const legacyAssigneeEmail = rawMission.assignedEmail;
    const storedCreatorName = typeof rawMission.createdByName === "string" ? rawMission.createdByName : "";
    const storedStationOwnerName = typeof rawMission.stationOwnerName === "string" ? rawMission.stationOwnerName : "";
    const storedAssigneeName = typeof rawMission.assignedTo === "string" ? rawMission.assignedTo : "";
    const status = normalizeMissionStatus(mission.status);
    if (!status) throw new Error("Invalid mission status in stored mission data.");
    const priority = normalizeMissionPriority(mission.priority);
    if (!priority) throw new Error("Invalid mission priority in stored mission data.");
    if (!isMissionStatus(mission.status) || !isMissionPriority(mission.priority)) hasLegacyValues = true;
    if (
      ["stationOwnerEmail", "createdByEmail", "assignedEmail", "createdByName", "stationOwnerName", "assignedTo"]
        .some((key) => key in rawMission)
    ) hasLegacyValues = true;
    const missionData = Object.fromEntries(
      Object.entries(rawMission).filter(([key]) =>
        ![
          "systemStatus",
          "stationOwnerEmail",
          "createdByEmail",
          "assignedEmail",
          "createdByName",
          "stationOwnerName",
          "assignedTo",
        ].includes(key),
      ),
    );
    const findByName = (name: string) => {
      const normalizedName = name.trim().toLowerCase();
      if (!normalizedName) return undefined;
      const matches = members.filter((candidate) =>
        [candidate.nmsName, candidate.name].some((candidateName) =>
          candidateName.trim().toLowerCase() === normalizedName,
        ),
      );
      return matches.length === 1 ? matches[0] : undefined;
    };
    const legacyOwner = typeof legacyOwnerEmail === "string"
      ? members.find((candidate) => candidate.email.toLowerCase() === legacyOwnerEmail.toLowerCase())
      : undefined;
    const creatorByEmail = typeof legacyCreatorEmail === "string"
      ? members.find((candidate) => candidate.email.toLowerCase() === legacyCreatorEmail.toLowerCase())
      : undefined;
    const assigneeByEmail = typeof legacyAssigneeEmail === "string"
      ? members.find((candidate) => candidate.email.toLowerCase() === legacyAssigneeEmail.toLowerCase())
      : undefined;
    const ownerById = members.find((candidate) => candidate.publicId === mission.stationOwnerMemberId);
    const creatorById = members.find((candidate) => candidate.publicId === mission.createdByMemberId);
    const assigneeById = members.find((candidate) => candidate.publicId === mission.assignedMemberId);
    const stationOwner = ownerById ?? legacyOwner ?? findByName(storedStationOwnerName);
    const creator = creatorById ?? creatorByEmail ?? findByName(storedCreatorName);
    const assigned = assigneeById ?? assigneeByEmail ?? findByName(storedAssigneeName);
    const matchingSeed = initialMissions.find((seed) =>
      seed.id === mission.id && seed.title === mission.title && seed.system === mission.system,
    );
    const missingAddress = typeof mission.systemAddress !== "string" || mission.systemAddress.length === 0;
    let galaxy = typeof mission.galaxy === "number" ? mission.galaxy : 0;
    if (missingAddress && matchingSeed) galaxy = matchingSeed.galaxy;
    return {
      ...missionData,
      ...(stationOwner ? { stationOwnerMemberId: stationOwner.publicId } : {}),
      ...(creator ? { createdByMemberId: creator.publicId } : {}),
      ...(assigned ? { assignedMemberId: assigned.publicId } : {}),
      ...(storedCreatorName || mission.createdByMemberId
        ? { createdByName: creator?.nmsName || creator?.name || "Former member" }
        : {}),
      ...(storedStationOwnerName || mission.stationOwnerMemberId
        ? { stationOwnerName: stationOwner?.nmsName || stationOwner?.name || "Former member" }
        : {}),
      assignedTo: assigned?.nmsName || assigned?.name || (storedAssigneeName ? "Former member" : ""),
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
  const accessData = await readAccessData();
  const migrated = migrateMissions(value, accessData.members);
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
  const derivedFields = new Set([
    "stationOwnerEmail",
    "createdByEmail",
    "assignedEmail",
    "createdByName",
    "stationOwnerName",
    "assignedTo",
  ]);
  const persistentMissions = missions.map((mission) =>
    Object.fromEntries(Object.entries(mission).filter(([key]) => !derivedFields.has(key))),
  );
  const json = `${JSON.stringify(persistentMissions, null, 2)}\n`;
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