import { mkdirSync, writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  blobMock,
  blobReadOptions,
  blobWriteOptions,
  dataDir,
  dataFileExists,
  listDataDir,
  readBlobJson,
  readRawDataFile,
  resetStores,
  setBlobJson,
  useBlobBackend,
} from "./helpers";

vi.mock("@vercel/blob", async () => (await import("./helpers")).blobModule);

const load = () => import("@/lib/storage/json-document");

beforeEach(() => {
  resetStores();
});

describe("JSON documents (local filesystem)", () => {
  it("derives the Blob pathname and the local file from the document name", async () => {
    const { blobDocumentPath, localDocumentPath } = await load();
    expect(blobDocumentPath("farms")).toBe("alliance-manager/farms.json");
    expect(localDocumentPath("farms")).toBe(`${dataDir()}/farms.json`);
  });

  it("reads a missing document as undefined without creating it", async () => {
    const { readJsonDocument } = await load();
    expect(await readJsonDocument("farms")).toBeUndefined();
    expect(dataFileExists("farms.json")).toBe(false);
  });

  it("writes pretty-printed JSON atomically and reads it back", async () => {
    const { readJsonDocument, writeJsonDocument } = await load();
    await writeJsonDocument("farms", [{ id: "a" }]);
    expect(readRawDataFile("farms.json")).toBe('[\n  {\n    "id": "a"\n  }\n]\n');
    expect(listDataDir().filter((name) => name.endsWith(".tmp"))).toEqual([]);
    expect(await readJsonDocument("farms")).toEqual([{ id: "a" }]);
  });

  it("honours NMS_DATA_DIR at call time", async () => {
    const { writeJsonDocument } = await load();
    vi.stubEnv("NMS_DATA_DIR", "other-data");
    try {
      await writeJsonDocument("farms", []);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(dataFileExists("farms.json")).toBe(false);
    expect(readRawDataFile("../other-data/farms.json")).toBe("[]\n");
  });

  it("throws on malformed JSON unless asked to quarantine the file", async () => {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(`${dataDir()}/farms.json`, "nope");
    const { readJsonDocument } = await load();
    await expect(readJsonDocument("farms")).rejects.toThrow(SyntaxError);
    expect(dataFileExists("farms.json")).toBe(true);

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await readJsonDocument("farms", { quarantineCorruptLocalFile: true })).toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      "Unreadable farms.json, starting from an empty document",
      expect.any(SyntaxError),
    );
    expect(dataFileExists("farms.json")).toBe(false);
    expect(listDataDir().some((name) => name.startsWith("farms.json.corrupt-"))).toBe(true);
  });

  it("clears the request memo after a write, even when it fails", async () => {
    const memo = await import("@/lib/storage/request-memo");
    const clear = vi.spyOn(memo, "clearRequestMemo");
    const { writeJsonDocument } = await load();
    await writeJsonDocument("farms", []);
    expect(clear).toHaveBeenCalledTimes(1);

    useBlobBackend();
    blobMock.put.mockRejectedValueOnce(new Error("Blob unavailable"));
    await expect(writeJsonDocument("farms", [])).rejects.toThrow("Blob unavailable");
    expect(clear).toHaveBeenCalledTimes(2);
  });
});

describe("JSON documents (Vercel Blob)", () => {
  beforeEach(() => useBlobBackend());

  it("reads a private document without the Blob cache", async () => {
    setBlobJson("alliance-manager/farms.json", [{ id: "b" }]);
    const { readJsonDocument } = await load();
    expect(await readJsonDocument("farms")).toEqual([{ id: "b" }]);
    expect(blobMock.get).toHaveBeenCalledWith("alliance-manager/farms.json", blobReadOptions());
  });

  it("reads a missing or not-modified document as undefined", async () => {
    const { readJsonDocument } = await load();
    expect(await readJsonDocument("farms")).toBeUndefined();
    blobMock.get.mockResolvedValueOnce({ statusCode: 304, stream: null });
    expect(await readJsonDocument("farms")).toBeUndefined();
  });

  it("overwrites the document with the shared write options, never touching the local data folder", async () => {
    const { writeJsonDocument } = await load();
    await writeJsonDocument("farms", { a: 1 });
    expect(blobMock.put).toHaveBeenCalledWith("alliance-manager/farms.json", '{\n  "a": 1\n}\n', blobWriteOptions());
    expect(readBlobJson("alliance-manager/farms.json")).toEqual({ a: 1 });
    expect(listDataDir()).toEqual([]);
  });
});
