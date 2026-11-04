import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  blobMock,
  blobWriteOptions,
  dataFileExists,
  portalA,
  portalB,
  readBlobJson,
  readDataFile,
  resetStores,
  setBlobJson,
  useBlobBackend,
} from "./helpers";
import { writeDataFile } from "../helpers/members";
import type { FarmInput } from "@/lib/farms/farms";

vi.mock("@vercel/blob", async () => (await import("./helpers")).blobModule);

const load = () => import("@/lib/farms/farms-store");
const now = "2026-05-01T12:00:00.000Z";
const input: FarmInput = {
  name: "Copper hill",
  portal: portalA,
  galaxy: 0,
  planetName: "Ruba",
  resources: ["Copper"],
  coordinates: "",
  note: "",
};

beforeEach(() => {
  resetStores();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("farms store (local filesystem)", () => {
  it("returns an empty list when the file is missing, without writing", async () => {
    const { readFarms } = await load();
    expect(await readFarms()).toEqual([]);
    expect(dataFileExists("farms.json")).toBe(false);
  });

  it("drops invalid and duplicate entries on read", async () => {
    writeDataFile("farms.json", [
      {
        id: "a",
        name: "A",
        portal: portalA,
        galaxy: 0,
        planetName: "P",
        resources: ["Copper"],
        ownerId: "o",
        createdAt: now,
      },
      {
        id: "a",
        name: "Dup",
        portal: portalA,
        galaxy: 0,
        planetName: "P",
        resources: [],
        ownerId: "o",
        createdAt: now,
      },
      { id: "b", name: "Bad portal", portal: "nope", galaxy: 0, ownerId: "o" },
    ]);
    const { readFarms } = await load();
    expect((await readFarms()).map((farm) => farm.name)).toEqual(["A"]);
  });

  it("reads a non-array document as empty", async () => {
    writeDataFile("farms.json", { farms: [] });
    const { readFarms } = await load();
    expect(await readFarms()).toEqual([]);
  });

  it("adds, updates and removes farms", async () => {
    const { addFarm, readFarms, removeFarm, updateFarm } = await load();
    const farm = await addFarm({ ...input, note: "hi" }, "owner", "creator");
    expect(farm).toMatchObject({
      name: "Copper hill",
      note: "hi",
      ownerId: "owner",
      createdByMemberId: "creator",
      createdAt: now,
    });
    expect(farm).not.toHaveProperty("coordinates");
    expect(readDataFile("farms.json")).toEqual([farm]);

    vi.setSystemTime(new Date("2026-05-02T12:00:00.000Z"));
    const updated = await updateFarm(farm.id, { ...input, portal: portalB, coordinates: "1, 2" }, "new-owner");
    expect(updated).toEqual({
      id: farm.id,
      name: "Copper hill",
      portal: portalB,
      galaxy: 0,
      planetName: "Ruba",
      resources: ["Copper"],
      coordinates: "1, 2",
      ownerId: "new-owner",
      createdByMemberId: "creator",
      createdAt: now,
      updatedAt: "2026-05-02T12:00:00.000Z",
    });
    expect(await updateFarm("missing", input, "x")).toBeNull();

    expect(await removeFarm("missing")).toBe(false);
    expect(await removeFarm(farm.id)).toBe(true);
    expect(await readFarms()).toEqual([]);
  });

  it("persists newly added extractor resources and cultivable plants", async () => {
    const { addFarm, readFarms, updateFarm } = await load();
    const farm = await addFarm({ ...input, resources: ["Basalt", "Methane", "Mordite"] }, "owner", "owner");
    expect((await readFarms())[0].resources).toEqual(["Basalt", "Methane", "Mordite"]);
    await updateFarm(farm.id, { ...input, resources: ["Lithium", "Quartzite", "Frost Crystal"] }, "owner");
    expect((await readFarms())[0].resources).toEqual(["Lithium", "Quartzite", "Frost Crystal"]);
    expect(readDataFile("farms.json")).toMatchObject([
      { id: farm.id, resources: ["Lithium", "Quartzite", "Frost Crystal"] },
    ]);
  });

  it("persists, changes and removes the optional system name", async () => {
    const { addFarm, readFarms, updateFarm } = await load();
    const farm = await addFarm({ ...input, systemName: "Station Alpha" }, "owner", "creator");
    expect(await readFarms()).toMatchObject([{ systemName: "Station Alpha" }]);
    expect(readDataFile("farms.json")).toMatchObject([{ systemName: "Station Alpha" }]);

    await updateFarm(farm.id, { ...input, systemName: "My system" }, "owner");
    expect(await readFarms()).toMatchObject([{ systemName: "My system" }]);
    await updateFarm(farm.id, input, "owner");
    expect((await readFarms())[0]).not.toHaveProperty("systemName");
  });

  it("reassigns owner and creator references from an offline profile", async () => {
    const { addFarm, readFarms, reassignFarmOwner } = await load();
    await addFarm(input, "offline", "offline");
    await addFarm(input, "other", "staff");
    await reassignFarmOwner("offline", "target");
    expect((await readFarms()).map(({ ownerId, createdByMemberId }) => [ownerId, createdByMemberId])).toEqual([
      ["target", "target"],
      ["other", "staff"],
    ]);
  });

  it("keeps farms without a creator unchanged except for the reassigned owner", async () => {
    writeDataFile("farms.json", [
      { id: "a", ...input, ownerId: "offline", createdAt: now },
      { id: "b", ...input, ownerId: "other", createdByMemberId: "offline", createdAt: now },
    ]);
    const { readFarms, reassignFarmOwner, updateFarm } = await load();
    expect(await updateFarm("a", input, "offline")).not.toHaveProperty("createdByMemberId");
    await reassignFarmOwner("offline", "target");
    expect((await readFarms()).map(({ ownerId, createdByMemberId }) => [ownerId, createdByMemberId])).toEqual([
      ["target", undefined],
      ["other", "target"],
    ]);
  });

  it("does not write when no farm references the reassigned member", async () => {
    const { reassignFarmOwner } = await load();
    await reassignFarmOwner("offline", "target");
    expect(dataFileExists("farms.json")).toBe(false);
  });

  it("leaves the document untouched when only unrelated farms exist", async () => {
    const stored = [{ id: "a", ...input, ownerId: "other", createdByMemberId: "staff", createdAt: now }];
    writeDataFile("farms.json", stored);
    const { reassignFarmOwner } = await load();
    await reassignFarmOwner("offline", "target");
    expect(readDataFile("farms.json")).toEqual(stored);
  });
});

describe("farms store (Vercel Blob)", () => {
  it("reads and writes the private farms document", async () => {
    useBlobBackend();
    setBlobJson("alliance-manager/farms.json", []);
    const { addFarm, readFarms } = await load();
    const farm = await addFarm({ ...input, systemName: "Blob system" }, "owner", "owner");
    expect(readBlobJson("alliance-manager/farms.json")).toEqual([farm]);
    expect(blobMock.put).toHaveBeenCalledWith("alliance-manager/farms.json", expect.any(String), blobWriteOptions());
    expect(await readFarms()).toEqual([farm]);
    expect(farm).toMatchObject({
      systemName: "Blob system",
      planetName: "Ruba",
      portal: portalA,
      galaxy: 0,
    });
    expect(dataFileExists("farms.json")).toBe(false);
  });

  it("returns an empty list when the blob is missing", async () => {
    useBlobBackend();
    const { readFarms } = await load();
    expect(await readFarms()).toEqual([]);
  });
});
