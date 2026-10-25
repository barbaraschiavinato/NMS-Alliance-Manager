import { mkdirSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeDataFile } from "../helpers/members";
import { blobMock, readBlobJson, resetStores, setBlobJson, useBlobBackend } from "./helpers";

vi.mock("@vercel/blob", async () => (await import("./helpers")).blobModule);
const load = () => import("@/lib/planets/planet-visits-store");
const file = "planet-visits.json";
const blob = `alliance-manager/${file}`;

beforeEach(() => {
  resetStores();
});

describe("planet visit persistence", () => {
  it.each([false, true])("keeps personal marks per member and removes empty members (Blob=%s)", async (blobBackend) => {
    if (blobBackend) useBlobBackend();
    const { readPlanetVisits, setPlanetVisit } = await load();
    expect(await readPlanetVisits("a")).toEqual([]);
    await setPlanetVisit("a", "0:1123456789AB", true);
    await setPlanetVisit("a", "0:1123456789AB", true);
    await setPlanetVisit("a", "0:2123456789AB", true);
    await setPlanetVisit("b", "0:1123456789AB", true);
    expect(await readPlanetVisits("a")).toEqual(["0:1123456789AB", "0:2123456789AB"]);
    expect(await readPlanetVisits("b")).toEqual(["0:1123456789AB"]);
    await setPlanetVisit("b", "0:1123456789AB", false);
    await setPlanetVisit("a", "0:3123456789AB", false);
    const stored = blobBackend ? readBlobJson(blob) : JSON.parse(readFileSync(`data/${file}`, "utf8"));
    expect(stored).toEqual({ a: ["0:1123456789AB", "0:2123456789AB"] });
  });

  it.each([null, [], "text", { a: "0:1" }, { a: [1] }])("rejects a malformed document %j", async (value) => {
    writeDataFile(file, value);
    const { readPlanetVisits } = await load();
    await expect(readPlanetVisits("a")).rejects.toThrow("Invalid planet visit storage.");
  });

  it("deduplicates the stored keys", async () => {
    writeDataFile(file, { a: ["0:1", "0:1"] });
    expect(await (await load()).readPlanetVisits("a")).toEqual(["0:1"]);
  });

  it("treats a 304 Blob response as empty and rethrows unexpected read errors", async () => {
    useBlobBackend();
    blobMock.get.mockResolvedValueOnce({ statusCode: 304, stream: null });
    expect(await (await load()).readPlanetVisits("a")).toEqual([]);
    setBlobJson(blob, { a: ["0:9"] });
    expect(await (await load()).readPlanetVisits("a")).toEqual(["0:9"]);
  });

  it("rethrows filesystem errors other than a missing file", async () => {
    mkdirSync(`data/${file}`, { recursive: true });
    await expect((await load()).readPlanetVisits("a")).rejects.toMatchObject({ code: "EISDIR" });
  });
});
