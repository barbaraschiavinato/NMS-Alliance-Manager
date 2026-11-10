import { describe, expect, it } from "vitest";
import {
  almanacApiUrl,
  almanacDocumentUrl,
  almanacImageUrl,
  almanacPlanetUrl,
  almanacSiteUrl,
  almanacSystemUrl,
} from "@/lib/almanac/almanac-config";

describe("almanac-config", () => {
  it("derives the API base from the site URL", () => {
    expect(almanacSiteUrl).toBe("https://nmsalmanac.com");
    expect(almanacApiUrl).toBe("https://nmsalmanac.com/api");
  });

  it("builds planet and system request URLs with an uppercase address and the Almanac galaxy number", () => {
    expect(almanacPlanetUrl("10a2b3c4d5e6", 1)).toBe("https://nmsalmanac.com/api/planets/10A2B3C4D5E6?galaxy=1");
    expect(almanacSystemUrl("0a2b3c4d5e6f", 256)).toBe("https://nmsalmanac.com/api/systems/0A2B3C4D5E6F?galaxy=256");
  });

  it("resolves relative API documents such as word tables", () => {
    expect(almanacDocumentUrl("words.en.67a259b0.json")).toBe("https://nmsalmanac.com/api/words.en.67a259b0.json");
    expect(almanacDocumentUrl("/words.en.67a259b0.json")).toBe("https://nmsalmanac.com/api/words.en.67a259b0.json");
  });

  it("returns planet image URLs only for planet picture paths", () => {
    expect(almanacImageUrl("/planets/319035DEF73A/disc.97c529b0.webp")).toBe(
      "https://nmsalmanac.com/api/planets/319035DEF73A/disc.97c529b0.webp",
    );
    expect(almanacImageUrl("https://example.com/disc.webp")).toBeNull();
    expect(almanacImageUrl("/other/disc.webp")).toBeNull();
    expect(almanacImageUrl(undefined)).toBeNull();
    expect(almanacImageUrl(42)).toBeNull();
  });
});
