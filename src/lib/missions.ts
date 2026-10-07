export const missionStatuses = ["in_progress", "pending", "completed"] as const;
export const missionPriorities = ["urgent", "high", "normal"] as const;
export const missionSpecialties = ["all", "builder", "ranger", "explorer", "other"] as const;

export type MissionStatus = (typeof missionStatuses)[number];
export type MissionPriority = (typeof missionPriorities)[number];
export type MissionSpecialty = (typeof missionSpecialties)[number];

const legacyMissionStatuses: Record<string, MissionStatus> = {
  "In corso": "in_progress",
  "In attesa": "pending",
  Completata: "completed",
  "In progress": "in_progress",
  Pending: "pending",
  Completed: "completed",
};

const legacyMissionPriorities: Record<string, MissionPriority> = {
  Urgente: "urgent",
  Alta: "high",
  Normale: "normal",
  Urgent: "urgent",
  High: "high",
  Normal: "normal",
};

export function normalizeMissionStatus(value: unknown): MissionStatus | null {
  if (typeof value !== "string") return null;
  const currentStatus = missionStatuses.find((status) => status === value);
  return currentStatus ?? legacyMissionStatuses[value] ?? null;
}

export function normalizeMissionPriority(value: unknown): MissionPriority | null {
  if (typeof value !== "string") return null;
  const currentPriority = missionPriorities.find((priority) => priority === value);
  return currentPriority ?? legacyMissionPriorities[value] ?? null;
}

export function isMissionStatus(value: unknown): value is MissionStatus {
  return typeof value === "string" && missionStatuses.some((status) => status === value);
}

export function isMissionPriority(value: unknown): value is MissionPriority {
  return typeof value === "string" && missionPriorities.some((priority) => priority === value);
}

export type Mission = {
  id: string;
  title: string;
  description: string;
  notes?: string;
  system: string;
  systemAddress: string;
  galaxy: number;
  systemVerified?: boolean;
  systemLabelFromAlmanac?: boolean;
  createdByName?: string;
  createdByMemberId?: string;
  stationOwnerName?: string;
  stationOwnerMemberId?: string;
  assignedTo: string;
  assignedMemberId?: string;
  targetSpecialty: MissionSpecialty;
  dueDate: string;
  status: MissionStatus;
  priority: MissionPriority;
  progress: number;
};

export type MissionInput = Omit<Mission, "id">;

export type MissionViewer = Readonly<{
  publicId?: string;
  email: string;
  name: string;
  nmsName?: string;
  specialty: string;
}>;

export function canViewMission(mission: Mission, viewer: MissionViewer): boolean {
  const assignedMemberId = mission.assignedMemberId?.trim() ?? "";
  if (assignedMemberId) return Boolean(viewer.publicId && assignedMemberId === viewer.publicId);
  if (mission.assignedTo.trim()) return false;

  return mission.targetSpecialty === "all" || mission.targetSpecialty === viewer.specialty;
}

export type PortalAddressDecode = {
  kind: "portal";
  planet: number;
  systemIndex: number;
  y: number;
  z: number | null;
  x: number | null;
  errors: string[];
};

function signedCoordinate(value: number, bits: 8 | 12) {
  const size = 2 ** bits;
  const midpoint = size / 2;
  return value < midpoint ? value : value - size;
}

export function decodePortalAddress(address: string): PortalAddressDecode | null {
  if (!/^[0-9A-F]{12}$/i.test(address)) return null;

  const normalized = address.toUpperCase();
  const planet = Number.parseInt(normalized.slice(0, 1), 16);
  const systemIndex = Number.parseInt(normalized.slice(1, 4), 16);
  const rawY = Number.parseInt(normalized.slice(4, 6), 16);
  const rawZ = Number.parseInt(normalized.slice(6, 9), 16);
  const rawX = Number.parseInt(normalized.slice(9, 12), 16);
  const errors: string[] = [];

  if (planet > 6) errors.push(`Planet index ${planet}: allowed range is 0–6.`);
  if (systemIndex > 0xffe) errors.push("System index FFF is reserved.");
  if (rawY === 0 || rawY === 0x80) errors.push(`Y coordinate ${rawY.toString(16).toUpperCase().padStart(2, "0")}: unused value.`);
  if (rawZ === 0 || rawZ === 0x800) errors.push(`Z coordinate ${rawZ.toString(16).toUpperCase().padStart(3, "0")}: unused value.`);
  if (rawX === 0 || rawX === 0x800) errors.push(`X coordinate ${rawX.toString(16).toUpperCase().padStart(3, "0")}: unused value.`);

  return {
    kind: "portal",
    planet,
    systemIndex,
    y: signedCoordinate(rawY, 8),
    z: rawZ === null ? null : signedCoordinate(rawZ, 12),
    x: rawX === null ? null : signedCoordinate(rawX, 12),
    errors,
  };
}

export function isMissionInput(value: unknown): value is MissionInput {
  if (!value || typeof value !== "object") return false;
  const mission = value as Record<string, unknown>;
  return (
    typeof mission.title === "string" &&
    mission.title.trim().length > 0 &&
    mission.title.length <= 120 &&
    typeof mission.description === "string" &&
    (mission.notes === undefined || (typeof mission.notes === "string" && mission.notes.length <= 1000)) &&
    typeof mission.system === "string" &&
    typeof mission.systemAddress === "string" &&
    decodePortalAddress(mission.systemAddress)?.errors.length === 0 &&
    typeof mission.galaxy === "number" &&
    Number.isInteger(mission.galaxy) &&
    mission.galaxy >= 0 &&
    mission.galaxy <= 255 &&
    (mission.systemVerified === undefined || typeof mission.systemVerified === "boolean") &&
    (mission.systemLabelFromAlmanac === undefined || typeof mission.systemLabelFromAlmanac === "boolean") &&
    (mission.createdByName === undefined || (typeof mission.createdByName === "string" && mission.createdByName.length <= 80)) &&
    (mission.createdByMemberId === undefined || typeof mission.createdByMemberId === "string") &&
    (mission.stationOwnerName === undefined || (typeof mission.stationOwnerName === "string" && mission.stationOwnerName.length <= 80)) &&
    (mission.stationOwnerMemberId === undefined || typeof mission.stationOwnerMemberId === "string") &&
    typeof mission.assignedTo === "string" &&
    (mission.assignedMemberId === undefined || typeof mission.assignedMemberId === "string") &&
    mission.createdByEmail === undefined &&
    mission.assignedEmail === undefined &&
    missionSpecialties.includes(mission.targetSpecialty as MissionSpecialty) &&
    typeof mission.dueDate === "string" &&
    isMissionStatus(mission.status) &&
    isMissionPriority(mission.priority) &&
    typeof mission.progress === "number" &&
    Number.isInteger(mission.progress) &&
    mission.progress >= 0 &&
    mission.progress <= 100 &&
    mission.systemStatus === undefined
  );
}