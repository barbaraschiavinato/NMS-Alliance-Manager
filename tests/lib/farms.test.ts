import { describe, expect, it } from "vitest";
import {
  farmMaterials,
  farmPlants,
  isFarmPlant,
  isFarmResource,
  normalizeFarmResources,
  normalizeStoredFarm,
  parseFarmInput,
} from "@/lib/farms/farms";

const valid = {
  name: "  Copper hill ",
  portal: "0123456789ab",
  galaxy: 3,
  systemName: "  Yestara  ",
  planetName: " Ruba Prime ",
  resources: ["Frost Crystal", "Copper", "Copper"],
  coordinates: " +12.3, -45.6 ",
  note: " Bring a hazard suit ",
};

describe("farm resource catalogues", () => {
  it("contains unique materials and plants that don't overlap", () => {
    const all = [...farmMaterials, ...farmPlants];
    expect(new Set(all).size).toBe(all.length);
    expect(isFarmPlant("Frost Crystal")).toBe(true);
    expect(isFarmPlant("Copper")).toBe(false);
    expect(isFarmResource("Copper")).toBe(true);
    expect(isFarmResource("Unobtainium")).toBe(false);
    expect(isFarmResource(42)).toBe(false);
  });

  it("normalizes resources without duplicates, unknown values, in catalogue order", () => {
    expect(normalizeFarmResources(["Frost Crystal", "Copper", "Nope", "Copper"])).toEqual(["Copper", "Frost Crystal"]);
    expect(normalizeFarmResources("Copper")).toEqual([]);
  });

  it("lists only resources obtainable with mineral or gas extractors", () => {
    expect(farmMaterials).toEqual([
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
    ]);
    for (const resource of ["Carbon", "Runaway Mould", "Storm Crystal", "Tritium", "Ancient Bones"]) {
      expect(isFarmResource(resource)).toBe(false);
    }
  });

  it("lists only cultivable plants", () => {
    expect(farmPlants).toEqual([
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
    ]);
    expect(isFarmPlant("Marrow Bulb")).toBe(false);
    expect(isFarmResource("Kelp Sac")).toBe(false);
    expect(normalizeFarmResources(["Mordite", "Marrow Bulb", "Basalt"])).toEqual(["Basalt", "Mordite"]);
    expect(parseFarmInput({ ...valid, resources: ["Basalt", "Mordite"] })).toMatchObject({
      input: { resources: ["Basalt", "Mordite"] },
    });
  });
});

describe("parseFarmInput", () => {
  it("trims, uppercases the portal and keeps optional fields", () => {
    expect(parseFarmInput(valid)).toEqual({
      input: {
        name: "Copper hill",
        portal: "0123456789AB",
        galaxy: 3,
        systemName: "Yestara",
        planetName: "Ruba Prime",
        resources: ["Copper", "Frost Crystal"],
        coordinates: "+12.3, -45.6",
        note: "Bring a hazard suit",
      },
    });
  });

  it("accepts a farm without coordinates or notes", () => {
    const result = parseFarmInput({ ...valid, coordinates: undefined, note: undefined });
    expect(result).toMatchObject({ input: { coordinates: "", note: "" } });
  });

  it.each([undefined, "", "   "])("accepts an absent or empty system name: %j", (systemName) => {
    const result = parseFarmInput({ ...valid, systemName });
    expect(result).toHaveProperty("input");
    expect("input" in result && result.input).not.toHaveProperty("systemName");
  });

  it.each([
    [{ name: " " }, "farms.error_name_required"],
    [{ name: "x".repeat(81) }, "farms.error_name_too_long"],
    [{ portal: "0123" }, "farms.error_invalid_portal_and_galaxy"],
    [{ galaxy: 256 }, "farms.error_invalid_portal_and_galaxy"],
    [{ galaxy: "3" }, "farms.error_invalid_portal_and_galaxy"],
    [{ systemName: 42 }, "farms.error_invalid_system_name"],
    [{ systemName: "x".repeat(81) }, "farms.error_system_name_too_long"],
    [{ planetName: "" }, "farms.error_planet_name_required"],
    [{ planetName: "x".repeat(81) }, "farms.error_planet_name_too_long"],
    [{ resources: ["Copper", "Unobtainium"] }, "farms.error_invalid_resources"],
    [{ resources: ["Carbon"] }, "farms.error_invalid_resources"],
    [{ resources: "Copper" }, "farms.error_invalid_resources"],
    [{ resources: [] }, "farms.error_resources_required"],
    [{ coordinates: "x".repeat(61) }, "farms.error_coordinates_too_long"],
    [{ note: "x".repeat(1001) }, "farms.error_note_too_long"],
  ])("rejects %o", (override, error) => {
    expect(parseFarmInput({ ...valid, ...override })).toEqual({ error });
  });

  it("rejects non-object payloads", () => {
    expect(parseFarmInput(null)).toEqual({ error: "farms.error_name_required" });
    expect(parseFarmInput([valid])).toEqual({ error: "farms.error_name_required" });
  });
});

describe("normalizeStoredFarm", () => {
  const stored = {
    id: "farm-1",
    name: "Copper hill",
    portal: "0123456789ab",
    galaxy: 0,
    planetName: "Ruba",
    resources: ["Copper", "Gone"],
    ownerId: "owner",
    createdAt: "2026-05-01T12:00:00.000Z",
  };

  it("keeps valid entries and drops unknown resources", () => {
    expect(normalizeStoredFarm(stored)).toEqual({ ...stored, portal: "0123456789AB", resources: ["Copper"] });
  });

  it("keeps a trimmed system name while accepting legacy farms without one", () => {
    expect(normalizeStoredFarm({ ...stored, systemName: " Eos " })).toMatchObject({ systemName: "Eos" });
    expect(normalizeStoredFarm({ ...stored, systemName: "x".repeat(81) })).toMatchObject({
      systemName: "x".repeat(80),
    });
    expect(normalizeStoredFarm(stored)).not.toHaveProperty("systemName");
  });

  it("fills a missing creation date and keeps optional fields only when present", () => {
    const farm = normalizeStoredFarm({
      ...stored,
      createdAt: "nope",
      updatedAt: "2026-05-02T12:00:00.000Z",
      coordinates: " 1, 2 ",
      note: " hi ",
      createdByMemberId: "creator",
    });
    expect(farm).toMatchObject({
      createdAt: new Date(0).toISOString(),
      updatedAt: "2026-05-02T12:00:00.000Z",
      coordinates: "1, 2",
      note: "hi",
      createdByMemberId: "creator",
    });
  });

  it.each([
    null,
    [],
    "farm",
    { ...stored, id: "" },
    { ...stored, ownerId: "" },
    { ...stored, portal: "XYZ" },
    { ...stored, galaxy: -1 },
    { ...stored, name: " " },
  ])("drops invalid entry %#", (entry) => {
    expect(normalizeStoredFarm(entry)).toBeNull();
  });
});
