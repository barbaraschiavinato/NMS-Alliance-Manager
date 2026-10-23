import { mkdirSync, writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeDataFile } from "../helpers/members";
import {
  blobMock,
  blobReadOptions,
  blobWriteOptions,
  dataDir,
  dataFileExists,
  readBlobJson,
  readDataFile,
  readRawDataFile,
  resetStores,
  setBlobJson,
  useBlobBackend,
} from "./helpers";

vi.mock("@vercel/blob", async () => (await import("./helpers")).blobModule);

const load = () => import("@/lib/planets/planet-system-status-store");
const fileName = "planet-system-status.json";
const blobPath = "alliance-manager/planet-system-status.json";

beforeEach(() => {
  resetStores();
});

describe("reading (local filesystem)", () => {
  it("returns an empty index when the file does not exist", async () => {
    const { readPlanetSystemStatuses, readPlanetSystemStatus } = await load();
    expect(await readPlanetSystemStatuses()).toEqual({});
    expect(await readPlanetSystemStatus("0123456789ab", 1)).toEqual([]);
    expect(dataFileExists(fileName)).toBe(false);
  });

  it("rethrows malformed JSON and other filesystem errors", async () => {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(`${dataDir()}/${fileName}`, "{");
    const { readPlanetSystemStatuses } = await load();
    await expect(readPlanetSystemStatuses()).rejects.toThrow(SyntaxError);
  });

  it("rethrows non-ENOENT read errors", async () => {
    mkdirSync(`${dataDir()}/${fileName}`, { recursive: true });
    const { readPlanetSystemStatuses } = await load();
    await expect(readPlanetSystemStatuses()).rejects.toMatchObject({ code: "EISDIR" });
  });

  it.each([null, [], "text", 3])("returns an empty index for a non-object document (%j)", async (value) => {
    writeDataFile(fileName, value);
    const { readPlanetSystemStatuses } = await load();
    expect(await readPlanetSystemStatuses()).toEqual({});
  });

  it("looks up statuses by upper-cased portal and galaxy", async () => {
    writeDataFile(fileName, { "2:0123456789AB": ["mapped", "renamed"] });
    const { readPlanetSystemStatus } = await load();
    expect(await readPlanetSystemStatus("0123456789ab", 2)).toEqual(["mapped", "renamed"]);
    expect(await readPlanetSystemStatus("0123456789ab", 3)).toEqual([]);
  });

  it("migrates legacy Italian and English labels, deduplicates and writes back", async () => {
    writeDataFile(fileName, {
      "0:0123456789AB": ["Mappato", "mapped", "Sistema rinominato", "Renamed"],
      "1:1ABC12345678": ["Data error", "Stazione Riscattata"],
    });
    const { readPlanetSystemStatuses } = await load();
    const expected = {
      "0:0123456789AB": ["mapped", "renamed"],
      "1:1ABC12345678": ["data_error", "station_claimed"],
    };
    expect(await readPlanetSystemStatuses()).toEqual(expected);
    expect(readDataFile(fileName)).toEqual(expected);
  });

  it("does not rewrite current data", async () => {
    writeDataFile(fileName, { "0:0123456789AB": ["mapped", "mapped"] });
    const before = readRawDataFile(fileName);
    const { readPlanetSystemStatuses } = await load();
    expect(await readPlanetSystemStatuses()).toEqual({ "0:0123456789AB": ["mapped"] });
    expect(readRawDataFile(fileName)).toBe(before);
  });

  it("drops invalid entries and skips the write-back so nothing is lost", async () => {
    writeDataFile(fileName, {
      "0:0123456789AB": ["Mappato"],
      "1:0123456789AB": "mapped",
      "2:0123456789AB": ["mapped", "unknown"],
    });
    const before = readRawDataFile(fileName);
    const { readPlanetSystemStatuses } = await load();
    expect(await readPlanetSystemStatuses()).toEqual({ "0:0123456789AB": ["mapped"] });
    expect(readRawDataFile(fileName)).toBe(before);
  });
});

describe("writePlanetSystemStatus", () => {
  it("stores deduplicated statuses under the canonical key and keeps other keys", async () => {
    writeDataFile(fileName, { "0:1ABC12345678": ["mapped"] });
    const { writePlanetSystemStatus } = await load();
    expect(await writePlanetSystemStatus("0123456789ab", 5, ["renamed", "renamed", "mapped"])).toEqual([
      "renamed",
      "mapped",
    ]);
    expect(readDataFile(fileName)).toEqual({
      "0:1ABC12345678": ["mapped"],
      "5:0123456789AB": ["renamed", "mapped"],
    });
  });

  it("can clear a key with an empty list", async () => {
    writeDataFile(fileName, { "0:0123456789AB": ["mapped"] });
    const { writePlanetSystemStatus, readPlanetSystemStatus } = await load();
    await writePlanetSystemStatus("0123456789AB", 0, []);
    expect(await readPlanetSystemStatus("0123456789AB", 0)).toEqual([]);
    expect(readDataFile(fileName)).toEqual({ "0:0123456789AB": [] });
  });
});

describe("migrateLegacyPlanetSystemStatuses", () => {
  const mission = (overrides: Record<string, unknown> = {}) => ({
    systemAddress: "0123456789ab",
    galaxy: 4,
    systemStatus: ["Mappato", "mapped"],
    ...overrides,
  });

  it("ignores non-array input", async () => {
    const { migrateLegacyPlanetSystemStatuses } = await load();
    await migrateLegacyPlanetSystemStatuses({ systemStatus: [] });
    expect(dataFileExists(fileName)).toBe(false);
  });

  it("copies valid mission statuses into the index", async () => {
    const { migrateLegacyPlanetSystemStatuses } = await load();
    await migrateLegacyPlanetSystemStatuses([
      mission(),
      mission({ systemAddress: "1ABC12345678", galaxy: 0, systemStatus: [] }),
    ]);
    expect(readDataFile(fileName)).toEqual({ "4:0123456789AB": ["mapped"], "0:1ABC12345678": [] });
  });

  it("never overwrites existing keys and skips the write when nothing is new", async () => {
    writeDataFile(fileName, { "4:0123456789AB": ["renamed"] });
    const before = readRawDataFile(fileName);
    const { migrateLegacyPlanetSystemStatuses } = await load();
    await migrateLegacyPlanetSystemStatuses([mission()]);
    expect(readRawDataFile(fileName)).toBe(before);
  });

  it.each([
    ["null", null],
    ["an array entry", []],
    ["a string", "mission"],
    ["a missing address", mission({ systemAddress: undefined })],
    ["a short address", mission({ systemAddress: "0123" })],
    ["a non-hex address", mission({ systemAddress: "0123456789AZ" })],
    ["a string galaxy", mission({ galaxy: "4" })],
    ["a fractional galaxy", mission({ galaxy: 1.5 })],
    ["a negative galaxy", mission({ galaxy: -1 })],
    ["a galaxy above 255", mission({ galaxy: 256 })],
    ["non-array statuses", mission({ systemStatus: "mapped" })],
    ["an unknown status", mission({ systemStatus: ["mapped", "nope"] })],
  ])("skips entries with %s", async (_label, entry) => {
    const { migrateLegacyPlanetSystemStatuses } = await load();
    await migrateLegacyPlanetSystemStatuses([entry]);
    expect(dataFileExists(fileName)).toBe(false);
  });
});

describe("Blob backend", () => {
  beforeEach(() => {
    useBlobBackend();
  });

  it("returns an empty index for a missing or 304 blob", async () => {
    const { readPlanetSystemStatuses } = await load();
    expect(await readPlanetSystemStatuses()).toEqual({});
    expect(blobMock.get).toHaveBeenCalledWith(blobPath, blobReadOptions());
    setBlobJson(blobPath, { "0:0123456789AB": ["mapped"] });
    blobMock.get.mockResolvedValueOnce({ statusCode: 304, stream: null });
    expect(await readPlanetSystemStatuses()).toEqual({});
  });

  it("migrates and writes back through Blob with private access", async () => {
    setBlobJson(blobPath, { "0:0123456789AB": ["Mappato"] });
    const { readPlanetSystemStatuses } = await load();
    expect(await readPlanetSystemStatuses()).toEqual({ "0:0123456789AB": ["mapped"] });
    expect(blobMock.put).toHaveBeenCalledWith(blobPath, expect.any(String), blobWriteOptions());
    expect(readBlobJson(blobPath)).toEqual({ "0:0123456789AB": ["mapped"] });
    expect(dataFileExists(fileName)).toBe(false);
  });

  it("writes statuses through Blob", async () => {
    const { writePlanetSystemStatus } = await load();
    await writePlanetSystemStatus("0123456789AB", 1, ["mapped"]);
    expect(readBlobJson(blobPath)).toEqual({ "1:0123456789AB": ["mapped"] });
  });
});
