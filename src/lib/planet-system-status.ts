export const missionSystemStatuses = [
  "Stazione Riscattata",
  "Mappato",
  "Pianeti Classificati",
  "Rinominato",
  "Dati caricati",
  "Errore dati",
] as const;

export type MissionSystemStatus = (typeof missionSystemStatuses)[number];
export type PlanetSystemStatuses = Record<string, MissionSystemStatus[]>;

export function planetSystemStatusKey(portal: string, galaxy: number): string {
  return `${galaxy}:${portal.toUpperCase()}`;
}

export function isMissionSystemStatus(value: unknown): value is MissionSystemStatus {
  return typeof value === "string" && missionSystemStatuses.includes(value as MissionSystemStatus);
}
