import { describe, expect, it } from "vitest";
import type { Mission } from "@/lib/missions/missions";
import { canMarkPlanetVisited, planetVisitKey } from "@/lib/planets/planet-visits";

const me = { publicId: "me", specialty: "explorer" };
const station = (overrides: Partial<{ portal: string; galaxy: number; ownerId: string }> = {}) => ({
  portal: "0123456789AB",
  galaxy: 0,
  ownerId: "me",
  ...overrides,
});
const mission = (overrides: Partial<Mission> = {}) =>
  ({ id: "m", systemAddress: "0123456789AB", galaxy: 0, assignedMemberId: "me", ...overrides }) as Mission;

describe("planetVisitKey", () => {
  it("combines the galaxy and the upper-cased planet portal", () => {
    expect(planetVisitKey("1123456789ab", 3)).toBe("3:1123456789AB");
  });
});

describe("canMarkPlanetVisited", () => {
  it.each(["explorer", "builder"])("allows a %s with an assigned mission in the system", (specialty) => {
    expect(canMarkPlanetVisited({ ...me, specialty }, [mission()], [], "1123456789AB", 0)).toBe(true);
    expect(canMarkPlanetVisited({ ...me, specialty }, [mission()], [], "6123456789ab", 0)).toBe(true);
  });

  it.each(["ranger", "", "all"])("never allows the specialty %j", (specialty) => {
    expect(canMarkPlanetVisited({ ...me, specialty }, [mission()], [], "1123456789AB", 0)).toBe(false);
  });

  it.each([
    ["a mission assigned to someone else", mission({ assignedMemberId: "other" })],
    ["an unassigned mission", mission({ assignedMemberId: undefined })],
    ["another system", mission({ systemAddress: "0223456789AB" })],
    ["another galaxy", mission({ galaxy: 1 })],
  ])("refuses %s", (_label, other) => {
    expect(canMarkPlanetVisited(me, [other], [], "1123456789AB", 0)).toBe(false);
  });

  it("ignores the first digit of the system address, which only holds the planet index", () => {
    expect(canMarkPlanetVisited(me, [mission({ systemAddress: "3123456789AB" })], [], "1123456789AB", 0)).toBe(true);
    expect(canMarkPlanetVisited(me, [], [], "1123456789AB", 0)).toBe(false);
  });

  describe("station discoverers", () => {
    it.each(["ranger", "", "all", "explorer"])(
      "allow the owner of the system's station whatever the specialty (%j)",
      (specialty) => {
        expect(canMarkPlanetVisited({ ...me, specialty }, [], [station()], "1123456789AB", 0)).toBe(true);
        expect(
          canMarkPlanetVisited({ ...me, specialty }, [], [station({ portal: "7123456789ab" })], "2123456789AB", 0),
        ).toBe(true);
      },
    );

    it.each([
      ["someone else's station", station({ ownerId: "other" })],
      ["another system", station({ portal: "0223456789AB" })],
      ["another galaxy", station({ galaxy: 2 })],
    ])("refuse a ranger for %s", (_label, other) => {
      expect(canMarkPlanetVisited({ ...me, specialty: "ranger" }, [mission()], [other], "1123456789AB", 0)).toBe(false);
    });
  });
});
