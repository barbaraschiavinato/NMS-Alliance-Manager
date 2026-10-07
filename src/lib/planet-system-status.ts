export const missionSystemStatuses = [
  "station_claimed",
  "mapped",
  "planets_classified",
  "renamed",
  "data_uploaded",
  "data_error",
] as const;

export type MissionSystemStatus = (typeof missionSystemStatuses)[number];
export type PlanetSystemStatuses = Record<string, MissionSystemStatus[]>;

const legacyStatusValues: Record<string, MissionSystemStatus> = {
  "Stazione Riscattata": "station_claimed",
  Mappato: "mapped",
  "Pianeti Classificati": "planets_classified",
  Rinominato: "renamed",
  "Dati caricati": "data_uploaded",
  "Errore dati": "data_error",
  "Station claimed": "station_claimed",
  Mapped: "mapped",
  "Planets classified": "planets_classified",
  Renamed: "renamed",
  "Data uploaded": "data_uploaded",
  "Data error": "data_error",
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
