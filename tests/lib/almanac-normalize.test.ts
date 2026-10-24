import { beforeEach, describe, expect, it, vi } from "vitest";
import { almanacWords, structuredPlanet, structuredSystem } from "../helpers/almanac";
import { almanacDiscoveryCounts } from "@/lib/almanac/almanac-discovery-counts";

beforeEach(() => {
  vi.resetModules();
});

function stubDocuments(words: unknown = almanacWords, system: unknown = structuredSystem) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
    Response.json(String(input).includes("/systems/") ? system : words),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("normalizeAlmanacPlanet", () => {
  it.each([undefined, {}])("normalizes galaxy image queries in raw and already adapted planets: %j", async (lines) => {
    const fetchMock = stubDocuments();
    const { normalizeAlmanacPlanet } = await import("@/lib/almanac/almanac-normalize");
    const disc = "planets/20B705693DD3/disc.8d7140a1.webp?galaxy=10";
    const result = await normalizeAlmanacPlanet({ ...structuredPlanet, lines, pictures: { disc } });
    expect(result.pictures).toEqual({ disc: `/${disc}` });
    if (lines) expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "planets/../disc.webp?galaxy=10",
    "planets/x.webp?galaxy=0",
    "planets/x.webp?galaxy=257",
    "planets/x.webp?galaxy=10&other=value",
    "https://other.example/disc.webp?galaxy=10",
    "/planets/x.webp?galaxy=10",
  ])("preserves unsupported or already absolute image paths: %s", async (disc) => {
    const { normalizeAlmanacPictures } = await import("@/lib/almanac/almanac-normalize");
    const planet = { pictures: { disc } };
    expect(normalizeAlmanacPictures(planet)).toBe(planet);
  });

  it("preserves legacy responses without network requests", async () => {
    const fetchMock = stubDocuments();
    const { normalizeAlmanacPlanet } = await import("@/lib/almanac/almanac-normalize");
    const legacy = { portal: "1234567890AB", lines: { band: { type: { word: "Lush" } } } };
    expect(await normalizeAlmanacPlanet(legacy)).toBe(legacy);
    expect(await normalizeAlmanacPlanet({ ...legacy, kind: "planet" })).toEqual({ ...legacy, kind: "planet" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adapts names, descriptions, system facts, counts, resources, colours and image paths", async () => {
    const fetchMock = stubDocuments();
    const { normalizeAlmanacPlanet } = await import("@/lib/almanac/almanac-normalize");
    const planet = await normalizeAlmanacPlanet(structuredPlanet);
    expect(planet).toMatchObject({
      name: "Test World",
      dialable: true,
      sky: { day: "#AABBCC", night: "#112233" },
      tints: { terrain: "#112233" },
      pictures: { disc: "/planets/1234567890AB/disc.test.webp" },
      carries: [
        { name: "Copper", kind: "mineral" },
        { name: "Star Bulb", kind: "plant" },
      ],
      lines: {
        headline: { word: "Test World" },
        line: "Lush Planet",
        band: {
          type: { word: "Lush" },
          size: { word: "Large" },
          features: [{ word: "Rings" }],
          water: { word: "Ocean" },
          weather: { word: "Calm" },
          sentinels: { word: "Corrupted", ink: "exotic" },
          fauna: { word: "Typical", note: "0 species" },
          flora: { word: "Bountiful", note: "19 plants" },
          minerals: { word: "23" },
          star: { word: "Yellow" },
          race: { word: "Gek" },
          economy: { word: "Trading", stars: 3, black_market: false, marks: [{ word: "Wealthy" }] },
          conflict: { word: "Low" },
        },
      },
    });
    const lines = planet.lines as { band: Record<string, unknown> };
    expect(almanacDiscoveryCounts(lines.band)).toEqual({ flora: 19, fauna: 0, minerals: 23 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://nmsalmanac.com/api/systems/0234567890AB?galaxy=1",
      expect.anything(),
    );
    expect(await normalizeAlmanacPlanet(planet)).toBe(planet);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares dictionary and system requests between planets in the same system", async () => {
    const fetchMock = stubDocuments();
    const { normalizeAlmanacPlanet } = await import("@/lib/almanac/almanac-normalize");
    await Promise.all([
      normalizeAlmanacPlanet(structuredPlanet),
      normalizeAlmanacPlanet({
        ...structuredPlanet,
        portal: "2234567890AB",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("marks outlaw systems without inventing an economy star rating", async () => {
    stubDocuments(almanacWords, { ...structuredSystem, wealth: { level: "outlaw" } });
    const { normalizeAlmanacPlanet } = await import("@/lib/almanac/almanac-normalize");
    const planet = await normalizeAlmanacPlanet(structuredPlanet);
    expect(planet).toMatchObject({ lines: { band: { economy: { black_market: true } } } });
    expect((planet.lines as { band: { economy: unknown } }).band.economy).not.toHaveProperty("stars");
  });

  it.each([
    { words: undefined },
    { words: "https://other.example/words.json" },
    { system: undefined },
    { system: "../invalid" },
    { galaxy: "1" },
    { galaxy: 1.5 },
    { galaxy: 0 },
    { galaxy: 257 },
  ])("rejects invalid metadata before making requests: %j", async (overrides) => {
    const fetchMock = stubDocuments();
    const { normalizeAlmanacPlanet } = await import("@/lib/almanac/almanac-normalize");
    await expect(normalizeAlmanacPlanet({ ...structuredPlanet, ...overrides })).rejects.toThrow("metadata");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([{ kind: "planet" }, { portal: undefined }, { portal: "000000000000" }, { galaxy: 2 }])(
    "rejects a mismatched system: %j",
    async (overrides) => {
      stubDocuments(almanacWords, { ...structuredSystem, ...overrides });
      const { normalizeAlmanacPlanet } = await import("@/lib/almanac/almanac-normalize");
      await expect(normalizeAlmanacPlanet(structuredPlanet)).rejects.toThrow("mismatched system");
    },
  );

  it("retries failed metadata requests instead of caching failures", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/systems/") ? Response.json(structuredSystem) : new Response("", { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { normalizeAlmanacPlanet } = await import("@/lib/almanac/almanac-normalize");
    await expect(normalizeAlmanacPlanet(structuredPlanet)).rejects.toThrow("500");
    fetchMock.mockImplementation(async (input) =>
      Response.json(String(input).includes("/systems/") ? structuredSystem : almanacWords),
    );
    await expect(normalizeAlmanacPlanet(structuredPlanet)).resolves.toHaveProperty("lines");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops calling the Almanac for the Retry-After period after a 429", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("/systems/")
          ? Response.json(structuredSystem)
          : new Response("", { status: 429, headers: { "Retry-After": "30" } }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const { normalizeAlmanacPlanet } = await import("@/lib/almanac/almanac-normalize");
      await expect(normalizeAlmanacPlanet(structuredPlanet)).rejects.toThrow("429");
      fetchMock.mockClear();
      await expect(normalizeAlmanacPlanet(structuredPlanet)).rejects.toThrow("429");
      expect(fetchMock).not.toHaveBeenCalled();

      vi.setSystemTime(Date.now() + 31_000);
      fetchMock.mockImplementation(async (input) =>
        Response.json(String(input).includes("/systems/") ? structuredSystem : almanacWords),
      );
      await expect(normalizeAlmanacPlanet(structuredPlanet)).resolves.toHaveProperty("lines");
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([null, [], "invalid"])("rejects an invalid dictionary document: %j", async (words) => {
    stubDocuments(words);
    const { normalizeAlmanacPlanet } = await import("@/lib/almanac/almanac-normalize");
    await expect(normalizeAlmanacPlanet(structuredPlanet)).rejects.toThrow("invalid document");
  });

  it("rejects and retries dictionaries without the required sections", async () => {
    const fetchMock = stubDocuments({});
    const { normalizeAlmanacPlanet } = await import("@/lib/almanac/almanac-normalize");
    await expect(normalizeAlmanacPlanet(structuredPlanet)).rejects.toThrow("invalid dictionary");
    fetchMock.mockImplementation(async (input) =>
      Response.json(String(input).includes("/systems/") ? structuredSystem : almanacWords),
    );
    await expect(normalizeAlmanacPlanet(structuredPlanet)).resolves.toHaveProperty("lines");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("refreshes a cached planet when its versioned word table has expired", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("words.en.expired.json")) return new Response("", { status: 404 });
      return Response.json(
        url.includes("/planets/") ? structuredPlanet : url.includes("/systems/") ? structuredSystem : almanacWords,
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { normalizeAlmanacPlanet } = await import("@/lib/almanac/almanac-normalize");
    const result = await normalizeAlmanacPlanet({
      ...structuredPlanet,
      words: "words.en.expired.json",
      flora: { plants: 999 },
    });
    expect(result).toMatchObject({ words: structuredPlanet.words, lines: { band: { flora: { note: "19 plants" } } } });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(info).toHaveBeenCalled();
  });

  it.each(["unchanged", "wrong-portal", "wrong-galaxy", "missing", "second-expired"])(
    "fails explicitly rather than looping when refreshing an expired dictionary fails: %s",
    async (scenario) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("/words.")) return new Response("", { status: 404 });
          const fresh = {
            ...structuredPlanet,
            words: scenario === "unchanged" ? "words.en.expired.json" : structuredPlanet.words,
            portal: scenario === "wrong-portal" ? "2234567890AB" : structuredPlanet.portal,
            galaxy: scenario === "wrong-galaxy" ? 2 : 1,
          };
          return Response.json(scenario === "missing" ? {} : fresh);
        }),
      );
      vi.spyOn(console, "info").mockImplementation(() => undefined);
      const { normalizeAlmanacPlanet } = await import("@/lib/almanac/almanac-normalize");
      await expect(normalizeAlmanacPlanet({ ...structuredPlanet, words: "words.en.expired.json" })).rejects.toThrow();
    },
  );

  it("keeps missing data missing and preserves unsafe or non-string image values for existing UI guards", async () => {
    stubDocuments(almanacWords, {
      ...structuredSystem,
      economy: [],
      wealth: null,
      conflict: "none",
      star: 2,
      race: null,
    });
    const { normalizeAlmanacPlanet } = await import("@/lib/almanac/almanac-normalize");
    const result = await normalizeAlmanacPlanet({
      ...structuredPlanet,
      names: null,
      description: null,
      colours: null,
      weather: null,
      sentinels: null,
      fauna: null,
      flora: null,
      minerals: null,
      features: null,
      resources: null,
      pictures: {
        disc: "https://other.example/x.png",
        card: "planets/../x.png",
        small: 3,
      },
    });
    expect(result).not.toHaveProperty("name");
    expect(result).toMatchObject({
      carries: [],
      pictures: { disc: "https://other.example/x.png", card: "planets/../x.png", small: 3 },
      lines: { headline: {}, band: { features: [], fauna: {}, flora: {}, minerals: {} } },
    });
    expect(result.lines).not.toHaveProperty("line");
  });

  it("handles absent image records, unknown features, moon descriptions and unclassified resources", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    stubDocuments({ ...almanacWords, items: { odd: { name: "Odd find" } } });
    const { normalizeAlmanacPlanet } = await import("@/lib/almanac/almanac-normalize");
    const planet = await normalizeAlmanacPlanet({
      ...structuredPlanet,
      size: "moon",
      pictures: undefined,
      features: ["unknown", 2],
      resources: ["odd", "unknown", null],
    });
    expect(planet).toMatchObject({
      carries: [{ name: "Odd find", kind: "other" }],
      pictures: {},
      lines: { line: "Lush Moon", band: { features: [] } },
    });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["poor", 1],
    ["average", 2],
  ] as const)("adapts %s economies and falls back to dictionary level labels", async (level, stars) => {
    stubDocuments(almanacWords, {
      ...structuredSystem,
      economy: { type: "trading" },
      wealth: { level },
      conflict: {},
    });
    const { normalizeAlmanacPlanet } = await import("@/lib/almanac/almanac-normalize");
    expect(
      await normalizeAlmanacPlanet({
        ...structuredPlanet,
        sentinels: { level: "low" },
        weather: { type: "clear" },
      }),
    ).toMatchObject({
      lines: {
        band: {
          weather: { word: "Clear" },
          sentinels: { word: "Low" },
          economy: { word: "Trading", stars, black_market: false },
        },
      },
    });
  });
});
