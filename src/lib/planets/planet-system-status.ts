export const missionSystemStatuses = [
  "station_claimed",
  "system_scanned",
  "mapped",
  "planets_classified",
  "data_uploaded",
  "buildings_built",
  "bases_uploaded",
  "renamed",
  "system_data_uploaded",
  "data_error",
] as const;

export const missionSystemStatusRoles: Record<MissionSystemStatus, "ranger" | "explorer" | "builder"> = {
  station_claimed: "ranger",
  system_scanned: "ranger",
  mapped: "explorer",
  planets_classified: "explorer",
  data_uploaded: "explorer",
  buildings_built: "builder",
  bases_uploaded: "builder",
  renamed: "ranger",
  system_data_uploaded: "ranger",
  data_error: "explorer",
};

export function editableSystemStatusRoles(member: { role: string; specialty: string; simpleView?: boolean }) {
  const isModerator = member.role === "moderator" || member.role === "admin";
  return isModerator && member.simpleView !== true ? null : [member.specialty];
}

export type MissionSystemStatus = (typeof missionSystemStatuses)[number];
export type PlanetSystemStatuses = Record<string, MissionSystemStatus[]>;

// Who checked a Ranger task: the station discoverer or the Ranger assigned to a mission on the system.
export type SystemStatusAuthor = { memberId: string; as: "discoverer" | "ranger" };
export type SystemStatusAuthors = Partial<Record<MissionSystemStatus, SystemStatusAuthor>>;
export type PlanetSystemStatusAuthors = Record<string, SystemStatusAuthors>;

export function isSystemStatusAuthor(value: unknown): value is SystemStatusAuthor {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const author = value as Record<string, unknown>;
  return (
    typeof author.memberId === "string" &&
    author.memberId.length > 0 &&
    (author.as === "discoverer" || author.as === "ranger")
  );
}

export function parseSystemStatusAuthors(value: unknown): SystemStatusAuthors {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const authors: SystemStatusAuthors = {};
  for (const [status, author] of Object.entries(value)) {
    if (
      isMissionSystemStatus(status) &&
      missionSystemStatusRoles[status] === "ranger" &&
      isSystemStatusAuthor(author)
    ) {
      authors[status] = { memberId: author.memberId, as: author.as };
    }
  }
  return authors;
}

export function parsePlanetSystemStatusAuthors(value: unknown): PlanetSystemStatusAuthors {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: PlanetSystemStatusAuthors = {};
  for (const [key, authors] of Object.entries(value)) {
    const parsed = parseSystemStatusAuthors(authors);
    if (Object.keys(parsed).length > 0) result[key] = parsed;
  }
  return result;
}

// A checked Ranger task belongs to whoever checked it first: the other party sees it locked.
export function systemStatusLockedBy(
  status: MissionSystemStatus,
  statuses: readonly MissionSystemStatus[],
  authors: SystemStatusAuthors | undefined,
  memberId: string | undefined,
): SystemStatusAuthor["as"] | null {
  const author = authors?.[status];
  if (!author || !memberId || !statuses.includes(status)) return null;
  return author.memberId === memberId ? null : author.as;
}

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

const supersededByExplorerScan: readonly MissionSystemStatus[] = ["system_scanned", "system_data_uploaded"];

export function systemStatusCoveredBy(
  status: MissionSystemStatus,
  statuses: readonly MissionSystemStatus[],
): "ranger" | "explorer" | null {
  // Preserve the Explorer's existing coverage when both scan flags were saved.
  if (statuses.includes("mapped")) return supersededByExplorerScan.includes(status) ? "explorer" : null;
  return status === "mapped" && statuses.includes("system_scanned") ? "ranger" : null;
}

export function applicableSystemStatuses(statuses: readonly MissionSystemStatus[]): MissionSystemStatus[] {
  return missionSystemStatuses.filter((status) => systemStatusCoveredBy(status, statuses) === null);
}

export const systemProgressCap = 80;

export function systemProgressFloor(statuses: readonly MissionSystemStatus[], specialty: string) {
  const roleStatuses = applicableSystemStatuses(statuses).filter(
    (status) => status !== "data_error" && missionSystemStatusRoles[status] === specialty,
  );
  if (roleStatuses.length === 0) return 0;
  return Math.round(
    (systemProgressCap * roleStatuses.filter((status) => statuses.includes(status)).length) / roleStatuses.length,
  );
}
