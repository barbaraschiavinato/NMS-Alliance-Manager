import { describe, expect, it } from "vitest";
import { almanacDiscoveryCounts } from "@/lib/almanac-discovery-counts";

describe("almanacDiscoveryCounts", () => {
  it("reads the Almanac discovery totals, not resource list lengths", () => {
    expect(
      almanacDiscoveryCounts({
        flora: { word: "Bountiful", note: "19 plants" },
        fauna: { word: "Rare", note: "12 species" },
        minerals: { word: "23" },
      }),
    ).toEqual({ flora: 19, fauna: 12, minerals: 23 });
  });

  it("preserves zero and accepts numeric counts and whitespace", () => {
    expect(
      almanacDiscoveryCounts({
        flora: { note: 0 },
        fauna: { note: " 0 species " },
        minerals: { word: 23 },
      }),
    ).toEqual({ flora: 0, fauna: 0, minerals: 23 });
  });

  it.each([undefined, null, [], "none", 3])("ignores a malformed or missing band: %j", (band) => {
    expect(almanacDiscoveryCounts(band)).toEqual({});
  });

  it.each([undefined, null, [], "Rare", {}, { word: "Bountiful" }])(
    "omits missing or malformed discovery facts: %j",
    (flora) => {
      expect(almanacDiscoveryCounts({ flora })).toEqual({});
    },
  );

  it.each(["", "Unknown", "-1 plants", "1.5 plants", "12 plants extra", -1, 1.5, Infinity, NaN, 9007199254740992])(
    "does not invent counts from invalid values: %j",
    (value) => {
      expect(almanacDiscoveryCounts({ flora: { note: value } })).toEqual({});
    },
  );

  it("keeps available totals when other values are missing", () => {
    expect(almanacDiscoveryCounts({ fauna: { note: "1 species" } })).toEqual({ fauna: 1 });
  });
});
