import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessData } from "@/lib/access-store";
import { makeMember, seedMembers, writeDataFile } from "../helpers/members";
import { dataFileExists, portalA, portalB, readDataFile, resetStores } from "./helpers";

vi.mock("@vercel/blob", async () => (await import("./helpers")).blobModule);

const load = () => import("@/lib/offline-members");
const now = "2026-05-01T12:00:00.000Z";

function mission(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: id,
    description: "",
    system: "",
    systemAddress: portalA,
    galaxy: 0,
    targetSpecialty: "all",
    dueDate: "",
    status: "pending",
    priority: "normal",
    progress: 0,
    ...overrides,
  };
}

const accessFile = () => readDataFile("access.json") as AccessData;

beforeEach(() => {
  resetStores();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("linkOfflineMember", () => {
  it("refuses to link a member to itself", async () => {
    const offline = makeMember({ offline: true });
    seedMembers([offline]);
    const { linkOfflineMember } = await load();
    expect(await linkOfflineMember(offline.publicId, offline.publicId)).toBe(false);
  });

  it("requires an offline source and an online target", async () => {
    const offline = makeMember({ offline: true });
    const otherOffline = makeMember({ offline: true });
    const online = makeMember();
    seedMembers([offline, otherOffline, online]);
    const { linkOfflineMember } = await load();
    expect(await linkOfflineMember(online.publicId, offline.publicId)).toBe(false);
    expect(await linkOfflineMember(offline.publicId, otherOffline.publicId)).toBe(false);
    expect(await linkOfflineMember("missing", online.publicId)).toBe(false);
    expect(await linkOfflineMember(offline.publicId, "missing")).toBe(false);
    expect(accessFile().members).toHaveLength(3);
    expect(dataFileExists("missions.json")).toBe(false);
  });

  it("reassigns missions, stations and messages, then removes the offline profile", async () => {
    const offline = makeMember({ offline: true, nmsName: "Offline" });
    const target = makeMember({ nmsName: "Target" });
    const other = makeMember();
    seedMembers([offline, target, other]);
    writeDataFile("missions.json", [
      mission("m1", {
        createdByMemberId: offline.publicId,
        stationOwnerMemberId: offline.publicId,
        assignedMemberId: offline.publicId,
      }),
      mission("m2", { createdByMemberId: other.publicId, assignedMemberId: other.publicId }),
    ]);
    writeDataFile("stations-v2.json", [
      { ownerId: offline.publicId, portal: portalA, galaxy: 0 },
      { ownerId: other.publicId, portal: portalB, galaxy: 0, createdByMemberId: offline.publicId },
    ]);
    writeDataFile("private-messages.json", [
      { id: "p1", senderMemberId: offline.publicId, recipientMemberId: other.publicId, body: "a", createdAt: now },
      { id: "p2", senderMemberId: other.publicId, recipientMemberId: offline.publicId, body: "b", createdAt: now },
    ]);
    const { linkOfflineMember } = await load();
    expect(await linkOfflineMember(offline.publicId, target.publicId)).toBe(true);

    expect(readDataFile("missions.json")).toEqual([
      mission("m1", {
        createdByMemberId: target.publicId,
        stationOwnerMemberId: target.publicId,
        assignedMemberId: target.publicId,
      }),
      mission("m2", { createdByMemberId: other.publicId, assignedMemberId: other.publicId }),
    ]);
    expect(readDataFile("stations-v2.json")).toEqual([
      { portal: portalA, galaxy: 0, ownerId: target.publicId },
      { portal: portalB, galaxy: 0, ownerId: other.publicId, createdByMemberId: target.publicId },
    ]);
    expect(readDataFile("private-messages.json")).toEqual([
      { id: "p1", senderMemberId: target.publicId, recipientMemberId: other.publicId, body: "a", createdAt: now },
      { id: "p2", senderMemberId: other.publicId, recipientMemberId: target.publicId, body: "b", createdAt: now },
    ]);
    // Il target aveva già un profilo completo: resta invariato.
    expect(accessFile().members).toEqual([target, other]);
  });

  it.each([
    ["no NMS name", { nmsName: "" }],
    ["an invalid friend code", { nmsCode: "BAD" }],
    ["no specialty", { specialty: "" as const }],
  ])("copies the offline profile when the target has %s", async (_label, incomplete) => {
    const offline = makeMember({
      offline: true,
      nmsName: "Offline Name",
      nmsCode: "OFFLINECODE01",
      telegramName: "tg",
      discordName: "dc",
      platforms: ["Xbox", "Mac"],
      specialty: "ranger",
    });
    const target = makeMember({ ...incomplete, telegramName: "keep-tg", platforms: ["PC"] });
    seedMembers([offline, target]);
    const { linkOfflineMember } = await load();
    expect(await linkOfflineMember(offline.publicId, target.publicId)).toBe(true);
    expect(accessFile().members).toEqual([
      {
        ...target,
        nmsName: "Offline Name",
        nmsCode: "OFFLINECODE01",
        telegramName: "tg",
        discordName: "dc",
        platforms: ["Xbox", "Mac"],
        specialty: "ranger",
      },
    ]);
  });

  it("keeps the target's contact names when the offline profile has none", async () => {
    const offline = makeMember({ offline: true, specialty: "builder" });
    const target = makeMember({ nmsName: "", telegramName: "keep-tg", discordName: "keep-dc" });
    seedMembers([offline, target]);
    const { linkOfflineMember } = await load();
    await linkOfflineMember(offline.publicId, target.publicId);
    expect(accessFile().members[0]).toMatchObject({
      nmsName: offline.nmsName,
      telegramName: "keep-tg",
      discordName: "keep-dc",
      specialty: "builder",
    });
  });

  it("approves a pending target using the offline approver", async () => {
    const offline = makeMember({ offline: true, approvedBy: "mod@example.com" });
    const target = makeMember({ membershipStatus: "pending", approvedBy: "", approvedAt: "" });
    seedMembers([offline, target]);
    const { linkOfflineMember } = await load();
    expect(await linkOfflineMember(offline.publicId, target.publicId)).toBe(true);
    expect(accessFile().members[0]).toMatchObject({
      membershipStatus: "approved",
      approvedBy: "mod@example.com",
      approvedAt: now,
    });
  });

  it("leaves a blocked target blocked", async () => {
    const offline = makeMember({ offline: true });
    const target = makeMember({ membershipStatus: "blocked" });
    seedMembers([offline, target]);
    const { linkOfflineMember } = await load();
    await linkOfflineMember(offline.publicId, target.publicId);
    expect(accessFile().members[0]).toMatchObject({ membershipStatus: "blocked", approvedAt: target.approvedAt });
  });

  it("works when no missions, stations or messages exist", async () => {
    const offline = makeMember({ offline: true });
    const target = makeMember();
    seedMembers([offline, target]);
    const { linkOfflineMember } = await load();
    expect(await linkOfflineMember(offline.publicId, target.publicId)).toBe(true);
    expect(readDataFile("missions.json")).toEqual([]);
    expect(dataFileExists("stations-v2.json")).toBe(false);
    expect(readDataFile("private-messages.json")).toEqual([]);
  });
});
