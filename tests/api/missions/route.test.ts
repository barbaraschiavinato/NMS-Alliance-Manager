import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mission } from "@/lib/missions";
import { signInAs } from "../../helpers/auth";
import { jsonRequest } from "../../helpers/http";
import { makeMember, seedMembers } from "../../helpers/members";
import {
  OTHER_PORTAL,
  PORTAL,
  SAME_SYSTEM_OTHER_PLANET,
  THIRD_PORTAL,
  corruptDataFile,
  missionInput,
  readStoredMissions,
  resetData,
  seedMissions,
  seedStations,
  storedMission,
} from "./fixtures";

vi.mock("@/auth", async () => (await import("../../helpers/auth")).authMock);

const { GET, POST } = await import("@/app/api/missions/route");

const post = (body: unknown) => POST(jsonRequest("/api/missions", "POST", body));

beforeEach(() => {
  resetData();
  signInAs(null);
});

describe("GET /api/missions", () => {
  const explorer = makeMember({ specialty: "explorer" });
  const builder = makeMember({ specialty: "builder" });
  const moderator = makeMember({ role: "moderator", specialty: "ranger" });
  const simpleAdmin = makeMember({ role: "admin", specialty: "ranger", simpleView: true });
  const missions = {
    forAll: storedMission({ title: "All", targetSpecialty: "all" }),
    forExplorer: storedMission({ title: "Explorer", targetSpecialty: "explorer", systemAddress: OTHER_PORTAL }),
    forBuilder: storedMission({ title: "Builder", targetSpecialty: "builder" }),
    assignedToExplorer: storedMission({
      title: "Mine",
      targetSpecialty: "explorer",
      systemAddress: THIRD_PORTAL,
      assignedMemberId: explorer.publicId,
    }),
    assignedToOther: storedMission({ title: "Taken", targetSpecialty: "explorer", assignedMemberId: builder.publicId }),
  };

  beforeEach(() => {
    seedMembers([explorer, builder, moderator, simpleAdmin]);
    seedMissions(Object.values(missions));
  });

  it("requires a session", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it.each([
    ["pending", makeMember({ membershipStatus: "pending" })],
    ["blocked", makeMember({ membershipStatus: "blocked" })],
    ["offline", makeMember({ offline: true })],
  ])("rejects %s members", async (_label, member) => {
    seedMembers([member]);
    signInAs(member);
    expect((await GET()).status).toBe(401);
  });

  it("shows users only missions for their specialty that are free or assigned to them", async () => {
    signInAs(explorer);
    const res = await GET();
    expect(res.status).toBe(200);
    const titles = ((await res.json()) as Mission[]).map((mission) => mission.title).sort();
    expect(titles).toEqual(["All", "Explorer", "Mine"]);
  });

  it("resolves derived names from members", async () => {
    signInAs(explorer);
    const body = (await (await GET()).json()) as Mission[];
    expect(body.find((mission) => mission.title === "Mine")?.assignedTo).toBe(explorer.nmsName);
  });

  it("shows moderators every mission", async () => {
    signInAs(moderator);
    const body = (await (await GET()).json()) as Mission[];
    expect(body).toHaveLength(Object.keys(missions).length);
  });

  it("treats a simple-view admin as a user", async () => {
    signInAs(simpleAdmin);
    const titles = ((await (await GET()).json()) as Mission[]).map((mission) => mission.title);
    expect(titles).toEqual(["All"]);
  });

  it("returns 503 when missions cannot be read", async () => {
    corruptDataFile("missions.json");
    vi.spyOn(console, "error").mockImplementation(() => {});
    signInAs(moderator);
    const res = await GET();
    expect(res.status).toBe(503);
  });
});

describe("POST /api/missions", () => {
  const moderator = makeMember({ role: "moderator", specialty: "" });
  const admin = makeMember({ role: "admin", specialty: "" });
  const simpleAdmin = makeMember({ role: "admin", specialty: "", simpleView: true });
  const explorer = makeMember({ specialty: "explorer" });
  const builder = makeMember({ specialty: "builder" });
  const ranger = makeMember({ specialty: "ranger" });
  const noSpecialty = makeMember({ specialty: "" });
  const stationOwner = makeMember({ specialty: "ranger" });
  const pendingMember = makeMember({ membershipStatus: "pending" });
  const offlineExplorer = makeMember({ specialty: "explorer", offline: true, nmsCode: "" });
  const nameless = makeMember({ specialty: "explorer", nmsName: "" });

  beforeEach(() => {
    seedMembers([
      moderator,
      admin,
      simpleAdmin,
      explorer,
      builder,
      ranger,
      noSpecialty,
      stationOwner,
      pendingMember,
      offlineExplorer,
      nameless,
    ]);
    seedMissions([]);
    seedStations([
      { portal: PORTAL, galaxy: 0, ownerId: stationOwner.publicId },
      { portal: OTHER_PORTAL, galaxy: 0, ownerId: ranger.publicId },
    ]);
  });

  it("requires a session", async () => {
    expect((await post(missionInput())).status).toBe(401);
  });

  it.each([
    ["pending", makeMember({ role: "moderator", membershipStatus: "pending" })],
    ["blocked", makeMember({ role: "moderator", membershipStatus: "blocked" })],
  ])("rejects %s members", async (_label, member) => {
    seedMembers([member]);
    signInAs(member);
    expect((await post(missionInput())).status).toBe(401);
    expect(readStoredMissions()).toEqual([]);
  });

  it.each([
    ["malformed JSON", "{"],
    ["missing title", { ...missionInput(), title: " " }],
    ["invalid address", missionInput({ systemAddress: "FFFFFFFFFFFF" })],
    ["out of range galaxy", missionInput({ galaxy: 256 })],
    ["unknown specialty", { ...missionInput(), targetSpecialty: "pilot" }],
  ])("rejects %s with 400", async (_label, body) => {
    signInAs(moderator);
    const res = await post(body);
    expect(res.status).toBe(400);
  });

  describe("moderators", () => {
    it.each([
      ["moderator", moderator],
      ["admin", admin],
    ])("%s creates a mission and it is persisted", async (_label, member) => {
      signInAs(member);
      const res = await post(missionInput({ targetSpecialty: "builder" }));
      expect(res.status).toBe(201);
      const [created] = (await res.json()) as Mission[];
      expect(created).toMatchObject({
        targetSpecialty: "builder",
        systemAddress: PORTAL,
        createdByMemberId: member.publicId,
        createdByName: member.nmsName,
        assignedTo: "",
      });
      const stored = readStoredMissions();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ id: created.id, systemAddress: PORTAL, createdByMemberId: member.publicId });
      expect(stored[0]).not.toHaveProperty("assignedTo");
      expect(stored[0]).not.toHaveProperty("createdByName");
    });

    it("may create a mission for an already covered specialty", async () => {
      seedMissions([storedMission({ targetSpecialty: "builder" })]);
      signInAs(moderator);
      expect((await post(missionInput({ targetSpecialty: "builder" }))).status).toBe(201);
      expect(readStoredMissions()).toHaveLength(2);
    });

    it("fans out an 'all' mission and assigns only the matching specialty", async () => {
      signInAs(moderator);
      const res = await post(missionInput({ targetSpecialty: "all", assignedMemberId: explorer.publicId }));
      expect(res.status).toBe(201);
      const created = (await res.json()) as Mission[];
      expect(created.map((mission) => mission.targetSpecialty)).toEqual(["builder", "ranger", "explorer"]);
      expect(created.find((mission) => mission.targetSpecialty === "explorer")?.assignedMemberId).toBe(
        explorer.publicId,
      );
      expect(created.filter((mission) => mission.assignedMemberId)).toHaveLength(1);
      const stored = readStoredMissions();
      expect(stored).toHaveLength(3);
      expect(new Set(stored.map((mission) => mission.id)).size).toBe(3);
    });

    it("fans out an 'explorer_builder' mission", async () => {
      signInAs(moderator);
      const res = await post(missionInput({ targetSpecialty: "explorer_builder", assignedMemberId: builder.publicId }));
      expect(res.status).toBe(201);
      const created = (await res.json()) as Mission[];
      expect(created.map((mission) => [mission.targetSpecialty, mission.assignedMemberId])).toEqual([
        ["builder", builder.publicId],
        ["explorer", undefined],
      ]);
    });

    it("assigns a registered member and resolves the station owner", async () => {
      signInAs(moderator);
      const res = await post(
        missionInput({
          targetSpecialty: "explorer",
          assignedMemberId: ` ${explorer.publicId} `,
          stationOwnerMemberId: stationOwner.publicId,
        }),
      );
      expect(res.status).toBe(201);
      const [created] = (await res.json()) as Mission[];
      expect(created).toMatchObject({
        assignedMemberId: explorer.publicId,
        assignedTo: explorer.nmsName,
        stationOwnerMemberId: stationOwner.publicId,
        stationOwnerName: stationOwner.nmsName,
      });
      expect(readStoredMissions()[0]).toMatchObject({
        assignedMemberId: explorer.publicId,
        stationOwnerMemberId: stationOwner.publicId,
      });
    });

    it("uses the account name for a creator and station owner without in-game name", async () => {
      const namelessModerator = makeMember({ role: "moderator", specialty: "", nmsName: "", name: "Mod Account" });
      const namelessOwner = makeMember({ specialty: "ranger", nmsName: "", name: "Owner Account" });
      seedMembers([moderator, namelessModerator, namelessOwner]);
      seedStations([{ portal: THIRD_PORTAL, galaxy: 0, ownerId: namelessOwner.publicId }]);
      signInAs(namelessModerator);
      const res = await post(
        missionInput({ systemAddress: THIRD_PORTAL, stationOwnerMemberId: namelessOwner.publicId }),
      );
      expect(res.status).toBe(201);
      const [created] = (await res.json()) as Mission[];
      expect(created).toMatchObject({
        createdByMemberId: namelessModerator.publicId,
        createdByName: "Mod Account",
        stationOwnerMemberId: namelessOwner.publicId,
        stationOwnerName: "Owner Account",
      });
    });

    it("accepts an offline member without friend code as assignee", async () => {
      signInAs(moderator);
      const res = await post(missionInput({ assignedMemberId: offlineExplorer.publicId }));
      expect(res.status).toBe(201);
      expect(readStoredMissions()[0].assignedMemberId).toBe(offlineExplorer.publicId);
    });

    it.each([
      ["unknown", "00000000-0000-4000-8000-000000000000"],
      ["pending", pendingMember.publicId],
      ["nameless", nameless.publicId],
    ])("rejects an %s assignee with 400", async (_label, assignedMemberId) => {
      signInAs(moderator);
      const res = await post(missionInput({ assignedMemberId }));
      expect(res.status).toBe(400);
      expect(readStoredMissions()).toEqual([]);
    });

    it.each([
      ["a member without that station", explorer.publicId],
      ["an unknown member", "00000000-0000-4000-8000-000000000000"],
      ["a pending member", pendingMember.publicId],
    ])("rejects %s as station owner with 400", async (_label, stationOwnerMemberId) => {
      signInAs(moderator);
      const res = await post(missionInput({ stationOwnerMemberId }));
      expect(res.status).toBe(400);
      expect(readStoredMissions()).toEqual([]);
    });

    it("rejects another planet of a system that already has a mission", async () => {
      seedMissions([storedMission({ systemAddress: PORTAL })]);
      signInAs(moderator);
      const res = await post(missionInput({ systemAddress: SAME_SYSTEM_OTHER_PLANET }));
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "errors.another_planet_from_system_already_registered" });
      expect(readStoredMissions()).toHaveLength(1);
    });

    it("rejects another planet of a system that already has a station", async () => {
      signInAs(moderator);
      const res = await post(missionInput({ systemAddress: SAME_SYSTEM_OTHER_PLANET }));
      expect(res.status).toBe(409);
    });

    it("allows the same planet address in another galaxy", async () => {
      seedMissions([storedMission({ systemAddress: PORTAL })]);
      signInAs(moderator);
      expect((await post(missionInput({ systemAddress: SAME_SYSTEM_OTHER_PLANET, galaxy: 3 }))).status).toBe(201);
    });

    it("returns 503 when missions cannot be read", async () => {
      corruptDataFile("missions.json");
      vi.spyOn(console, "error").mockImplementation(() => {});
      signInAs(moderator);
      expect((await post(missionInput())).status).toBe(503);
    });
  });

  describe("simple-view admin", () => {
    it("is treated as a user without specialty", async () => {
      signInAs(simpleAdmin);
      const res = await post(missionInput({ targetSpecialty: "all" }));
      expect(res.status).toBe(403);
      expect(readStoredMissions()).toEqual([]);
    });
  });

  describe("users without explorer/builder/ranger specialty", () => {
    it("cannot create missions", async () => {
      signInAs(noSpecialty);
      expect((await post(missionInput())).status).toBe(403);
    });
  });

  describe("explorers and builders", () => {
    const ownMission = (member: typeof explorer) =>
      missionInput({
        targetSpecialty: member.specialty as "explorer" | "builder",
        assignedMemberId: member.publicId,
        stationOwnerMemberId: stationOwner.publicId,
      });

    it.each([
      ["explorer", explorer],
      ["builder", builder],
    ])("%s creates a self-assigned mission for their specialty", async (_label, member) => {
      signInAs(member);
      const res = await post(ownMission(member));
      expect(res.status).toBe(201);
      const [created] = (await res.json()) as Mission[];
      expect(created).toMatchObject({
        targetSpecialty: member.specialty,
        assignedMemberId: member.publicId,
        stationOwnerMemberId: stationOwner.publicId,
      });
      expect(readStoredMissions()).toHaveLength(1);
    });

    it.each([
      ["another specialty", { targetSpecialty: "builder" as const }],
      ["an assignment to someone else", { assignedMemberId: builder.publicId }],
      ["no assignment", { assignedMemberId: undefined }],
      ["no station owner", { stationOwnerMemberId: undefined }],
    ])("rejects %s with 403", async (_label, overrides) => {
      signInAs(explorer);
      const res = await post({ ...ownMission(explorer), ...overrides });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "missions.only_create_and_assign_your_specialty" });
    });

    it("rejects a station not owned by the selected owner", async () => {
      signInAs(explorer);
      const res = await post({ ...ownMission(explorer), stationOwnerMemberId: ranger.publicId });
      expect(res.status).toBe(400);
    });

    it.each([
      ["the same specialty", "explorer" as const],
      ["an 'all' mission", "all" as const],
    ])("rejects a system already covered by %s with 409", async (_label, targetSpecialty) => {
      seedMissions([storedMission({ targetSpecialty })]);
      signInAs(explorer);
      const res = await post(ownMission(explorer));
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "missions.mission_already_exists_for_specialty" });
      expect(readStoredMissions()).toHaveLength(1);
    });

    it("may create a mission when only another specialty covers the system", async () => {
      seedMissions([storedMission({ targetSpecialty: "builder" })]);
      signInAs(explorer);
      expect((await post(ownMission(explorer))).status).toBe(201);
    });
  });

  describe("rangers", () => {
    const rangerMission = (overrides = {}) =>
      missionInput({
        systemAddress: OTHER_PORTAL,
        targetSpecialty: "explorer",
        stationOwnerMemberId: ranger.publicId,
        ...overrides,
      });

    it("creates an unassigned mission for their own station", async () => {
      signInAs(ranger);
      const res = await post(rangerMission());
      expect(res.status).toBe(201);
      expect(readStoredMissions()[0]).toMatchObject({
        targetSpecialty: "explorer",
        stationOwnerMemberId: ranger.publicId,
        systemAddress: OTHER_PORTAL,
      });
    });

    it("fans out an explorer_builder mission", async () => {
      signInAs(ranger);
      const res = await post(rangerMission({ targetSpecialty: "explorer_builder" }));
      expect(res.status).toBe(201);
      expect(readStoredMissions().map((mission) => mission.targetSpecialty)).toEqual(["builder", "explorer"]);
    });

    it.each([
      ["someone else's station", { stationOwnerMemberId: stationOwner.publicId, systemAddress: PORTAL }],
      ["an assignment", { assignedMemberId: explorer.publicId }],
      ["a ranger mission", { targetSpecialty: "ranger" as const }],
      ["an 'all' mission", { targetSpecialty: "all" as const }],
    ])("rejects %s with 403", async (_label, overrides) => {
      signInAs(ranger);
      const res = await post(rangerMission(overrides));
      expect(res.status).toBe(403);
      expect(readStoredMissions()).toEqual([]);
    });

    it("rejects claiming a station they do not own", async () => {
      signInAs(ranger);
      const res = await post(rangerMission({ systemAddress: PORTAL }));
      expect(res.status).toBe(400);
    });
  });

  describe("follow-up missions", () => {
    it("lets the assignee of a mission create an unassigned mission for another specialty in the same system", async () => {
      seedMissions([storedMission({ targetSpecialty: "builder", assignedMemberId: builder.publicId })]);
      signInAs(builder);
      const res = await post(missionInput({ targetSpecialty: "ranger", systemAddress: PORTAL.toLowerCase() }));
      expect(res.status).toBe(201);
      const stored = readStoredMissions();
      expect(stored).toHaveLength(2);
      expect(stored[0]).toMatchObject({ targetSpecialty: "ranger", createdByMemberId: builder.publicId });
      expect(stored[0].assignedMemberId).toBeUndefined();
    });

    it("lets a member without specialty create a follow-up", async () => {
      seedMissions([storedMission({ targetSpecialty: "builder", assignedMemberId: noSpecialty.publicId })]);
      signInAs(noSpecialty);
      expect((await post(missionInput({ targetSpecialty: "explorer" }))).status).toBe(201);
    });

    it("rejects a follow-up for a specialty already covered", async () => {
      seedMissions([
        storedMission({ targetSpecialty: "builder", assignedMemberId: noSpecialty.publicId }),
        storedMission({ targetSpecialty: "explorer" }),
      ]);
      signInAs(noSpecialty);
      expect((await post(missionInput({ targetSpecialty: "explorer" }))).status).toBe(409);
    });

    it.each([
      ["a different galaxy", { galaxy: 1 }],
      ["the same specialty", { targetSpecialty: "builder" as const }],
      ["a non follow-up specialty", { targetSpecialty: "all" as const }],
    ])("is not a follow-up for %s", async (_label, overrides) => {
      seedMissions([storedMission({ targetSpecialty: "builder", assignedMemberId: noSpecialty.publicId })]);
      signInAs(noSpecialty);
      expect((await post(missionInput(overrides))).status).toBe(403);
    });

    it("is not a follow-up for missions assigned to others", async () => {
      seedMissions([storedMission({ targetSpecialty: "builder", assignedMemberId: builder.publicId })]);
      signInAs(noSpecialty);
      expect((await post(missionInput())).status).toBe(403);
    });

    it("returns 503 when missions cannot be read", async () => {
      corruptDataFile("missions.json");
      vi.spyOn(console, "error").mockImplementation(() => {});
      signInAs(ranger);
      const res = await post(missionInput({ systemAddress: OTHER_PORTAL, stationOwnerMemberId: ranger.publicId }));
      expect(res.status).toBe(503);
    });
  });

  // Vedi il report: i Ranger saltano il controllo specialtyAlreadyCovered (src/app/api/missions/route.ts:64-69).
  it.todo("rejects a ranger mission for a specialty already covered in the system with 409");
});
