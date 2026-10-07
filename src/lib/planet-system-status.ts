export const missionSystemStatuses = [
  "Station claimed",
  "Mapped",
  "Planets classified",
  "Renamed",
  "Data uploaded",
  "Data error",
] as const;

export type MissionSystemStatus = (typeof missionSystemStatuses)[number];
export type PlanetSystemStatuses = Record<string, MissionSystemStatus[]>;

const legacyStatusValues: Record<string, MissionSystemStatus> = {
  "Stazione Riscattata": "Station claimed",
  Mappato: "Mapped",
  "Pianeti Classificati": "Planets classified",
  Rinominato: "Renamed",
  "Dati caricati": "Data uploaded",
  "Errore dati": "Data error",
};

export function planetSystemStatusKey(portal: string, galaxy: number): string {
  return `${galaxy}:${portal.toUpperCase()}`;
}

export function normalizeMissionSystemStatus(value: unknown): MissionSystemStatus | null {
  if (typeof value !== "string") return null;
  const currentStatus = missionSystemStatuses.find((status) => status === value);
  if (currentStatus) return currentStatus;
  return legacyStatusValues[value] ?? null;
}

export function isMissionSystemStatus(value: unknown): value is MissionSystemStatus {
  return typeof value === "string" && missionSystemStatuses.some((status) => status === value);
}
