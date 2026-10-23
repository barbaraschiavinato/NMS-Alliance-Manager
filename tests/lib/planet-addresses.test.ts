import { afterEach, describe, expect, it, vi } from "vitest";

async function loadModule() {
  return import("@/lib/planets/planet-addresses");
}

afterEach(() => {
  vi.doUnmock("@/lib/nms-core/system.js");
  vi.resetModules();
});

describe("getSystemPlanetAddresses", () => {
  it("lists one portal per planet of the system", async () => {
    const { getSystemPlanetAddresses } = await loadModule();
    await expect(getSystemPlanetAddresses("0123456789ab", 0)).resolves.toEqual([
      { portal: "1123456789AB", number: 1 },
      { portal: "2123456789AB", number: 2 },
      { portal: "3123456789AB", number: 3 },
    ]);
  });

  it("returns the same planets from any planet's address", async () => {
    const { getSystemPlanetAddresses } = await loadModule();
    const fromFirst = await getSystemPlanetAddresses("1123456789AB", 0);
    expect(fromFirst.map((planet) => planet.portal)).toEqual(["1123456789AB", "2123456789AB", "3123456789AB"]);
  });

  it("keeps an out-of-range planet index from the given address", async () => {
    const { getSystemPlanetAddresses } = await loadModule();
    await expect(getSystemPlanetAddresses("5123456789AB", 0)).resolves.toEqual([
      { portal: "1123456789AB", number: 1 },
      { portal: "2123456789AB", number: 2 },
      { portal: "3123456789AB", number: 3 },
      { portal: "5123456789AB", number: 4 },
    ]);
  });

  it("depends on the galaxy and system", async () => {
    const { getSystemPlanetAddresses } = await loadModule();
    expect(await getSystemPlanetAddresses("0001FF001001", 0)).toHaveLength(6);
    expect(await getSystemPlanetAddresses("0123456789AC", 0)).toHaveLength(2);
  });

  it.each([0, 7])("rejects a computed planet count of %i", async (count) => {
    vi.doMock("@/lib/nms-core/system.js", () => ({
      planetSeeds: () => ({ planet_seeds: Array.from({ length: count }, () => 0) }),
    }));
    const { getSystemPlanetAddresses } = await loadModule();
    await expect(getSystemPlanetAddresses("0123456789AB", 0)).rejects.toThrow("Invalid system planet count.");
  });
});
