import { describe, expect, it } from "vitest";
import {
  isPetActivity,
  isPetClassGrade,
  isPetHabitat,
  isPetRarity,
  isPetType,
  emptyPetFilters,
  hasActivePetFilters,
  normalizeStoredPet,
  parsePetInput,
  petMatchesFilters,
  petClassGrades,
  petImagePathPattern,
} from "@/lib/pets/pets";

const input = {
  name: "  Fluffy  ",
  petType: "frost",
  activity: "nocturnal",
  habitat: "mountain",
  rarity: "rare",
  eggTradeAvailable: true,
  classes: { combat: "S", agility: "A", health: "B" },
  portal: "0123456789ab",
  galaxy: 0,
  planetName: " Ruba ",
  coordinates: " +1, -2 ",
  note: " friendly ",
};

describe("pet option guards", () => {
  it("accepts only the known values", () => {
    expect(isPetType("fire")).toBe(true);
    expect(isPetType("water")).toBe(false);
    expect(isPetActivity("mostly_diurnal")).toBe(true);
    expect(isPetActivity("sleepy")).toBe(false);
    expect(isPetHabitat("deep_water")).toBe(true);
    expect(isPetHabitat("space")).toBe(false);
    expect(isPetRarity("uncommon")).toBe(true);
    expect(isPetRarity("epic")).toBe(false);
    expect(isPetClassGrade("S")).toBe(true);
    expect(isPetClassGrade("D")).toBe(false);
  });

  it("lists the class grades best first", () => {
    expect(petClassGrades).toEqual(["S", "A", "B", "C"]);
  });
});

describe("parsePetInput", () => {
  it("trims the text and uppercases the portal", () => {
    expect(parsePetInput(input)).toEqual({
      input: {
        ...input,
        name: "Fluffy",
        portal: "0123456789AB",
        planetName: "Ruba",
        coordinates: "+1, -2",
        note: "friendly",
      },
    });
  });

  it.each([
    ["no payload", undefined, "pets.error_name_required"],
    ["a missing name", { ...input, name: " " }, "pets.error_name_required"],
    ["a long name", { ...input, name: "x".repeat(81) }, "pets.error_name_too_long"],
    ["an unknown type", { ...input, petType: "water" }, "pets.error_type_required"],
    ["an unknown activity", { ...input, activity: "sleepy" }, "pets.error_invalid_activity"],
    ["an unknown habitat", { ...input, habitat: "space" }, "pets.error_invalid_habitat"],
    ["an unknown rarity", { ...input, rarity: "epic" }, "pets.error_invalid_rarity"],
    ["a non boolean egg trade", { ...input, eggTradeAvailable: "yes" }, "pets.error_invalid_egg_trade"],
    ["missing classes", { ...input, classes: undefined }, "pets.error_classes_required"],
    ["an invalid class grade", { ...input, classes: { ...input.classes, health: "D" } }, "pets.error_classes_required"],
    ["an invalid portal", { ...input, portal: "XYZ" }, "farms.error_invalid_portal_and_galaxy"],
    ["an invalid galaxy", { ...input, galaxy: 256 }, "farms.error_invalid_portal_and_galaxy"],
    ["a missing planet name", { ...input, planetName: "" }, "farms.error_planet_name_required"],
    ["a long planet name", { ...input, planetName: "x".repeat(81) }, "farms.error_planet_name_too_long"],
    ["long coordinates", { ...input, coordinates: "x".repeat(61) }, "farms.error_coordinates_too_long"],
    ["a long note", { ...input, note: "x".repeat(1001) }, "farms.error_note_too_long"],
  ])("rejects %s", (_label, payload, error) => {
    expect(parsePetInput(payload)).toEqual({ error });
  });
});

describe("normalizeStoredPet", () => {
  const stored = {
    id: "pet-1",
    name: "Fluffy",
    petType: "frost",
    activity: "diurnal",
    habitat: "ground",
    rarity: "common",
    eggTradeAvailable: true,
    classes: { combat: "C", agility: "B", health: "A" },
    portal: "0123456789AB",
    galaxy: 3,
    planetName: "Ruba",
    coordinates: "+1, -2",
    note: "hello",
    imagePath: "alliance-manager/pets/11111111-2222-4333-8444-555555555555.png",
    ownerId: "owner",
    createdByMemberId: "creator",
    createdAt: "2026-05-01T12:00:00.000Z",
    updatedAt: "2026-05-02T12:00:00.000Z",
  };

  it("keeps a valid entry unchanged", () => {
    expect(normalizeStoredPet(stored)).toEqual(stored);
  });

  it("keeps unassigned pets", () => {
    expect(normalizeStoredPet({ ...stored, ownerId: null })).toEqual({ ...stored, ownerId: null });
  });

  it("falls back to defaults for optional or unknown fields", () => {
    const pet = normalizeStoredPet({
      id: "pet-2",
      name: "Bare",
      petType: "toxic",
      classes: stored.classes,
      portal: "0123456789ab",
      galaxy: 0,
      ownerId: "owner",
      createdAt: "not a date",
      updatedAt: "nope",
      activity: "sleepy",
      imagePath: "../etc/passwd",
    });
    expect(pet).toEqual({
      id: "pet-2",
      name: "Bare",
      petType: "toxic",
      activity: "unknown",
      habitat: "unknown",
      rarity: "unknown",
      eggTradeAvailable: false,
      classes: stored.classes,
      portal: "0123456789AB",
      galaxy: 0,
      planetName: "",
      ownerId: "owner",
      createdAt: new Date(0).toISOString(),
    });
  });

  it.each([
    ["a non object", "pet"],
    ["an array", []],
    ["a missing id", { ...stored, id: "" }],
    ["an empty owner", { ...stored, ownerId: "" }],
    ["a missing name", { ...stored, name: " " }],
    ["an unknown type", { ...stored, petType: "water" }],
    ["invalid classes", { ...stored, classes: { combat: "S" } }],
    ["an invalid portal", { ...stored, portal: "XYZ" }],
    ["an invalid galaxy", { ...stored, galaxy: 999 }],
  ])("drops %s", (_label, value) => {
    expect(normalizeStoredPet(value)).toBeNull();
  });
});

describe("petImagePathPattern", () => {
  it("only accepts pet image pathnames", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    expect(petImagePathPattern.test(`alliance-manager/pets/${id}.png`)).toBe(true);
    expect(petImagePathPattern.test(`alliance-manager/pets/${id}.avif`)).toBe(true);
    expect(petImagePathPattern.test(`alliance-manager/branding/${id}.png`)).toBe(false);
    expect(petImagePathPattern.test(`alliance-manager/pets/../${id}.png`)).toBe(false);
    expect(petImagePathPattern.test(`alliance-manager/pets/${id}.svg`)).toBe(false);
  });
});

describe("pet filters", () => {
  const pet = normalizeStoredPet({
    id: "pet-1",
    name: "Fluffy",
    petType: "frost",
    activity: "nocturnal",
    habitat: "mountain",
    rarity: "rare",
    eggTradeAvailable: true,
    classes: { combat: "S", agility: "A", health: "B" },
    portal: "0123456789AB",
    galaxy: 0,
    ownerId: "owner",
    createdAt: "2026-05-01T12:00:00.000Z",
  })!;

  it("detects active filters", () => {
    expect(hasActivePetFilters(emptyPetFilters)).toBe(false);
    expect(hasActivePetFilters({ ...emptyPetFilters, eggTrade: "no" })).toBe(true);
  });

  it("matches everything without filters and every filter alone", () => {
    expect(petMatchesFilters(pet, emptyPetFilters)).toBe(true);
    for (const filters of [
      { petType: "frost" },
      { activity: "nocturnal" },
      { habitat: "mountain" },
      { rarity: "rare" },
      { eggTrade: "yes" },
      { combat: "S" },
      { agility: "A" },
      { health: "B" },
    ] as const) {
      expect(petMatchesFilters(pet, { ...emptyPetFilters, ...filters }), JSON.stringify(filters)).toBe(true);
    }
  });

  it("rejects pets that differ in any filtered field and combines the filters", () => {
    for (const filters of [
      { petType: "fire" },
      { activity: "diurnal" },
      { habitat: "ground" },
      { rarity: "common" },
      { eggTrade: "no" },
      { combat: "C" },
      { agility: "S" },
      { health: "A" },
    ] as const) {
      expect(petMatchesFilters(pet, { ...emptyPetFilters, ...filters }), JSON.stringify(filters)).toBe(false);
    }
    expect(petMatchesFilters(pet, { ...emptyPetFilters, petType: "frost", combat: "S" })).toBe(true);
    expect(petMatchesFilters(pet, { ...emptyPetFilters, petType: "frost", combat: "A" })).toBe(false);
  });
});
