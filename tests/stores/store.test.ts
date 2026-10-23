import { writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mission } from "@/lib/missions/missions";
import { makeMember, seedMembers, writeDataFile } from "../helpers/members";
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
// Una missione demo, per coprire il recupero di indirizzo e galassia dal seed.
vi.mock("@/lib/missions/seed", () => ({
  initialMissions: [
    {
      id: "seed-1",
      title: "Seed mission",
      description: "",
      system: "Seed System",
      systemAddress: "0123456789AB",
      galaxy: 7,
      assignedTo: "",
      targetSpecialty: "all",
      dueDate: "",
      status: "pending",
      priority: "normal",
      progress: 0,
    },
  ],
}));

const load = () => import("@/lib/missions/store");

function storedMission(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "m-1",
    title: "Mission",
    description: "desc",
    system: "Sys",
    systemAddress: "1ABC12345678",
    galaxy: 3,
    targetSpecialty: "ranger",
    dueDate: "2026-06-01",
    status: "in_progress",
    priority: "high",
    progress: 10,
    ...overrides,
  };
}

const missionsFile = () => readDataFile("missions.json") as Record<string, unknown>[];

beforeEach(() => {
  resetStores();
});

describe("readMissions (local filesystem)", () => {
  it("returns the seed when the file does not exist, without writing", async () => {
    const { readMissions } = await load();
    const { initialMissions } = await import("@/lib/missions/seed");
    expect(await readMissions()).toBe(initialMissions);
    expect(dataFileExists("missions.json")).toBe(false);
  });

  it("returns the seed when the document is not an array", async () => {
    writeDataFile("missions.json", { missions: [] });
    const { readMissions } = await load();
    const { initialMissions } = await import("@/lib/missions/seed");
    expect(await readMissions()).toBe(initialMissions);
    expect(readDataFile("missions.json")).toEqual({ missions: [] });
  });

  it("rethrows malformed JSON and non-ENOENT errors", async () => {
    writeDataFile("missions.json", []);
    writeFileSync(`${dataDir()}/missions.json`, "[oops");
    const { readMissions } = await load();
    await expect(readMissions()).rejects.toThrow(SyntaxError);
  });

  it("rethrows filesystem errors other than ENOENT", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(`${dataDir()}/missions.json`, { recursive: true });
    const { readMissions } = await load();
    await expect(readMissions()).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("reads current missions without rewriting the file", async () => {
    const owner = makeMember();
    seedMembers([owner]);
    writeDataFile("missions.json", [storedMission({ stationOwnerMemberId: owner.publicId })]);
    const before = readRawDataFile("missions.json");
    const { readMissions } = await load();
    expect(await readMissions()).toEqual([
      {
        ...storedMission(),
        stationOwnerMemberId: owner.publicId,
        stationOwnerName: owner.nmsName,
        assignedTo: "",
      },
    ]);
    expect(readRawDataFile("missions.json")).toBe(before);
  });

  it.each([
    ["In corso", "in_progress"],
    ["In attesa", "pending"],
    ["Completata", "completed"],
    ["In progress", "in_progress"],
    ["Pending", "pending"],
    ["Completed", "completed"],
  ])("migrates the legacy status %j and writes it back", async (legacy, expected) => {
    writeDataFile("missions.json", [storedMission({ status: legacy })]);
    const { readMissions } = await load();
    expect((await readMissions())[0].status).toBe(expected);
    expect(missionsFile()[0].status).toBe(expected);
  });

  it.each([
    ["Urgente", "urgent"],
    ["Alta", "high"],
    ["Normale", "normal"],
    ["Urgent", "urgent"],
    ["High", "high"],
    ["Normal", "normal"],
  ])("migrates the legacy priority %j and writes it back", async (legacy, expected) => {
    writeDataFile("missions.json", [storedMission({ priority: legacy })]);
    const { readMissions } = await load();
    expect((await readMissions())[0].priority).toBe(expected);
    expect(missionsFile()[0].priority).toBe(expected);
  });

  it.each([
    ["status", { status: "Done" }, "Invalid mission status in stored mission data."],
    ["status type", { status: 1 }, "Invalid mission status in stored mission data."],
    ["priority", { priority: "Low" }, "Invalid mission priority in stored mission data."],
    ["priority type", { priority: undefined }, "Invalid mission priority in stored mission data."],
  ])("throws on an invalid %s", async (_label, overrides, message) => {
    writeDataFile("missions.json", [storedMission(overrides)]);
    const { readMissions } = await load();
    await expect(readMissions()).rejects.toThrow(message);
  });

  it("resolves legacy emails to member publicIds (case-insensitive) and strips them on write", async () => {
    const owner = makeMember({ email: "owner@example.com" });
    const creator = makeMember({ email: "creator@example.com" });
    const assignee = makeMember({ email: "assignee@example.com" });
    seedMembers([owner, creator, assignee]);
    writeDataFile("missions.json", [
      storedMission({
        stationOwnerEmail: "OWNER@example.com",
        createdByEmail: "Creator@Example.com",
        assignedEmail: "assignee@EXAMPLE.com",
      }),
    ]);
    const { readMissions } = await load();
    const [mission] = await readMissions();
    expect(mission).toMatchObject({
      stationOwnerMemberId: owner.publicId,
      createdByMemberId: creator.publicId,
      assignedMemberId: assignee.publicId,
      assignedTo: assignee.nmsName,
    });
    expect(mission).not.toHaveProperty("stationOwnerEmail");
    expect(mission).not.toHaveProperty("createdByName");
    expect(mission).not.toHaveProperty("stationOwnerName");
    const [stored] = missionsFile();
    expect(stored).toEqual({
      ...storedMission(),
      stationOwnerMemberId: owner.publicId,
      createdByMemberId: creator.publicId,
      assignedMemberId: assignee.publicId,
    });
  });

  it("resolves legacy names by NMS name or account name when the match is unique", async () => {
    const owner = makeMember({ nmsName: "Owner Nms", name: "Owner Account" });
    const creator = makeMember({ nmsName: "", name: "Creator Account" });
    const assignee = makeMember({ nmsName: "Assignee" });
    seedMembers([owner, creator, assignee]);
    writeDataFile("missions.json", [
      storedMission({
        stationOwnerName: "  owner account ",
        createdByName: "CREATOR ACCOUNT",
        assignedTo: "assignee",
      }),
    ]);
    const { readMissions } = await load();
    const [mission] = await readMissions();
    expect(mission).toMatchObject({
      stationOwnerMemberId: owner.publicId,
      stationOwnerName: "Owner Nms",
      createdByMemberId: creator.publicId,
      createdByName: "Creator Account",
      assignedMemberId: assignee.publicId,
      assignedTo: "Assignee",
    });
    expect(missionsFile()[0]).not.toHaveProperty("assignedTo");
  });

  it("labels unmatched, ambiguous or blank legacy names as former members", async () => {
    seedMembers([makeMember({ nmsName: "Twin" }), makeMember({ nmsName: "twin" })]);
    writeDataFile("missions.json", [
      storedMission({
        stationOwnerName: "Twin",
        createdByName: "Nobody",
        assignedTo: "   ",
      }),
    ]);
    const { readMissions } = await load();
    const [mission] = await readMissions();
    expect(mission).toMatchObject({
      stationOwnerName: "Former member",
      createdByName: "Former member",
      assignedTo: "Former member",
    });
    expect(mission).not.toHaveProperty("stationOwnerMemberId");
    expect(mission).not.toHaveProperty("createdByMemberId");
    expect(mission).not.toHaveProperty("assignedMemberId");
  });

  it("prefers stored member ids over legacy emails and names", async () => {
    const byId = makeMember({ nmsName: "By Id" });
    const byEmail = makeMember({ email: "by-email@example.com", nmsName: "By Email" });
    seedMembers([byId, byEmail]);
    writeDataFile("missions.json", [
      storedMission({
        createdByMemberId: byId.publicId,
        createdByEmail: "by-email@example.com",
        createdByName: "By Email",
        assignedMemberId: byId.publicId,
        assignedEmail: "by-email@example.com",
      }),
    ]);
    const { readMissions } = await load();
    const [mission] = await readMissions();
    expect(mission).toMatchObject({
      createdByMemberId: byId.publicId,
      createdByName: "By Id",
      assignedMemberId: byId.publicId,
    });
  });

  it("derives names for stored ids and falls back for deleted members", async () => {
    const creator = makeMember();
    seedMembers([creator]);
    writeDataFile("missions.json", [
      storedMission({
        createdByMemberId: creator.publicId,
        stationOwnerMemberId: "deleted-member",
        assignedMemberId: "deleted-member",
      }),
    ]);
    const { readMissions } = await load();
    const [mission] = await readMissions();
    expect(mission).toMatchObject({
      createdByName: creator.nmsName,
      stationOwnerMemberId: "deleted-member",
      stationOwnerName: "Former member",
      assignedMemberId: "deleted-member",
      assignedTo: "",
    });
  });

  it("falls back to the account name when a member has no NMS name", async () => {
    const owner = makeMember({ nmsName: "", name: "Owner Account" });
    const assignee = makeMember({ nmsName: "", name: "Assignee Account" });
    seedMembers([owner, assignee]);
    writeDataFile("missions.json", [
      storedMission({ stationOwnerMemberId: owner.publicId, assignedMemberId: assignee.publicId }),
    ]);
    const { readMissions } = await load();
    expect((await readMissions())[0]).toMatchObject({
      stationOwnerName: "Owner Account",
      assignedTo: "Assignee Account",
    });
  });

  it("ignores non-string legacy email fields but still rewrites the document", async () => {
    writeDataFile("missions.json", [storedMission({ stationOwnerEmail: 5, createdByEmail: null, assignedEmail: {} })]);
    const { readMissions } = await load();
    const [mission] = await readMissions();
    expect(mission).not.toHaveProperty("stationOwnerMemberId");
    expect(missionsFile()[0]).toEqual(storedMission());
  });

  it("normalizes system, galaxy and target specialty", async () => {
    writeDataFile("missions.json", [
      storedMission({ id: "a", system: 42, galaxy: "3", targetSpecialty: "pilot" }),
      storedMission({ id: "b", targetSpecialty: "builder" }),
      storedMission({ id: "c", targetSpecialty: "explorer" }),
      storedMission({ id: "d", targetSpecialty: "other" }),
      storedMission({ id: "e", targetSpecialty: "all" }),
      storedMission({ id: "f", targetSpecialty: "ranger" }),
    ]);
    const { readMissions } = await load();
    const missions = await readMissions();
    expect(missions[0]).toMatchObject({ system: "", galaxy: 0, targetSpecialty: "all" });
    expect(missions.slice(1).map((mission) => mission.targetSpecialty)).toEqual([
      "builder",
      "explorer",
      "other",
      "all",
      "ranger",
    ]);
  });

  it.todo('keeps the explorer_builder target specialty (currently turned into "all" on read, see report)');

  it("fills a missing address and galaxy from the matching seed mission", async () => {
    writeDataFile("missions.json", [
      storedMission({ id: "seed-1", title: "Seed mission", system: "Seed System", systemAddress: "", galaxy: 0 }),
      storedMission({ id: "seed-1", title: "Renamed", system: "Seed System", systemAddress: undefined, galaxy: 4 }),
    ]);
    const { readMissions } = await load();
    const missions = await readMissions();
    expect(missions[0]).toMatchObject({ systemAddress: "0123456789AB", galaxy: 7 });
    expect(missions[1]).toMatchObject({ systemAddress: "", galaxy: 4 });
  });

  it("moves legacy per-mission system statuses into the planet status store", async () => {
    writeDataFile("missions.json", [storedMission({ systemStatus: ["Mappato", "renamed"] })]);
    const { readMissions } = await load();
    const [mission] = await readMissions();
    expect(mission).not.toHaveProperty("systemStatus");
    expect(readDataFile("planet-system-status.json")).toEqual({ "3:1ABC12345678": ["mapped", "renamed"] });
  });

  it.todo(
    "rewrites missions.json after moving legacy systemStatus out (it is only dropped from the returned value, see report)",
  );
});

describe("writeMissions", () => {
  it("strips derived fields before writing locally", async () => {
    const { writeMissions } = await load();
    const mission = {
      ...storedMission(),
      createdByName: "x",
      stationOwnerName: "y",
      assignedTo: "z",
      stationOwnerEmail: "a@example.com",
      createdByEmail: "b@example.com",
      assignedEmail: "c@example.com",
    } as unknown as Mission;
    await writeMissions([mission]);
    expect(missionsFile()).toEqual([storedMission()]);
    expect(readRawDataFile("missions.json")).toBe(`${JSON.stringify([storedMission()], null, 2)}\n`);
  });
});

describe("Blob backend", () => {
  beforeEach(() => {
    useBlobBackend();
  });

  it("returns the seed when the blob is missing or unchanged", async () => {
    const { readMissions } = await load();
    const { initialMissions } = await import("@/lib/missions/seed");
    expect(await readMissions()).toBe(initialMissions);
    expect(blobMock.get).toHaveBeenCalledWith("alliance-manager/missions.json", blobReadOptions());
    setBlobJson("alliance-manager/missions.json", [storedMission()]);
    blobMock.get.mockResolvedValueOnce({ statusCode: 304, stream: null });
    expect(await readMissions()).toBe(initialMissions);
  });

  it("reads, migrates and writes back through Blob", async () => {
    setBlobJson("alliance-manager/missions.json", [storedMission({ status: "Completata", assignedTo: "" })]);
    const { readMissions } = await load();
    const [mission] = await readMissions();
    expect(mission.status).toBe("completed");
    expect(blobMock.put).toHaveBeenCalledWith("alliance-manager/missions.json", expect.any(String), blobWriteOptions());
    expect(readBlobJson("alliance-manager/missions.json")).toEqual([{ ...storedMission(), status: "completed" }]);
    expect(dataFileExists("missions.json")).toBe(false);
  });

  it("does not write when nothing changed", async () => {
    setBlobJson("alliance-manager/missions.json", [storedMission()]);
    const { readMissions } = await load();
    await readMissions();
    expect(blobMock.put).not.toHaveBeenCalled();
  });
});
