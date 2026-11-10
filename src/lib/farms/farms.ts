import { decodePortalAddress } from "@/lib/missions/missions";
import {
  coordinatesMaxLength,
  itemNameMaxLength,
  noteMaxLength,
  planetNameMaxLength,
  systemNameMaxLength,
} from "@/lib/utils/limits";

// Resource ids are the English names returned by NMS Almanac, so the UI translates them with `tv`.
export const farmMaterials = [
  "Activated Cadmium",
  "Activated Copper",
  "Activated Emeril",
  "Activated Indium",
  "Activated Quartzite",
  "Ammonia",
  "Basalt",
  "Cadmium",
  "Cobalt",
  "Copper",
  "Crystallised Helium",
  "Dioxite",
  "Emeril",
  "Gold",
  "Indium",
  "Lithium",
  "Magnetised Ferrite",
  "Methane",
  "Nitrogen",
  "Oxygen",
  "Paraffinium",
  "Phosphorus",
  "Pyrite",
  "Quartzite",
  "Radon",
  "Rusted Metal",
  "Salt",
  "Silver",
  "Sodium",
  "Sulphurine",
  "Uranium",
] as const;

export const farmPlants = [
  "Albumen Pearl",
  "Cactus Flesh",
  "Faecium",
  "Frost Crystal",
  "Fungal Mould",
  "Gamma Root",
  "Gravitino Ball",
  "Mordite",
  "NipNip Buds",
  "Sac Venom",
  "Solanium",
  "Star Bramble",
] as const;

export type FarmResource = (typeof farmMaterials)[number] | (typeof farmPlants)[number];

const farmResourceSet: ReadonlySet<string> = new Set<string>([...farmMaterials, ...farmPlants]);
const farmPlantSet: ReadonlySet<string> = new Set<string>(farmPlants);

export type FarmStationName = Readonly<{ portal: string; galaxy: number; name: string }>;

export type Farm = Readonly<{
  id: string;
  name: string;
  portal: string;
  galaxy: number;
  systemName?: string;
  planetName: string;
  resources: readonly FarmResource[];
  coordinates?: string;
  note?: string;
  ownerId: string | null;
  createdByMemberId?: string;
  createdAt: string;
  updatedAt?: string;
}>;

export type FarmInput = Readonly<{
  name: string;
  portal: string;
  galaxy: number;
  systemName?: string;
  planetName: string;
  resources: readonly FarmResource[];
  coordinates: string;
  note: string;
}>;

export function isFarmResource(value: unknown): value is FarmResource {
  return typeof value === "string" && farmResourceSet.has(value);
}

export function isFarmPlant(resource: string) {
  return farmPlantSet.has(resource);
}

// Keeps only known resources, without duplicates, in catalogue order.
export function normalizeFarmResources(value: unknown): FarmResource[] {
  if (!Array.isArray(value)) return [];
  const selected = new Set<string>(value.filter(isFarmResource));
  return [...farmMaterials, ...farmPlants].filter((resource) => selected.has(resource));
}

function isValidGalaxy(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

// Validates a create/update payload; returns the translation key of the first error.
export function parseFarmInput(value: unknown): { input: FarmInput } | { error: string } {
  const payload = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const name = text(payload.name);
  const portal = text(payload.portal).toUpperCase();
  const systemName = text(payload.systemName);
  const planetName = text(payload.planetName);
  const coordinates = text(payload.coordinates);
  const note = text(payload.note);
  const decoded = decodePortalAddress(portal);
  if (!name) return { error: "farms.error_name_required" };
  if (name.length > itemNameMaxLength) return { error: "farms.error_name_too_long" };
  if (decoded?.kind !== "portal" || decoded.errors.length > 0 || !isValidGalaxy(payload.galaxy))
    return { error: "farms.error_invalid_portal_and_galaxy" };
  if (payload.systemName !== undefined && typeof payload.systemName !== "string")
    return { error: "farms.error_invalid_system_name" };
  if (systemName.length > systemNameMaxLength) return { error: "farms.error_system_name_too_long" };
  if (!planetName) return { error: "farms.error_planet_name_required" };
  if (planetName.length > planetNameMaxLength) return { error: "farms.error_planet_name_too_long" };
  if (!Array.isArray(payload.resources) || !payload.resources.every(isFarmResource))
    return { error: "farms.error_invalid_resources" };
  const resources = normalizeFarmResources(payload.resources);
  if (resources.length === 0) return { error: "farms.error_resources_required" };
  if (coordinates.length > coordinatesMaxLength) return { error: "farms.error_coordinates_too_long" };
  if (note.length > noteMaxLength) return { error: "farms.error_note_too_long" };
  return {
    input: {
      name,
      portal,
      galaxy: payload.galaxy,
      ...(systemName ? { systemName } : {}),
      planetName,
      resources,
      coordinates,
      note,
    },
  };
}

// Lenient reader for stored documents: drops invalid entries instead of failing the whole list.
export function normalizeStoredFarm(value: unknown): Farm | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  const id = text(entry.id);
  const ownerId = entry.ownerId === null ? null : text(entry.ownerId);
  const portal = text(entry.portal).toUpperCase();
  const name = text(entry.name).slice(0, itemNameMaxLength);
  const decoded = decodePortalAddress(portal);
  if (!id || ownerId === "" || !name || decoded?.kind !== "portal" || decoded.errors.length > 0) return null;
  if (!isValidGalaxy(entry.galaxy)) return null;
  const createdAt =
    typeof entry.createdAt === "string" && Number.isFinite(Date.parse(entry.createdAt))
      ? entry.createdAt
      : new Date(0).toISOString();
  const updatedAt =
    typeof entry.updatedAt === "string" && Number.isFinite(Date.parse(entry.updatedAt)) ? entry.updatedAt : "";
  const coordinates = text(entry.coordinates).slice(0, coordinatesMaxLength);
  const note = text(entry.note).slice(0, noteMaxLength);
  const systemName = text(entry.systemName).slice(0, systemNameMaxLength);
  const createdByMemberId = text(entry.createdByMemberId);
  return {
    id,
    name,
    portal,
    galaxy: entry.galaxy,
    ...(systemName ? { systemName } : {}),
    planetName: text(entry.planetName).slice(0, planetNameMaxLength),
    resources: normalizeFarmResources(entry.resources),
    ...(coordinates ? { coordinates } : {}),
    ...(note ? { note } : {}),
    ownerId,
    ...(createdByMemberId ? { createdByMemberId } : {}),
    createdAt,
    ...(updatedAt ? { updatedAt } : {}),
  };
}
