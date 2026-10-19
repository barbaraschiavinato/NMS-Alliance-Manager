import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { almanacSystemLabel, lookupAlmanacPlanet, lookupAlmanacPlanets } from "@/lib/almanac-lookup";
import { writeDataFile } from "../helpers/members";
import { almanacWords, structuredPlanet, structuredSystem } from "../helpers/almanac";

const cachePath = () => path.join(process.cwd(), "data", "almanac.json");
const readCache = () => JSON.parse(readFileSync(cachePath(), "utf8")) as Record<string, Record<string, unknown>>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Risponde con un pianeta valido per l'indirizzo richiesto, salvo override per indirizzo.
function stubAlmanac(overrides: Record<string, () => Response | Promise<Response>> = {}) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const address = url.pathname.split("/").pop() ?? "";
    const override = overrides[address];
    if (override) return override();
    return jsonResponse({ portal: address, galaxy: url.searchParams.get("galaxy") });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(path.join(process.cwd(), "data"), { recursive: true, force: true });
});

describe("lookupAlmanacPlanet", () => {
  it("normalizes the new API format and stores a reusable display response", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return Response.json(
        url.includes("/systems/") ? structuredSystem : url.includes("/words.") ? almanacWords : structuredPlanet,
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await lookupAlmanacPlanet(structuredPlanet.portal, 0);
    expect(result).toMatchObject({
      lines: { headline: { word: "Test World" }, band: { sentinels: { ink: "exotic" }, flora: { note: "19 plants" } } },
    });
    expect(readCache()[structuredPlanet.portal]["0"]).toEqual(result);
    fetchMock.mockClear();
    expect(await lookupAlmanacPlanet(structuredPlanet.portal, 0)).toEqual(result);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns cached responses without calling the API", async () => {
    writeDataFile("almanac.json", { "0123456789AB": { "3": { portal: "0123456789AB", cached: true } } });
    const fetchMock = stubAlmanac();
    await expect(lookupAlmanacPlanet("0123456789ab", 3)).resolves.toEqual({ portal: "0123456789AB", cached: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches with a 1-based galaxy, caches the result and reuses it", async () => {
    const fetchMock = stubAlmanac();
    const planet = await lookupAlmanacPlanet("0123456789ab", 0);
    expect(planet).toEqual({ portal: "0123456789AB", galaxy: "1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://nmsalmanac.com/api/planets/0123456789AB?galaxy=1");
    expect(init.headers).toEqual({ Accept: "application/json" });
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(readCache()).toEqual({ "0123456789AB": { "0": planet } });

    await lookupAlmanacPlanet("0123456789AB", 0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a lower-case portal in the response", async () => {
    stubAlmanac({ "0123456789AB": () => jsonResponse({ portal: "0123456789ab" }) });
    await expect(lookupAlmanacPlanet("0123456789AB", 0)).resolves.toEqual({ portal: "0123456789ab" });
  });

  it("returns null on 404 without caching", async () => {
    stubAlmanac({ "0123456789AB": () => new Response("not found", { status: 404 }) });
    await expect(lookupAlmanacPlanet("0123456789AB", 0)).resolves.toBeNull();
    expect(existsSync(cachePath())).toBe(false);
  });

  it.each([429, 500, 503])("fails on HTTP %i", async (status) => {
    stubAlmanac({ "0123456789AB": () => new Response("error", { status }) });
    await expect(lookupAlmanacPlanet("0123456789AB", 0)).rejects.toThrow("planet.almanac_lookup_failed");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("error"), expect.objectContaining({ status }));
    expect(existsSync(cachePath())).toBe(false);
  });

  it.each([
    ["null", null],
    ["an array", [{ portal: "0123456789AB" }]],
    ["a string", "planet"],
    ["an object without portal", { name: "x" }],
    ["a non-string portal", { portal: 123 }],
    ["another portal", { portal: "1123456789AB" }],
  ])("rejects %s as planet data", async (_label, body) => {
    stubAlmanac({ "0123456789AB": () => jsonResponse(body) });
    await expect(lookupAlmanacPlanet("0123456789AB", 0)).rejects.toThrow("planet.almanac_lookup_failed");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("invalid"), expect.anything());
  });

  it("propagates network failures", async () => {
    stubAlmanac({ "0123456789AB": () => Promise.reject(new TypeError("fetch failed")) });
    await expect(lookupAlmanacPlanet("0123456789AB", 0)).rejects.toThrow("fetch failed");
  });

  it("fails when the body is not JSON", async () => {
    stubAlmanac({ "0123456789AB": () => new Response("<html>", { status: 200 }) });
    await expect(lookupAlmanacPlanet("0123456789AB", 0)).rejects.toThrow();
  });
});

describe("lookupAlmanacPlanets", () => {
  it("isolates cached planet errors, ignores unrelated raw records and persists successful migrations", async () => {
    vi.resetModules();
    const { lookupAlmanacPlanets: lookup } = await import("@/lib/almanac-lookup");
    const invalid = { ...structuredPlanet, words: "invalid" };
    writeDataFile("almanac.json", {
      [structuredPlanet.portal]: { 0: structuredPlanet },
      "2123456789AB": { 0: invalid },
      "3123456789AB": { 0: invalid },
      "4123456789AB": { 0: { name: "Healthy" } },
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      Response.json(String(input).includes("/systems/") ? structuredSystem : almanacWords),
    );
    vi.stubGlobal("fetch", fetchMock);
    const results = await lookup([
      { portal: structuredPlanet.portal, galaxy: 0 },
      { portal: "2123456789AB", galaxy: 0 },
      { portal: "4123456789AB", galaxy: 0 },
    ]);
    expect(results.get(`${structuredPlanet.portal}:0`)).toMatchObject({ failed: false, planet: { lines: {} } });
    expect(results.get("2123456789AB:0")).toEqual({ planet: null, failed: true });
    expect(results.get("4123456789AB:0")).toEqual({ planet: { name: "Healthy" }, failed: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readCache()[structuredPlanet.portal]["0"]).toHaveProperty("lines");
    expect(readCache()["2123456789AB"]["0"]).toEqual(invalid);
    expect(readCache()["3123456789AB"]["0"]).toEqual(invalid);
    expect(console.error).toHaveBeenCalledWith(
      "Unable to load NMS Almanac planet",
      { address: "2123456789AB", galaxy: 0 },
      expect.any(Error),
    );
  });

  it("returns explicit failures instead of crashing when the cache cannot be read", async () => {
    mkdirSync(cachePath(), { recursive: true });
    const fetchMock = stubAlmanac();
    const results = await lookupAlmanacPlanets([{ portal: "0123456789ab", galaxy: 0 }]);
    expect(results.get("0123456789AB:0")).toEqual({ planet: null, failed: true });
    expect(console.error).toHaveBeenCalledWith("Unable to read NMS Almanac cache", expect.any(Error));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("combines cached, fetched, missing and failed planets", async () => {
    writeDataFile("almanac.json", { "0123456789AB": { "0": { portal: "0123456789AB", cached: true } } });
    const fetchMock = stubAlmanac({
      "2123456789AB": () => new Response("", { status: 404 }),
      "3123456789AB": () => new Response("", { status: 500 }),
      "4123456789AB": () => Promise.reject(new Error("offline")),
    });
    const results = await lookupAlmanacPlanets([
      { portal: "0123456789ab", galaxy: 0 },
      { portal: "1123456789AB", galaxy: 0 },
      { portal: "1123456789ab", galaxy: 0 },
      { portal: "1123456789AB", galaxy: 1 },
      { portal: "2123456789AB", galaxy: 0 },
      { portal: "3123456789AB", galaxy: 0 },
      { portal: "4123456789AB", galaxy: 0 },
    ]);

    expect(Object.fromEntries(results)).toEqual({
      "0123456789AB:0": { planet: { portal: "0123456789AB", cached: true }, failed: false },
      "1123456789AB:0": { planet: { portal: "1123456789AB", galaxy: "1" }, failed: false },
      "1123456789AB:1": { planet: { portal: "1123456789AB", galaxy: "2" }, failed: false },
      "2123456789AB:0": { planet: null, failed: false },
      "3123456789AB:0": { planet: null, failed: true },
      "4123456789AB:0": { planet: null, failed: true },
    });
    // Ogni pianeta mancante è scaricato una sola volta, quelli in cache mai.
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(readCache()).toEqual({
      "0123456789AB": { "0": { portal: "0123456789AB", cached: true } },
      "1123456789AB": {
        "0": { portal: "1123456789AB", galaxy: "1" },
        "1": { portal: "1123456789AB", galaxy: "2" },
      },
    });
  });

  it("downloads at most six planets at a time", async () => {
    let active = 0;
    let peak = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return jsonResponse({ portal: new URL(String(input)).pathname.split("/").pop() });
      }),
    );
    const targets = Array.from({ length: 14 }, (_, index) => ({ portal: "0123456789AB", galaxy: index }));
    const results = await lookupAlmanacPlanets(targets);
    expect(results.size).toBe(14);
    expect(peak).toBe(6);
    expect(Object.keys(readCache()["0123456789AB"])).toHaveLength(14);
  });

  it("does nothing for an empty list", async () => {
    const fetchMock = stubAlmanac();
    expect((await lookupAlmanacPlanets([])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(existsSync(cachePath())).toBe(false);
  });

  it("returns results even when saving the cache fails", async () => {
    stubAlmanac({
      "0123456789AB": () => {
        // Un'altra scrittura rende il file della cache illeggibile prima del salvataggio.
        mkdirSync(cachePath(), { recursive: true });
        return jsonResponse({ portal: "0123456789AB" });
      },
    });
    const results = await lookupAlmanacPlanets([{ portal: "0123456789AB", galaxy: 0 }]);
    expect(results.get("0123456789AB:0")).toEqual({ planet: { portal: "0123456789AB" }, failed: false });
    expect(console.error).toHaveBeenCalledWith("Unable to save NMS Almanac planets", expect.anything());
  });
});

describe("almanacSystemLabel", () => {
  it("joins star, economy, conflict and race words in order", () => {
    expect(
      almanacSystemLabel({
        lines: {
          band: {
            race: { word: "Gek" },
            star: { word: " Yellow " },
            conflict: { word: "Low" },
            economy: { word: "Mining" },
          },
        },
      }),
    ).toBe("Yellow · Mining · Low · Gek");
  });

  it("skips missing, blank or malformed attributes", () => {
    expect(
      almanacSystemLabel({
        lines: { band: { star: { word: "Red" }, economy: { word: "  " }, conflict: "High", race: { word: 3 } } },
      }),
    ).toBe("Red");
    expect(almanacSystemLabel({ lines: { band: { race: [{ word: "Vy'keen" }], star: null } } })).toBeNull();
  });

  it("returns null when lines or band are missing or not objects", () => {
    expect(almanacSystemLabel({})).toBeNull();
    expect(almanacSystemLabel({ lines: [] })).toBeNull();
    expect(almanacSystemLabel({ lines: "x" })).toBeNull();
    expect(almanacSystemLabel({ lines: { band: [] } })).toBeNull();
    expect(almanacSystemLabel({ lines: {} })).toBeNull();
  });
});
