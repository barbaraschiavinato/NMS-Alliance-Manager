import { describe, expect, it } from "vitest";
import { almanacStarCount, almanacSystemFacts, almanacWealth, almanacWord } from "@/lib/almanac/almanac-facts";

describe("almanacWealth", () => {
  it.each([
    [{ marks: [{ word: "Destitute" }] }, "Destitute"],
    [{ marks: [{}, { word: "Promising" }, { word: "Other" }] }, "Promising"],
    [{ marks: [] }, undefined],
    [{ marks: [{ word: 1 }, null] }, undefined],
    [{ marks: "Affluent" }, undefined],
    [{}, undefined],
    [null, undefined],
    [[], undefined],
  ])("reads the wealth word of %j", (economy, expected) => {
    expect(almanacWealth(economy)).toBe(expected);
  });
});

describe("almanac facts helpers", () => {
  it("reads words and clamps economy stars", () => {
    expect(almanacWord({ word: "Gek" })).toBe("Gek");
    expect(almanacWord({ word: 1 })).toBeUndefined();
    expect(almanacStarCount({ stars: 2.7 })).toBe(2);
    expect(almanacStarCount({ stars: 9 })).toBe(3);
    expect(almanacStarCount({ stars: -1 })).toBe(0);
    expect(almanacStarCount({ stars: Number.NaN })).toBeUndefined();
    expect(almanacStarCount({})).toBeUndefined();
  });

  it("lists the system facts that have a value, in display order", () => {
    expect(
      almanacSystemFacts({ race: { word: "Gek" }, star: { word: "Blue" }, conflict: {}, economy: { word: "Trading" } }),
    ).toEqual([
      { label: "planet.star", value: "Blue" },
      { label: "common.economy", value: "Trading" },
      { label: "common.race", value: "Gek" },
    ]);
    expect(almanacSystemFacts(null)).toEqual([]);
    expect(almanacSystemFacts(undefined)).toEqual([]);
  });
});
