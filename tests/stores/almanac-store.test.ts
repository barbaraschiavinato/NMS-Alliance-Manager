import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeDataFile } from "../helpers/members";
import { almanacWords, structuredPlanet, structuredSystem } from "../helpers/almanac";
import {
  blobMock,
  blobReadOptions,
  blobWriteOptions,
  dataDir,
  dataFileExists,
  readBlobJson,
  readDataFile,
  resetStores,
  setBlobJson,
  useBlobBackend,
} from "./helpers";

vi.mock("@vercel/blob", async () => (await import("./helpers")).blobModule);

const load = () => import("@/lib/almanac-store");
const fileName = "almanac.json";
const blobPath = "alliance-manager/almanac.json";
const portalFor = (index: number) => index.toString(16).toUpperCase().padStart(12, "0");

beforeEach(() => {
  resetStores();
});

describe("reading (local filesystem)", () => {
  it.each(["single", "batch", "cache"])(
    "recovers and persists an expired dictionary through the %s reader",
    async (reader) => {
      writeDataFile(fileName, {
        [structuredPlanet.portal]: { 0: { ...structuredPlanet, words: "words.en.expired.json" } },
      });
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("words.en.expired.json")) return new Response("", { status: 404 });
        return Response.json(
          url.includes("/planets/") ? structuredPlanet : url.includes("/systems/") ? structuredSystem : almanacWords,
        );
      });
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(console, "info").mockImplementation(() => undefined);
      const { readAlmanacResponse, readAlmanacResponses, readAlmanacCache } = await load();
      if (reader === "single") await readAlmanacResponse(structuredPlanet.portal, 0);
      else if (reader === "batch") await readAlmanacResponses([structuredPlanet.portal]);
      else await readAlmanacCache();
      expect(readDataFile(fileName)).toMatchObject({
        [structuredPlanet.portal]: {
          0: { words: structuredPlanet.words, lines: { headline: { word: "Test World" } } },
        },
      });
      fetchMock.mockClear();
      await readAlmanacResponse(structuredPlanet.portal, 0);
      await readAlmanacResponses([structuredPlanet.portal]);
      await readAlmanacCache();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("adapts structured data already cached by the former client through every reader", async () => {
    writeDataFile(fileName, { [structuredPlanet.portal]: { 0: structuredPlanet } });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      Response.json(String(input).includes("/systems/") ? structuredSystem : almanacWords),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { readAlmanacResponse, readAlmanacResponses, readAlmanacCache } = await load();
    const normalized = await readAlmanacResponse(structuredPlanet.portal, 0);
    expect(normalized).toMatchObject({ lines: { headline: { word: "Test World" } } });
    expect((await readAlmanacResponses([structuredPlanet.portal]))[structuredPlanet.portal][0].response).toEqual(
      normalized,
    );
    expect((await readAlmanacCache())(structuredPlanet.portal, 0)).toEqual(normalized);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("persists adapted structured responses through individual and batch writes", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      Response.json(String(input).includes("/systems/") ? structuredSystem : almanacWords),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { writeAlmanacResponse, writeAlmanacResponses, readAlmanacResponse } = await load();
    await writeAlmanacResponse(structuredPlanet.portal, 0, structuredPlanet);
    await writeAlmanacResponses([
      { portalCode: "2234567890AB", galaxy: 0, response: { ...structuredPlanet, portal: "2234567890AB" } },
    ]);
    expect(readDataFile(fileName)).toMatchObject({
      [structuredPlanet.portal]: { 0: { lines: { band: { minerals: { word: "23" } } } } },
      "2234567890AB": { 0: { lines: { band: { fauna: { note: "0 species" } } } } },
    });
    fetchMock.mockClear();
    expect(await readAlmanacResponse(structuredPlanet.portal, 0)).toHaveProperty("lines");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns nothing when the cache file does not exist", async () => {
    const { readAlmanacResponse, readAlmanacResponses, readAlmanacCache } = await load();
    expect(await readAlmanacResponse("0123456789AB", 0)).toBeNull();
    expect(await readAlmanacResponses(["0123456789ab"])).toEqual({ "0123456789AB": [] });
    expect((await readAlmanacCache())("0123456789AB", 0)).toBeNull();
    expect(dataFileExists(fileName)).toBe(false);
  });

  it("moves malformed JSON aside and starts from an empty cache", async () => {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(`${dataDir()}/${fileName}`, "nope");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { readAlmanacResponse, writeAlmanacResponse } = await load();
    expect(await readAlmanacResponse("0123456789AB", 0)).toBeNull();
    expect(error).toHaveBeenCalledWith("Unreadable Almanac cache, starting from an empty one", expect.any(SyntaxError));
    expect(dataFileExists(fileName)).toBe(false);
    expect(readdirSync(dataDir()).some((name) => name.startsWith(`${fileName}.corrupt-`))).toBe(true);

    await writeAlmanacResponse("0123456789AB", 0, { portal: "fresh" });
    expect(await readAlmanacResponse("0123456789AB", 0)).toEqual({ portal: "fresh" });
  });

  it("leaves malformed JSON in place when it cannot be moved aside", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000);
    mkdirSync(`${dataDir()}/${fileName}.corrupt-1000/blocker`, { recursive: true });
    writeFileSync(`${dataDir()}/${fileName}`, "nope");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { readAlmanacResponse } = await load();
      expect(await readAlmanacResponse("0123456789AB", 0)).toBeNull();
      expect(dataFileExists(fileName)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rethrows non-ENOENT read errors", async () => {
    mkdirSync(`${dataDir()}/${fileName}`, { recursive: true });
    const { readAlmanacResponse } = await load();
    await expect(readAlmanacResponse("0123456789AB", 0)).rejects.toMatchObject({ code: "EISDIR" });
  });

  it.each([null, [], "text"])("treats a non-object document (%j) as empty", async (value) => {
    writeDataFile(fileName, value);
    const { readAlmanacResponse } = await load();
    expect(await readAlmanacResponse("0123456789AB", 0)).toBeNull();
  });

  it("drops invalid portal codes, galaxies and responses, and upper-cases codes", async () => {
    writeDataFile(fileName, {
      "0123456789ab": { 0: { name: "zero" }, x: { name: "bad" }, 2: null, 3: [], 4: "text" },
      ZZZZZZZZZZZZ: { 0: { name: "bad code" } },
      "1ABC12345678": null,
      "2001010010A1": [],
      "2ABC12345678": { 1: null },
    });
    const { readAlmanacResponse, readAlmanacResponses } = await load();
    expect(await readAlmanacResponse("0123456789AB", 0)).toEqual({ name: "zero" });
    expect(await readAlmanacResponse("0123456789AB", 2)).toBeNull();
    expect(await readAlmanacResponses(["0123456789ab", "ZZZZZZZZZZZZ", "2ABC12345678"])).toEqual({
      "0123456789AB": [{ galaxy: 0, response: { name: "zero" } }],
      ZZZZZZZZZZZZ: [],
      "2ABC12345678": [],
    });
  });

  it("lists cached galaxies sorted and ignores galaxies above 255", async () => {
    writeDataFile(fileName, {
      "0123456789AB": { 12: { n: 12 }, 3: { n: 3 }, 256: { n: 256 }, 255: { n: 255 } },
    });
    const { readAlmanacResponses } = await load();
    expect(await readAlmanacResponses(["0123456789AB"])).toEqual({
      "0123456789AB": [
        { galaxy: 3, response: { n: 3 } },
        { galaxy: 12, response: { n: 12 } },
        { galaxy: 255, response: { n: 255 } },
      ],
    });
  });

  it("returns a lookup function over a single read", async () => {
    writeDataFile(fileName, { "0123456789AB": { 1: { ok: true } } });
    const { readAlmanacCache } = await load();
    const lookup = await readAlmanacCache();
    expect(lookup("0123456789ab", 1)).toEqual({ ok: true });
    expect(lookup("0123456789ab", 2)).toBeNull();
    expect(lookup("1ABC12345678", 1)).toBeNull();
  });
});

describe("writing (local filesystem)", () => {
  it("adds a response under the canonical code and keeps existing entries", async () => {
    writeDataFile(fileName, { "0123456789AB": { 0: { old: true } } });
    const { writeAlmanacResponse, readAlmanacResponse } = await load();
    await writeAlmanacResponse("0123456789ab", 5, { fresh: true });
    await writeAlmanacResponse("1abc12345678", 0, { other: true });
    expect(readDataFile(fileName)).toEqual({
      "0123456789AB": { 0: { old: true }, 5: { fresh: true } },
      "1ABC12345678": { 0: { other: true } },
    });
    expect(await readAlmanacResponse("0123456789AB", 5)).toEqual({ fresh: true });
  });

  it("overwrites an existing response for the same galaxy", async () => {
    const { writeAlmanacResponse, readAlmanacResponse } = await load();
    await writeAlmanacResponse("0123456789AB", 0, { v: 1 });
    await writeAlmanacResponse("0123456789AB", 0, { v: 2 });
    expect(await readAlmanacResponse("0123456789AB", 0)).toEqual({ v: 2 });
  });

  it("writes several responses in one document write", async () => {
    const { writeAlmanacResponses } = await load();
    await writeAlmanacResponses([
      { portalCode: "0123456789ab", galaxy: 0, response: { a: 1 } },
      { portalCode: "0123456789AB", galaxy: 1, response: { b: 2 } },
      { portalCode: "1abc12345678", galaxy: 2, response: { c: 3 } },
    ]);
    expect(readDataFile(fileName)).toEqual({
      "0123456789AB": { 0: { a: 1 }, 1: { b: 2 } },
      "1ABC12345678": { 2: { c: 3 } },
    });
  });

  it("does nothing for an empty batch", async () => {
    const { writeAlmanacResponses } = await load();
    await writeAlmanacResponses([]);
    expect(dataFileExists(fileName)).toBe(false);
  });

  it("keeps every entry when many lookups are saved at the same time", async () => {
    const { writeAlmanacResponse, readAlmanacResponse } = await load();
    const count = 40;
    await Promise.all(
      Array.from({ length: count }, (_, index) =>
        writeAlmanacResponse(portalFor(index + 1), 0, { portal: portalFor(index + 1), index }),
      ),
    );
    expect(() => readDataFile(fileName)).not.toThrow();
    for (let index = 0; index < count; index += 1) {
      expect(await readAlmanacResponse(portalFor(index + 1), 0), `entry ${index}`).toMatchObject({ index });
    }
  });

  it("keeps the entries of batch writes that run at the same time", async () => {
    const { writeAlmanacResponse, writeAlmanacResponses, readAlmanacCache } = await load();
    await Promise.all([
      writeAlmanacResponses([{ portalCode: portalFor(1), galaxy: 0, response: { portal: "a" } }]),
      writeAlmanacResponses([{ portalCode: portalFor(2), galaxy: 1, response: { portal: "b" } }]),
      writeAlmanacResponse(portalFor(3), 2, { portal: "c" }),
    ]);
    const cache = await readAlmanacCache();
    expect(cache(portalFor(1), 0)).toEqual({ portal: "a" });
    expect(cache(portalFor(2), 1)).toEqual({ portal: "b" });
    expect(cache(portalFor(3), 2)).toEqual({ portal: "c" });
  });

  it("does not leave temporary files behind", async () => {
    const { writeAlmanacResponse } = await load();
    await Promise.all([1, 2, 3].map((index) => writeAlmanacResponse(portalFor(index), 0, { index })));
    expect(readdirSync(dataDir()).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});

describe("Blob backend", () => {
  beforeEach(() => {
    useBlobBackend();
  });

  it("reads nothing from a missing or 304 blob", async () => {
    const { readAlmanacResponse } = await load();
    expect(await readAlmanacResponse("0123456789AB", 0)).toBeNull();
    expect(blobMock.get).toHaveBeenCalledWith(blobPath, blobReadOptions());
    setBlobJson(blobPath, { "0123456789AB": { 0: { ok: true } } });
    blobMock.get.mockResolvedValueOnce({ statusCode: 304, stream: null });
    expect(await readAlmanacResponse("0123456789AB", 0)).toBeNull();
    expect(await readAlmanacResponse("0123456789AB", 0)).toEqual({ ok: true });
  });

  it("keeps saving after a failed write", async () => {
    const { writeAlmanacResponse, readAlmanacResponse } = await load();
    blobMock.put.mockRejectedValueOnce(new Error("Blob unavailable"));
    await expect(writeAlmanacResponse("0123456789AB", 0, { v: 1 })).rejects.toThrow("Blob unavailable");
    await writeAlmanacResponse("0123456789AB", 1, { v: 2 });
    expect(await readAlmanacResponse("0123456789AB", 0)).toBeNull();
    expect(await readAlmanacResponse("0123456789AB", 1)).toEqual({ v: 2 });
  });

  it("writes private JSON with overwrite enabled", async () => {
    const { writeAlmanacResponse, writeAlmanacResponses } = await load();
    await writeAlmanacResponse("0123456789ab", 0, { ok: true });
    expect(blobMock.put).toHaveBeenCalledWith(blobPath, expect.any(String), blobWriteOptions());
    await writeAlmanacResponses([{ portalCode: "0123456789AB", galaxy: 1, response: { ok: 1 } }]);
    expect(readBlobJson(blobPath)).toEqual({ "0123456789AB": { 0: { ok: true }, 1: { ok: 1 } } });
    expect(dataFileExists(fileName)).toBe(false);
  });
});
