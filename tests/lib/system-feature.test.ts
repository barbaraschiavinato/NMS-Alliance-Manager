import { describe, expect, it } from "vitest";
import { systemFeature } from "@/lib/planets/system-feature";

// Black hole and Atlas addresses were confirmed against the NMS Almanac system endpoint (features: ["black-hole"] / ["atlas"]).
describe("systemFeature", () => {
  it.each([
    ["007902304626", "black-hole"],
    ["007A02304626", "atlas"],
    ["107902304626", "black-hole"],
    ["107a02304626", "atlas"],
    ["007802304626", null],
    ["007B02304626", null],
    ["000002304626", null],
    ["0FFF02304626", null],
  ])("classifies %s as %s", async (portal, expected) => {
    expect(await systemFeature(portal, 0)).toBe(expected);
  });

  it("finds purple systems collapsed into a gas giant, which depends on the galaxy", async () => {
    expect(await systemFeature("03EA02304626", 0)).toBe("gas-giant");
    expect(await systemFeature("03EA02304626", 1)).toBeNull();
    expect(await systemFeature("03ED02304626", 1)).toBe("gas-giant");
    expect(await systemFeature("03EB02304626", 0)).toBeNull();
  });

  it("needs a valid galaxy only for the gas giant", async () => {
    for (const galaxy of [-1, 256, 1.5, Number.NaN]) {
      expect(await systemFeature("03EA02304626", galaxy)).toBeNull();
      expect(await systemFeature("007902304626", galaxy)).toBe("black-hole");
    }
  });

  it("reserves nothing inside the empty gap around the galactic core", async () => {
    expect(await systemFeature("007900000001", 0)).toBeNull();
    expect(await systemFeature("007A00000001", 0)).toBeNull();
  });

  it.each(["", "0123", "007902304626F", "00790230462G"])("ignores the invalid address %j", async (portal) => {
    expect(await systemFeature(portal, 0)).toBeNull();
  });
});
