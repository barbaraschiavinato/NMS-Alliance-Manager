export const missionSystemStatuses = [
  "station_claimed",
  "mapped",
  "planets_classified",
  "data_uploaded",
  "buildings_built",
  "bases_uploaded",
  "renamed",
  "data_error",
] as const;

export const missionSystemStatusRoles: Record<MissionSystemStatus, "ranger" | "explorer" | "builder"> = {
  station_claimed: "ranger",
  mapped: "explorer",
  planets_classified: "explorer",
  data_uploaded: "explorer",
  buildings_built: "builder",
  bases_uploaded: "builder",
  renamed: "ranger",
  data_error: "explorer",
};

export function editableSystemStatusRoles(member: { role: string; specialty: string; simpleView?: boolean }) {
  const isModerator = member.role === "moderator" || member.role === "admin";
  return isModerator && member.simpleView !== true ? null : [member.specialty];
}

export type MissionSystemStatus = (typeof missionSystemStatuses)[number];
export type PlanetSystemStatuses = Record<string, MissionSystemStatus[]>;

const legacyStatusValues: Record<string, MissionSystemStatus> = {
  "Stazione Riscattata": "station_claimed",
  Mappato: "mapped",
  "Pianeti Classificati": "planets_classified",
  "Edifici costruiti": "buildings_built",
  "Basi caricate": "bases_uploaded",
  Rinominato: "renamed",
  "Sistema rinominato": "renamed",
  "Dati caricati": "data_uploaded",
  "Errore dati": "data_error",
  "Station claimed": "station_claimed",
  Mapped: "mapped",
  "Planets classified": "planets_classified",
  "Buildings built": "buildings_built",
  "Bases uploaded": "bases_uploaded",
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

export const systemProgressCap = 80;

export function systemProgressFloor(statuses: readonly MissionSystemStatus[], specialty: string) {
  const roleStatuses = missionSystemStatuses.filter((status) => status !== "data_error" && missionSystemStatusRoles[status] === specialty);
  if (roleStatuses.length === 0) return 0;
  return Math.round(systemProgressCap * roleStatuses.filter((status) => statuses.includes(status)).length / roleStatuses.length);
}
