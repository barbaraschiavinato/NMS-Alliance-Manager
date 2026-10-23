import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Mission, MissionInput } from "@/lib/missions/missions";
import { writeDataFile } from "../../helpers/members";

// Indirizzi portale validi: SAME_SYSTEM_OTHER_PLANET differisce da PORTAL solo per il glifo del pianeta.
export const PORTAL = "0123456789AB";
export const SAME_SYSTEM_OTHER_PLANET = "1123456789AB";
export const OTHER_PORTAL = "02A1B2C3D4E5";
export const THIRD_PORTAL = "0345678ABCDE";

export function resetData() {
  rmSync(path.join(process.cwd(), "data"), { recursive: true, force: true });
}

export function missionInput(overrides: Partial<MissionInput> = {}): MissionInput {
  return {
    title: "Survey the system",
    description: "Map every planet",
    system: "Test System",
    systemAddress: PORTAL.toLowerCase(),
    galaxy: 0,
    assignedTo: "",
    targetSpecialty: "explorer",
    dueDate: "2026-12-31",
    status: "pending",
    priority: "normal",
    progress: 0,
    ...overrides,
  };
}

// Missione come salvata su disco (senza i campi derivati che writeMissions rimuove).
export function storedMission(overrides: Partial<Mission> = {}): Omit<Mission, "assignedTo"> {
  const { assignedTo, ...input } = missionInput();
  void assignedTo;
  return {
    ...input,
    systemAddress: PORTAL,
    id: randomUUID(),
    ...overrides,
  };
}

// Scrive sempre missions.json, altrimenti la store restituisce le missioni demo.
export function seedMissions(missions: ReadonlyArray<Partial<Mission>>) {
  writeDataFile("missions.json", missions);
}

export function readStoredMissions(): Array<Record<string, unknown>> {
  return JSON.parse(readFileSync(path.join(process.cwd(), "data", "missions.json"), "utf8"));
}

export function seedStations(
  stations: ReadonlyArray<{ portal: string; galaxy: number; ownerId: string; note?: string; name?: string }>,
) {
  writeDataFile("stations-v2.json", stations);
}

// Un JSON malformato fa fallire il parse nella store e attiva il ramo 503.
export function corruptDataFile(name: string) {
  const dir = path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), "{ not json");
}
