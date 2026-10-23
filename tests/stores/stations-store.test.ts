import { mkdirSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMember, seedMembers, writeDataFile } from "../helpers/members";
import {
  blobMock,
  blobReadOptions,
  blobWriteOptions,
  dataDir,
  dataFileExists,
  portalA,
  portalB,
  portalC,
  readBlobJson,
  readDataFile,
  readRawDataFile,
  resetStores,
  setBlobJson,
  useBlobBackend,
} from "./helpers";

vi.mock("@vercel/blob", async () => (await import("./helpers")).blobModule);

const load = () => import("@/lib/stations/stations-store");
const listFile = "stations-v2.json";
const legacyFile = "stations.json";
const adminEmail = "root-admin@example.com";
const now = "2026-05-01T12:00:00.000Z";

beforeEach(() => {
  resetStores();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reading the station list (local filesystem)", () => {
  it("returns an empty list when neither file exists, without writing", async () => {
    const { readAllStationPortals, readStationPortals } = await load();
    expect(await readAllStationPortals()).toEqual([]);
    expect(await readStationPortals("anyone")).toEqual([]);
    expect(dataFileExists(listFile)).toBe(false);
  });

  it("rethrows malformed JSON and non-ENOENT errors", async () => {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(`${dataDir()}/${listFile}`, "[");
    const { readAllStationPortals } = await load();
    await expect(readAllStationPortals()).rejects.toThrow(SyntaxError);
  });

  it("rethrows filesystem errors other than ENOENT", async () => {
    mkdirSync(`${dataDir()}/${listFile}`, { recursive: true });
    const { readAllStationPortals } = await load();
    await expect(readAllStationPortals()).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("returns an empty list for a non-array document", async () => {
    writeDataFile(listFile, { owner: [] });
    const { readAllStationPortals } = await load();
    expect(await readAllStationPortals()).toEqual([]);
  });

  it("normalizes entries, dropping invalid ones and keeping the first duplicate", async () => {
    writeDataFile(listFile, [
      null,
      "0123456789AB",
      {
        ownerId: "o1",
        portal: portalA.toLowerCase(),
        galaxy: 2,
        name: `  ${"n".repeat(90)} `,
        note: ` ${"x".repeat(1100)}`,
        createdByMemberId: " c1 ",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      { ownerId: "o2", portal: portalA, galaxy: 2, name: "duplicate" },
      { ownerId: "o1", portal: portalB },
      {
        ownerId: "o1",
        portal: portalC,
        galaxy: 1,
        name: "  ",
        note: "",
        createdByMemberId: "  ",
        createdAt: "not a date",
      },
      { ownerId: "o1", portal: 123 },
      { ownerId: "o1", portal: "FFFFFFFFFFFF" },
      { ownerId: "o1", portal: "XYZ" },
      { ownerId: "o1", portal: portalA, galaxy: 256 },
      { ownerId: "o1", portal: portalA, galaxy: -1 },
      { ownerId: "o1", portal: portalA, galaxy: 1.5 },
      { ownerId: "o1", portal: portalA, galaxy: "3" },
      { ownerId: 5, portal: portalB, galaxy: 9 },
      { ownerId: "   ", portal: portalB, galaxy: 10 },
    ]);
    const { readAllStationPortals } = await load();
    expect(await readAllStationPortals()).toEqual([
      {
        portal: portalA,
        galaxy: 2,
        ownerId: "o1",
        name: "n".repeat(80),
        note: "x".repeat(1000),
        createdByMemberId: "c1",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      { portal: portalB, galaxy: 0, ownerId: "o1" },
      { portal: portalC, galaxy: 1, ownerId: "o1" },
      // galaxy "3" non è un numero: viene trattata come galassia 0, ma portalA:0 non è ancora presente.
      { portal: portalA, galaxy: 0, ownerId: "o1" },
    ]);
  });

  it("assigns entries without an owner to the configured admin", async () => {
    vi.stubEnv("ALLIANCE_ADMIN_EMAIL", " Root-Admin@Example.com ");
    const admin = makeMember({ email: adminEmail });
    seedMembers([admin]);
    writeDataFile(listFile, [{ portal: portalA, galaxy: 0 }]);
    const { readStationPortals } = await load();
    expect(await readStationPortals(` ${admin.publicId} `)).toEqual([{ portal: portalA, galaxy: 0 }]);
  });

  it("does not rewrite an existing list on read", async () => {
    writeDataFile(listFile, [{ ownerId: "o1", portal: portalA.toLowerCase(), galaxy: 0 }]);
    const before = readRawDataFile(listFile);
    const { readAllStationPortals } = await load();
    await readAllStationPortals();
    expect(readRawDataFile(listFile)).toBe(before);
  });
});

describe("lazy migration from the legacy per-owner index", () => {
  it("builds the flat list, resolving owners and creators by email or publicId", async () => {
    vi.stubEnv("ALLIANCE_ADMIN_EMAIL", adminEmail);
    const admin = makeMember({ email: adminEmail });
    const owner = makeMember({ email: "owner@example.com" });
    const byId = makeMember();
    const creator = makeMember({ email: "creator@example.com" });
    seedMembers([admin, owner, byId, creator]);
    const legacy = {
      " OWNER@example.com ": [
        portalA,
        {
          portal: portalB,
          galaxy: 3,
          name: " Base ",
          note: " Note ",
          createdByEmail: " CREATOR@example.com ",
          createdAt: "2026-02-02T00:00:00.000Z",
        },
        { portal: portalC, galaxy: 1, createdByEmail: "ghost@example.com" },
      ],
      [byId.publicId]: [
        { portal: portalC, galaxy: 2, createdByMemberId: creator.publicId, createdByEmail: "creator@example.com" },
      ],
      "unknown@example.com": [{ portal: portalA, galaxy: 9 }],
      broken: "not-an-array",
    };
    writeDataFile(legacyFile, legacy);
    const { readAllStationPortals } = await load();
    const expected = [
      { portal: portalA, galaxy: 0, ownerId: owner.publicId },
      {
        portal: portalB,
        galaxy: 3,
        ownerId: owner.publicId,
        name: "Base",
        note: "Note",
        createdByMemberId: creator.publicId,
        createdAt: "2026-02-02T00:00:00.000Z",
      },
      { portal: portalC, galaxy: 1, ownerId: owner.publicId },
      { portal: portalC, galaxy: 2, ownerId: byId.publicId, createdByMemberId: creator.publicId },
      // Proprietario sconosciuto: le stazioni passano all'admin configurato.
      { portal: portalA, galaxy: 9, ownerId: admin.publicId },
    ];
    expect(await readAllStationPortals()).toEqual(expected);
    expect(readDataFile(listFile)).toEqual(expected);
    // Il file legacy resta intatto come backup.
    expect(readDataFile(legacyFile)).toEqual(legacy);
  });

  it("keeps the stored owner key when no member or admin matches, and merges duplicate owners", async () => {
    const owner = makeMember({ email: "owner@example.com" });
    seedMembers([owner]);
    writeDataFile(legacyFile, {
      "owner@example.com": [portalA],
      "OWNER@EXAMPLE.COM": [portalA, portalB],
      "lost@example.com": [portalC],
    });
    const { readAllStationPortals } = await load();
    expect(await readAllStationPortals()).toEqual([
      { portal: portalA, galaxy: 0, ownerId: owner.publicId },
      { portal: portalB, galaxy: 0, ownerId: owner.publicId },
      { portal: portalC, galaxy: 0, ownerId: "lost@example.com" },
    ]);
  });

  it.each([null, [], "text"])("writes an empty list for an unusable legacy document (%j)", async (legacy) => {
    writeDataFile(legacyFile, legacy);
    const { readAllStationPortals } = await load();
    expect(await readAllStationPortals()).toEqual([]);
    expect(readDataFile(listFile)).toEqual([]);
  });

  it("prefers the new list over the legacy file", async () => {
    writeDataFile(listFile, [{ ownerId: "o1", portal: portalA, galaxy: 0 }]);
    writeDataFile(legacyFile, { o2: [portalB] });
    const { readAllStationPortals } = await load();
    expect(await readAllStationPortals()).toEqual([{ portal: portalA, galaxy: 0, ownerId: "o1" }]);
  });
});

describe("addStationPortal", () => {
  it("adds a station with trimmed fields and a creation date", async () => {
    writeDataFile(listFile, [{ ownerId: "other", portal: portalB, galaxy: 0 }]);
    const { addStationPortal, readAllStationPortals } = await load();
    const result = await addStationPortal(
      " o1 ",
      portalA,
      4,
      ` ${"n".repeat(85)} `,
      " creator ",
      ` ${"x".repeat(1005)} `,
    );
    const added = {
      portal: portalA,
      galaxy: 4,
      name: "n".repeat(80),
      note: "x".repeat(1000),
      createdByMemberId: "creator",
      createdAt: now,
    };
    expect(result).toEqual([added]);
    expect(await readAllStationPortals()).toEqual([
      { portal: portalB, galaxy: 0, ownerId: "other" },
      { ...added, ownerId: "o1" },
    ]);
  });

  it("omits blank optional fields", async () => {
    const { addStationPortal } = await load();
    expect(await addStationPortal("o1", portalA, 0, "  ", "  ", "  ")).toEqual([
      { portal: portalA, galaxy: 0, createdAt: now },
    ]);
    expect(await addStationPortal("o1", portalB, 0)).toEqual([
      { portal: portalA, galaxy: 0, createdAt: now },
      { portal: portalB, galaxy: 0, createdAt: now },
    ]);
  });

  it("does not add or write a station already claimed by anyone", async () => {
    writeDataFile(listFile, [{ ownerId: "other", portal: portalA, galaxy: 0 }]);
    const before = readRawDataFile(listFile);
    const { addStationPortal } = await load();
    expect(await addStationPortal("o1", portalA, 0, "mine")).toEqual([]);
    expect(readRawDataFile(listFile)).toBe(before);
  });

  it("allows the same portal in a different galaxy", async () => {
    writeDataFile(listFile, [{ ownerId: "o1", portal: portalA, galaxy: 0 }]);
    const { addStationPortal } = await load();
    expect(await addStationPortal("o1", portalA, 1)).toEqual([
      { portal: portalA, galaxy: 0 },
      { portal: portalA, galaxy: 1, createdAt: now },
    ]);
  });
});

describe("removeStationPortal", () => {
  it("removes only the owner's matching station", async () => {
    writeDataFile(listFile, [
      { ownerId: "o1", portal: portalA, galaxy: 0 },
      { ownerId: "o1", portal: portalA, galaxy: 1 },
      { ownerId: "o2", portal: portalB, galaxy: 0 },
    ]);
    const { removeStationPortal, readAllStationPortals } = await load();
    expect(await removeStationPortal(" o1 ", portalA, 0)).toEqual([{ portal: portalA, galaxy: 1 }]);
    expect(await removeStationPortal("o1", portalB, 0)).toEqual([{ portal: portalA, galaxy: 1 }]);
    expect(await readAllStationPortals()).toEqual([
      { portal: portalA, galaxy: 1, ownerId: "o1" },
      { portal: portalB, galaxy: 0, ownerId: "o2" },
    ]);
  });
});

describe("updateStationPortal", () => {
  beforeEach(() => {
    writeDataFile(listFile, [
      {
        ownerId: "o1",
        portal: portalA,
        galaxy: 0,
        name: "Old",
        note: "Old note",
        createdByMemberId: "c1",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      { ownerId: "o2", portal: portalB, galaxy: 0 },
    ]);
  });

  it("moves, renames and reassigns a station, keeping creator and date", async () => {
    const { updateStationPortal, readAllStationPortals } = await load();
    expect(
      await updateStationPortal(" o1 ", portalA, 0, " o3 ", portalC, 5, ` ${"n".repeat(90)}`, ` ${"x".repeat(1001)}`),
    ).toBe(true);
    expect((await readAllStationPortals())[0]).toEqual({
      portal: portalC,
      galaxy: 5,
      ownerId: "o3",
      name: "n".repeat(80),
      note: "x".repeat(1000),
      createdByMemberId: "c1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("clears name and note when blank or missing", async () => {
    const { updateStationPortal, readAllStationPortals } = await load();
    expect(await updateStationPortal("o2", portalB, 0, "o2", portalB, 0, "  ")).toBe(true);
    expect(await updateStationPortal("o1", portalA, 0, "o1", portalA, 0)).toBe(true);
    expect(await readAllStationPortals()).toEqual([
      { portal: portalA, galaxy: 0, ownerId: "o1", createdByMemberId: "c1", createdAt: "2026-01-01T00:00:00.000Z" },
      { portal: portalB, galaxy: 0, ownerId: "o2" },
    ]);
  });

  it("returns false when the station is not found for that owner", async () => {
    const before = readRawDataFile(listFile);
    const { updateStationPortal } = await load();
    expect(await updateStationPortal("o2", portalA, 0, "o2", portalA, 0)).toBe(false);
    expect(await updateStationPortal("o1", portalA, 1, "o1", portalA, 0)).toBe(false);
    expect(readRawDataFile(listFile)).toBe(before);
  });

  it("returns false when the target address belongs to another station", async () => {
    const before = readRawDataFile(listFile);
    const { updateStationPortal } = await load();
    expect(await updateStationPortal("o1", portalA, 0, "o1", portalB, 0, "x")).toBe(false);
    expect(readRawDataFile(listFile)).toBe(before);
  });
});

describe("reassignStationOwner", () => {
  it("moves ownership and creator references", async () => {
    writeDataFile(listFile, [
      { ownerId: "from", portal: portalA, galaxy: 0, createdByMemberId: "someone" },
      { ownerId: "x", portal: portalB, galaxy: 0, createdByMemberId: "from" },
      { ownerId: "y", portal: portalC, galaxy: 0 },
    ]);
    const { reassignStationOwner, readAllStationPortals } = await load();
    await reassignStationOwner("from", "to");
    expect(await readAllStationPortals()).toEqual([
      { portal: portalA, galaxy: 0, ownerId: "to", createdByMemberId: "someone" },
      { portal: portalB, galaxy: 0, ownerId: "x", createdByMemberId: "to" },
      { portal: portalC, galaxy: 0, ownerId: "y" },
    ]);
  });

  it("does not write when nothing references the member", async () => {
    writeDataFile(listFile, [{ ownerId: "x", portal: portalA, galaxy: 0 }]);
    const before = readRawDataFile(listFile);
    const { reassignStationOwner } = await load();
    await reassignStationOwner("from", "to");
    expect(readRawDataFile(listFile)).toBe(before);
  });
});

describe("Blob backend", () => {
  beforeEach(() => {
    useBlobBackend();
  });

  it("falls back to the legacy blob and writes the migrated list", async () => {
    setBlobJson("alliance-manager/stations.json", { o1: [portalA] });
    const { readAllStationPortals } = await load();
    expect(await readAllStationPortals()).toEqual([{ portal: portalA, galaxy: 0, ownerId: "o1" }]);
    expect(blobMock.get).toHaveBeenCalledWith("alliance-manager/stations-v2.json", blobReadOptions());
    expect(blobMock.get).toHaveBeenCalledWith("alliance-manager/stations.json", blobReadOptions());
    expect(blobMock.put).toHaveBeenCalledWith(
      "alliance-manager/stations-v2.json",
      expect.any(String),
      blobWriteOptions(),
    );
    expect(readBlobJson("alliance-manager/stations-v2.json")).toEqual([{ portal: portalA, galaxy: 0, ownerId: "o1" }]);
    expect(dataFileExists(listFile)).toBe(false);
  });

  it("treats a 304 or missing blob as absent", async () => {
    setBlobJson("alliance-manager/stations-v2.json", [{ ownerId: "o1", portal: portalA, galaxy: 0 }]);
    blobMock.get.mockResolvedValueOnce({ statusCode: 304, stream: null });
    const { readAllStationPortals } = await load();
    // Senza lista né legacy: lista vuota e nessuna scrittura.
    expect(await readAllStationPortals()).toEqual([]);
    expect(blobMock.put).not.toHaveBeenCalled();
  });

  it("adds stations through Blob", async () => {
    const { addStationPortal } = await load();
    await addStationPortal("o1", portalA, 0);
    expect(readBlobJson("alliance-manager/stations-v2.json")).toEqual([
      { portal: portalA, galaxy: 0, ownerId: "o1", createdAt: now },
    ]);
  });
});
