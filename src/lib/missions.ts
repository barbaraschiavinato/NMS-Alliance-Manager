export const missionStatuses = ["In corso", "In attesa", "Completata"] as const;
export const missionPriorities = ["Urgente", "Alta", "Normale"] as const;
export const missionSpecialties = ["all", "builder", "ranger", "explorer", "other"] as const;

export type MissionStatus = (typeof missionStatuses)[number];
export type MissionPriority = (typeof missionPriorities)[number];
export type MissionSpecialty = (typeof missionSpecialties)[number];

export type Mission = {
  id: string;
  title: string;
  description: string;
  system: string;
  systemAddress: string;
  galaxy: number;
  systemVerified?: boolean;
  systemLabelFromAlmanac?: boolean;
  createdByEmail?: string;
  createdByName?: string;
  stationOwnerEmail?: string;
  stationOwnerName?: string;
  assignedTo: string;
  assignedEmail?: string;
  targetSpecialty: MissionSpecialty;
  dueDate: string;
  status: MissionStatus;
  priority: MissionPriority;
  progress: number;
};

export type MissionInput = Omit<Mission, "id">;

export type MissionViewer = Readonly<{
  email: string;
  name: string;
  nmsName?: string;
  specialty: string;
}>;

export function canViewMission(mission: Mission, viewer: MissionViewer): boolean {
  const assignedEmail = mission.assignedEmail?.trim().toLowerCase() ?? "";
  const assignedName = mission.assignedTo.trim().toLowerCase();
  const viewerEmail = viewer.email.trim().toLowerCase();

  if (assignedEmail) return assignedEmail === viewerEmail;
  if (assignedName) {
    return [viewer.nmsName, viewer.name, viewer.email]
      .some((name) => name?.trim().toLowerCase() === assignedName);
  }

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

  if (planet > 6) errors.push(`Indice pianeta ${planet}: ammessi da 0 a 6.`);
  if (systemIndex > 0xffe) errors.push("Indice sistema FFF riservato.");
  if (rawY === 0 || rawY === 0x80) errors.push(`Coordinata Y ${rawY.toString(16).toUpperCase().padStart(2, "0")}: valore non utilizzato.`);
  if (rawZ === 0 || rawZ === 0x800) errors.push(`Coordinata Z ${rawZ.toString(16).toUpperCase().padStart(3, "0")}: valore non utilizzato.`);
  if (rawX === 0 || rawX === 0x800) errors.push(`Coordinata X ${rawX.toString(16).toUpperCase().padStart(3, "0")}: valore non utilizzato.`);

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
    typeof mission.system === "string" &&
    typeof mission.systemAddress === "string" &&
    decodePortalAddress(mission.systemAddress)?.errors.length === 0 &&
    typeof mission.galaxy === "number" &&
    Number.isInteger(mission.galaxy) &&
    mission.galaxy >= 0 &&
    mission.galaxy <= 255 &&
    (mission.systemVerified === undefined || typeof mission.systemVerified === "boolean") &&
    (mission.systemLabelFromAlmanac === undefined || typeof mission.systemLabelFromAlmanac === "boolean") &&
    (mission.createdByEmail === undefined || (typeof mission.createdByEmail === "string" && mission.createdByEmail.length <= 254)) &&
    (mission.createdByName === undefined || (typeof mission.createdByName === "string" && mission.createdByName.length <= 80)) &&
    (mission.stationOwnerEmail === undefined || (typeof mission.stationOwnerEmail === "string" && mission.stationOwnerEmail.length <= 254)) &&
    (mission.stationOwnerName === undefined || (typeof mission.stationOwnerName === "string" && mission.stationOwnerName.length <= 80)) &&
    typeof mission.assignedTo === "string" &&
    (mission.assignedEmail === undefined || typeof mission.assignedEmail === "string") &&
    missionSpecialties.includes(mission.targetSpecialty as MissionSpecialty) &&
    typeof mission.dueDate === "string" &&
    missionStatuses.includes(mission.status as MissionStatus) &&
    missionPriorities.includes(mission.priority as MissionPriority) &&
    typeof mission.progress === "number" &&
    Number.isInteger(mission.progress) &&
    mission.progress >= 0 &&
    mission.progress <= 100
  );
}