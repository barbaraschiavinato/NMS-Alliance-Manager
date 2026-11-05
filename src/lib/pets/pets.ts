import { decodePortalAddress } from "@/lib/missions/missions";

export const petTypes = [
  "tropical",
  "fire",
  "frost",
  "radioactive",
  "toxic",
  "desert",
  "mechanical",
  "anomalous",
] as const;
export type PetType = (typeof petTypes)[number];

export function isPetType(value: unknown): value is PetType {
  return petTypes.includes(value as PetType);
}

export const petActivities = [
  "unknown",
  "always",
  "diurnal",
  "mostly_diurnal",
  "nocturnal",
  "mostly_nocturnal",
] as const;
export type PetActivity = (typeof petActivities)[number];

export function isPetActivity(value: unknown): value is PetActivity {
  return petActivities.includes(value as PetActivity);
}

export const petHabitats = [
  "unknown",
  "ground",
  "flying",
  "underground",
  "underwater",
  "deep_water",
  "mountain",
] as const;
export type PetHabitat = (typeof petHabitats)[number];

export function isPetHabitat(value: unknown): value is PetHabitat {
  return petHabitats.includes(value as PetHabitat);
}

export const petRarities = ["unknown", "common", "uncommon", "rare"] as const;
export type PetRarity = (typeof petRarities)[number];

export function isPetRarity(value: unknown): value is PetRarity {
  return petRarities.includes(value as PetRarity);
}

export const petClassGrades = ["S", "A", "B", "C"] as const;
export type PetClassGrade = (typeof petClassGrades)[number];
export const petClassColors: Readonly<Record<PetClassGrade, string>> = {
  C: "#3C9B76",
  B: "#347DD0",
  A: "#9D43C9",
  S: "#F5AD19",
};

export const petClassKeys = ["combat", "agility", "health"] as const;
export type PetClassKey = (typeof petClassKeys)[number];

export function isPetClassGrade(value: unknown): value is PetClassGrade {
  return petClassGrades.includes(value as PetClassGrade);
}

export const petImageTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export const petImageMaxBytes = 5 * 1024 * 1024;

export const petNameMaxLength = 80;
export const petPlanetNameMaxLength = 80;
export const petCoordinatesMaxLength = 60;
export const petNoteMaxLength = 1000;

export const petImagePathPattern = /^alliance-manager\/pets\/[a-f0-9-]{36}\.(jpg|png|webp|avif)$/i;

export type PetClasses = Readonly<Record<PetClassKey, PetClassGrade>>;

export type PetInput = Readonly<{
  name: string;
  petType: PetType;
  activity: PetActivity;
  habitat: PetHabitat;
  rarity: PetRarity;
  eggTradeAvailable: boolean;
  classes: PetClasses;
  portal: string;
  galaxy: number;
  planetName: string;
  coordinates: string;
  note: string;
}>;

export type Pet = Readonly<{
  id: string;
  name: string;
  petType: PetType;
  activity: PetActivity;
  habitat: PetHabitat;
  rarity: PetRarity;
  eggTradeAvailable: boolean;
  classes: PetClasses;
  portal: string;
  galaxy: number;
  planetName: string;
  coordinates?: string;
  note?: string;
  // Pathname of the stored image; the API exposes it as `imageUrl`.
  imagePath?: string;
  // The discoverer; null for unassigned pets, which only staff can manage.
  ownerId: string | null;
  createdByMemberId?: string;
  createdAt: string;
  updatedAt?: string;
}>;

function isValidGalaxy(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseClasses(value: unknown): PetClasses | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  const { combat, agility, health } = entry;
  if (!isPetClassGrade(combat) || !isPetClassGrade(agility) || !isPetClassGrade(health)) return null;
  return { combat, agility, health };
}

// Validates a create/update payload; returns the translation key of the first error.
export function parsePetInput(value: unknown): { input: PetInput } | { error: string } {
  const payload = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const name = text(payload.name);
  const portal = text(payload.portal).toUpperCase();
  const planetName = text(payload.planetName);
  const coordinates = text(payload.coordinates);
  const note = text(payload.note);
  const decoded = decodePortalAddress(portal);
  if (!name) return { error: "pets.error_name_required" };
  if (name.length > petNameMaxLength) return { error: "pets.error_name_too_long" };
  if (!isPetType(payload.petType)) return { error: "pets.error_type_required" };
  if (!isPetActivity(payload.activity)) return { error: "pets.error_invalid_activity" };
  if (!isPetHabitat(payload.habitat)) return { error: "pets.error_invalid_habitat" };
  if (!isPetRarity(payload.rarity)) return { error: "pets.error_invalid_rarity" };
  if (typeof payload.eggTradeAvailable !== "boolean") return { error: "pets.error_invalid_egg_trade" };
  const classes = parseClasses(payload.classes);
  if (!classes) return { error: "pets.error_classes_required" };
  if (decoded?.kind !== "portal" || decoded.errors.length > 0 || !isValidGalaxy(payload.galaxy))
    return { error: "farms.error_invalid_portal_and_galaxy" };
  if (!planetName) return { error: "farms.error_planet_name_required" };
  if (planetName.length > petPlanetNameMaxLength) return { error: "farms.error_planet_name_too_long" };
  if (coordinates.length > petCoordinatesMaxLength) return { error: "farms.error_coordinates_too_long" };
  if (note.length > petNoteMaxLength) return { error: "farms.error_note_too_long" };
  return {
    input: {
      name,
      petType: payload.petType,
      activity: payload.activity,
      habitat: payload.habitat,
      rarity: payload.rarity,
      eggTradeAvailable: payload.eggTradeAvailable,
      classes,
      portal,
      galaxy: payload.galaxy,
      planetName,
      coordinates,
      note,
    },
  };
}

// Lenient reader for stored documents: drops invalid entries instead of failing the whole list.
export function normalizeStoredPet(value: unknown): Pet | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  const id = text(entry.id);
  const ownerId = entry.ownerId === null ? null : text(entry.ownerId);
  const portal = text(entry.portal).toUpperCase();
  const name = text(entry.name).slice(0, petNameMaxLength);
  const decoded = decodePortalAddress(portal);
  const classes = parseClasses(entry.classes);
  if (!id || ownerId === "" || !name || !classes || !isPetType(entry.petType)) return null;
  if (decoded?.kind !== "portal" || decoded.errors.length > 0 || !isValidGalaxy(entry.galaxy)) return null;
  const createdAt =
    typeof entry.createdAt === "string" && Number.isFinite(Date.parse(entry.createdAt))
      ? entry.createdAt
      : new Date(0).toISOString();
  const updatedAt =
    typeof entry.updatedAt === "string" && Number.isFinite(Date.parse(entry.updatedAt)) ? entry.updatedAt : "";
  const coordinates = text(entry.coordinates).slice(0, petCoordinatesMaxLength);
  const note = text(entry.note).slice(0, petNoteMaxLength);
  const imagePath = text(entry.imagePath);
  const createdByMemberId = text(entry.createdByMemberId);
  return {
    id,
    name,
    petType: entry.petType,
    activity: isPetActivity(entry.activity) ? entry.activity : "unknown",
    habitat: isPetHabitat(entry.habitat) ? entry.habitat : "unknown",
    rarity: isPetRarity(entry.rarity) ? entry.rarity : "unknown",
    eggTradeAvailable: entry.eggTradeAvailable === true,
    classes,
    portal,
    galaxy: entry.galaxy,
    planetName: text(entry.planetName).slice(0, petPlanetNameMaxLength),
    ...(coordinates ? { coordinates } : {}),
    ...(note ? { note } : {}),
    ...(petImagePathPattern.test(imagePath) ? { imagePath } : {}),
    ownerId,
    ...(createdByMemberId ? { createdByMemberId } : {}),
    createdAt,
    ...(updatedAt ? { updatedAt } : {}),
  };
}

export type PetFilterValues = Readonly<{
  petType: string;
  activity: string;
  habitat: string;
  rarity: string;
  eggTrade: "" | "yes" | "no";
  combat: string;
  agility: string;
  health: string;
}>;

export const emptyPetFilters: PetFilterValues = {
  petType: "",
  activity: "",
  habitat: "",
  rarity: "",
  eggTrade: "",
  combat: "",
  agility: "",
  health: "",
};

export function hasActivePetFilters(filters: PetFilterValues) {
  return Object.values(filters).some(Boolean);
}

export function petMatchesFilters(pet: Pet, filters: PetFilterValues) {
  return (
    (!filters.petType || pet.petType === filters.petType) &&
    (!filters.activity || pet.activity === filters.activity) &&
    (!filters.habitat || pet.habitat === filters.habitat) &&
    (!filters.rarity || pet.rarity === filters.rarity) &&
    (!filters.eggTrade || pet.eggTradeAvailable === (filters.eggTrade === "yes")) &&
    petClassKeys.every((key) => !filters[key] || pet.classes[key] === filters[key])
  );
}
