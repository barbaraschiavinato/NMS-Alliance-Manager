import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { decodePortalAddress, isMissionInput, missionStatuses } from "@/lib/missions";
import { testLocalAccounts } from "@/lib/local-auth";

// The fixtures in fixtures/test-data/ are the starting data of `npm run dev:test`. They are read here with the real
// store readers, from a temporary copy, so a fixture the app cannot load fails the tests.
let dataDir = "";
let access: Awaited<ReturnType<typeof import("@/lib/access-store").readAccessData>>;
let missions: Awaited<ReturnType<typeof import("@/lib/store").readMissions>>;
let stations: Awaited<ReturnType<typeof import("@/lib/stations-store").readAllStationPortals>>;
let statuses: Awaited<ReturnType<typeof import("@/lib/planet-system-status-store").readPlanetSystemStatuses>>;
let messages: Awaited<ReturnType<typeof import("@/lib/private-messages-store").readPrivateMessages>>;
let missionsBefore: unknown;
let missionsAfter: unknown;

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "nms-test-data-"));
  // tests/setup.ts changes the working directory, so resolve the fixtures from this file.
  await cp(fileURLToPath(new URL("../../fixtures/test-data", import.meta.url)), dataDir, { recursive: true });
  vi.stubEnv("NMS_DATA_DIR", dataDir);
  vi.stubEnv("LOCAL_AUTH", "true");
  vi.resetModules();

  const [accessStore, missionsStore, stationsStore, statusStore, messagesStore] = await Promise.all([
    import("@/lib/access-store"),
    import("@/lib/store"),
    import("@/lib/stations-store"),
    import("@/lib/planet-system-status-store"),
    import("@/lib/private-messages-store"),
  ]);
  missionsBefore = JSON.parse(await readFile(path.join(dataDir, "missions.json"), "utf8"));
  access = await accessStore.readAccessData();
  missions = await missionsStore.readMissions();
  missionsAfter = JSON.parse(await readFile(path.join(dataDir, "missions.json"), "utf8"));
  stations = await stationsStore.readAllStationPortals();
  statuses = await statusStore.readPlanetSystemStatuses();
  messages = await messagesStore.readPrivateMessages();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(dataDir, { recursive: true, force: true });
});

describe("test data members", () => {
  it("includes every test account, approved and with the same profile", () => {
    for (const account of testLocalAccounts) {
      const member = access.members.find((item) => item.email === account.email);
      expect(member, account.email).toBeDefined();
      expect(member).toMatchObject({
        name: account.name,
        nmsName: account.nmsName,
        nmsCode: account.nmsCode,
        platforms: account.platforms,
        specialty: account.specialty,
        role: account.role,
        membershipStatus: "approved",
      });
    }
  });

  it("has unique ids, emails, in-game names and friend codes", () => {
    for (const field of ["publicId", "email", "nmsName", "nmsCode"] as const) {
      const values = access.members.map((member) => member[field].toLowerCase()).filter(Boolean);
      expect(new Set(values).size, field).toBe(values.length);
    }
  });

  it("covers offline, pending and blocked members", () => {
    expect(access.members.filter((member) => member.offline)).toHaveLength(2);
    expect(access.members.filter((member) => member.membershipStatus === "pending")).toHaveLength(1);
    expect(access.members.filter((member) => member.membershipStatus === "blocked")).toHaveLength(1);
  });

  it("names the alliance", () => {
    expect(access.alliance.name).toBe("Test Alliance");
  });
});

describe("test data missions", () => {
  const memberIds = () => new Set(access.members.map((member) => member.publicId));

  it("are valid mission inputs with unique ids", () => {
    expect(missions.length).toBeGreaterThan(0);
    for (const { id, ...mission } of missions) expect(isMissionInput(mission), id).toBe(true);
    expect(new Set(missions.map((mission) => mission.id)).size).toBe(missions.length);
  });

  it("are stored in the canonical format, so reading them does not rewrite the file", () => {
    expect(missionsAfter).toEqual(missionsBefore);
  });

  it("only reference existing members and resolve their names", () => {
    const ids = memberIds();
    for (const mission of missions) {
      for (const id of [mission.assignedMemberId, mission.createdByMemberId, mission.stationOwnerMemberId]) {
        if (id) expect(ids.has(id), `${mission.id}: ${id}`).toBe(true);
      }
      if (mission.assignedMemberId) expect(mission.assignedTo, mission.id).not.toBe("");
    }
  });

  it("cover the statuses and the specialties, with both assigned and open missions", () => {
    expect(new Set(missions.map((mission) => mission.status))).toEqual(new Set(missionStatuses));
    // explorer_builder is left out on purpose: store.ts reads it back as "all" (see CONCERNS.md, C-1yjcy9).
    const specialties = new Set(missions.map((mission) => mission.targetSpecialty));
    for (const specialty of ["all", "builder", "ranger", "explorer", "other"] as const) {
      expect(specialties.has(specialty), specialty).toBe(true);
    }
    expect(missions.some((mission) => mission.assignedMemberId)).toBe(true);
    expect(missions.some((mission) => !mission.assignedMemberId && mission.status === "pending")).toBe(true);
  });
});

describe("test data stations", () => {
  it("have valid portals and existing owners", () => {
    expect(stations.length).toBeGreaterThan(0);
    const ids = new Set(access.members.map((member) => member.publicId));
    for (const station of stations) {
      expect(decodePortalAddress(station.portal)?.errors, station.portal).toEqual([]);
      expect(ids.has(station.ownerId), station.portal).toBe(true);
    }
    const keys = stations.map((station) => `${station.galaxy}:${station.portal}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("have a system status entry each", () => {
    for (const station of stations) {
      expect(statuses[`${station.galaxy}:${station.portal}`], station.portal).toBeDefined();
    }
  });
});

describe("test data messages", () => {
  it("only involve existing members and replies point to existing messages", () => {
    const ids = new Set(access.members.map((member) => member.publicId));
    const messageIds = new Set(messages.map((message) => message.id));
    expect(messages.some((message) => message.subjectType === "help")).toBe(true);
    expect(messages.some((message) => message.unread)).toBe(true);
    for (const message of messages) {
      expect(ids.has(message.senderMemberId ?? ""), message.id).toBe(true);
      if (message.recipientMemberId) expect(ids.has(message.recipientMemberId), message.id).toBe(true);
      if (message.replyToId) expect(messageIds.has(message.replyToId), message.id).toBe(true);
      expect(messageIds.has(message.threadId ?? message.id), message.id).toBe(true);
    }
  });
});
