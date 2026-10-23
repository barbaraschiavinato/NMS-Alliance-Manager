import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mission } from "@/lib/missions/missions";
import { signInAs } from "../../helpers/auth";
import { jsonRequest, routeParams } from "../../helpers/http";
import { makeMember, seedMembers } from "../../helpers/members";
import {
  OTHER_PORTAL,
  PORTAL,
  SAME_SYSTEM_OTHER_PLANET,
  corruptDataFile,
  missionInput,
  readStoredMissions,
  resetData,
  seedMissions,
  seedStations,
  storedMission,
} from "./fixtures";

vi.mock("@/auth", async () => (await import("../../helpers/auth")).authMock);

const { PATCH, DELETE } = await import("@/app/api/missions/[id]/route");

const moderator = makeMember({ role: "moderator", specialty: "" });
const admin = makeMember({ role: "admin", specialty: "" });
const simpleAdmin = makeMember({ role: "admin", specialty: "explorer", simpleView: true });
const creator = makeMember({ role: "moderator", specialty: "" });
const explorer = makeMember({ specialty: "explorer" });
const builder = makeMember({ specialty: "builder" });
const stationOwner = makeMember({ specialty: "ranger" });
const pendingMember = makeMember({ membershipStatus: "pending" });

const mission = storedMission({
  title: "Original",
  targetSpecialty: "explorer",
  assignedMemberId: explorer.publicId,
  createdByMemberId: creator.publicId,
  createdAt: "2026-02-01T00:00:00.000Z",
  status: "in_progress",
  progress: 10,
});

const patch = (id: string, body: unknown) =>
  PATCH(jsonRequest(`/api/missions/${id}`, "PATCH", body), routeParams({ id }));
const remove = (id: string) => DELETE(jsonRequest(`/api/missions/${id}`, "DELETE"), routeParams({ id }));

// Input completo per la modifica da moderatore, basato sulla missione esistente.
const editInput = (overrides = {}) =>
  missionInput({
    title: "Edited",
    targetSpecialty: "explorer",
    assignedMemberId: explorer.publicId,
    ...overrides,
  });

beforeEach(() => {
  resetData();
  signInAs(null);
  seedMembers([moderator, admin, simpleAdmin, creator, explorer, builder, stationOwner, pendingMember]);
  seedMissions([mission]);
  seedStations([{ portal: PORTAL, galaxy: 0, ownerId: stationOwner.publicId }]);
});

describe("PATCH /api/missions/[id]", () => {
  it("requires a session", async () => {
    expect((await patch(mission.id, { status: "completed", progress: 100 })).status).toBe(401);
  });

  it.each([
    ["pending", makeMember({ membershipStatus: "pending" })],
    ["blocked", makeMember({ membershipStatus: "blocked" })],
  ])("rejects %s members", async (_label, member) => {
    seedMembers([member]);
    signInAs(member);
    expect((await patch(mission.id, editInput())).status).toBe(401);
  });

  it("returns 404 for an unknown mission", async () => {
    signInAs(moderator);
    expect((await patch("missing", editInput())).status).toBe(404);
  });

  describe("assignee progress updates", () => {
    it("updates status and progress of an assigned mission", async () => {
      signInAs(explorer);
      const res = await patch(mission.id, { status: "completed", progress: 100 });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ id: mission.id, status: "completed", progress: 100, title: "Original" });
      expect(readStoredMissions()[0]).toMatchObject({ status: "completed", progress: 100, title: "Original" });
    });

    it("rejects completing a mission twice with 409", async () => {
      seedMissions([{ ...mission, status: "completed", progress: 100 }]);
      signInAs(explorer);
      expect((await patch(mission.id, { status: "completed", progress: 100 })).status).toBe(409);
    });

    it("allows reopening a completed mission", async () => {
      seedMissions([{ ...mission, status: "completed", progress: 100 }]);
      signInAs(explorer);
      expect((await patch(mission.id, { status: "in_progress", progress: 50 })).status).toBe(200);
      expect(readStoredMissions()[0]).toMatchObject({ status: "in_progress", progress: 50 });
    });

    it.each([
      ["extra fields", { status: "completed", progress: 100, title: "Hijack" }],
      ["a fractional progress", { status: "in_progress", progress: 1.5 }],
      ["progress above 100", { status: "in_progress", progress: 101 }],
      ["negative progress", { status: "in_progress", progress: -1 }],
      ["an unknown status", { status: "done", progress: 100 }],
      ["a full mission edit", editInput()],
      ["malformed JSON", "{"],
      ["a non-object body", "42"],
    ])("rejects %s with 403", async (_label, body) => {
      signInAs(explorer);
      expect((await patch(mission.id, body)).status).toBe(403);
      expect(readStoredMissions()[0]).toMatchObject({ title: "Original", progress: 10 });
    });

    it("rejects progress updates from members not assigned", async () => {
      signInAs(builder);
      expect((await patch(mission.id, { status: "completed", progress: 100 })).status).toBe(403);
    });

    it("treats a simple-view admin as a user", async () => {
      signInAs(simpleAdmin);
      const res = await patch(mission.id, editInput());
      expect(res.status).toBe(403);
      expect(readStoredMissions()[0].title).toBe("Original");
    });
  });

  describe("moderator edits", () => {
    it.each([
      ["moderator", moderator],
      ["admin", admin],
    ])("%s edits a mission keeping creation metadata", async (_label, member) => {
      signInAs(member);
      const res = await patch(
        mission.id,
        editInput({ stationOwnerMemberId: stationOwner.publicId, assignedMemberId: builder.publicId }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as Mission;
      expect(body).toMatchObject({
        id: mission.id,
        title: "Edited",
        systemAddress: PORTAL,
        createdAt: mission.createdAt,
        createdByMemberId: creator.publicId,
        createdByName: creator.nmsName,
        assignedMemberId: builder.publicId,
        assignedTo: builder.nmsName,
        stationOwnerMemberId: stationOwner.publicId,
        stationOwnerName: stationOwner.nmsName,
      });
      expect(readStoredMissions()[0]).toMatchObject({
        id: mission.id,
        title: "Edited",
        systemAddress: PORTAL,
        createdByMemberId: creator.publicId,
        assignedMemberId: builder.publicId,
        stationOwnerMemberId: stationOwner.publicId,
      });
    });

    it("uses the account name of a new station owner without in-game name", async () => {
      const namelessOwner = makeMember({ specialty: "ranger", nmsName: "", name: "Owner Account" });
      seedMembers([moderator, explorer, namelessOwner]);
      seedStations([{ portal: PORTAL, galaxy: 0, ownerId: namelessOwner.publicId }]);
      signInAs(moderator);
      const res = await patch(mission.id, editInput({ stationOwnerMemberId: namelessOwner.publicId }));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        stationOwnerMemberId: namelessOwner.publicId,
        stationOwnerName: "Owner Account",
      });
      expect(readStoredMissions()[0].stationOwnerMemberId).toBe(namelessOwner.publicId);
    });

    it("can unassign a mission", async () => {
      signInAs(moderator);
      const res = await patch(mission.id, editInput({ assignedMemberId: "  " }));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ assignedTo: "" });
      expect(readStoredMissions()[0].assignedMemberId).toBeUndefined();
    });

    it("keeps a former member already assigned to the mission", async () => {
      const formerId = "00000000-0000-4000-8000-000000000001";
      seedMissions([{ ...mission, assignedMemberId: formerId }]);
      signInAs(moderator);
      const res = await patch(mission.id, editInput({ assignedMemberId: formerId }));
      expect(res.status).toBe(200);
      expect(readStoredMissions()[0].assignedMemberId).toBe(formerId);
    });

    it("keeps an unchanged station owner even if the station is gone", async () => {
      seedMissions([{ ...mission, stationOwnerMemberId: explorer.publicId }]);
      signInAs(moderator);
      const res = await patch(mission.id, editInput({ stationOwnerMemberId: explorer.publicId }));
      expect(res.status).toBe(200);
    });

    // Vedi il report: a differenza dell'assegnatario, lo scopritore invariato viene accettato ma poi cancellato
    // (src/app/api/missions/[id]/route.ts:64).
    it.todo("persists an unchanged station owner whose station is gone");

    it.each([
      ["an unknown assignee", { assignedMemberId: "00000000-0000-4000-8000-000000000002" }],
      ["a pending assignee", { assignedMemberId: pendingMember.publicId }],
      ["a station owner without the station", { stationOwnerMemberId: builder.publicId }],
      ["an unknown station owner", { stationOwnerMemberId: "00000000-0000-4000-8000-000000000003" }],
      ["an invalid mission", { title: "" }],
    ])("rejects %s with 400", async (_label, overrides) => {
      signInAs(moderator);
      expect((await patch(mission.id, editInput(overrides))).status).toBe(400);
      expect(readStoredMissions()[0].title).toBe("Original");
    });

    it("rejects moving to a specialty already covered in the system", async () => {
      seedMissions([mission, storedMission({ targetSpecialty: "builder" })]);
      signInAs(moderator);
      const res = await patch(mission.id, editInput({ targetSpecialty: "builder" }));
      expect(res.status).toBe(409);
    });

    it("ignores the mission itself when checking covered specialties", async () => {
      signInAs(moderator);
      expect((await patch(mission.id, editInput({ targetSpecialty: "all" }))).status).toBe(200);
    });

    it("rejects moving to another planet of a system with a station", async () => {
      signInAs(moderator);
      const res = await patch(mission.id, editInput({ systemAddress: SAME_SYSTEM_OTHER_PLANET }));
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "errors.another_planet_from_system_already_registered" });
    });

    it("rejects moving to another planet of a system with another mission", async () => {
      seedMissions([mission, storedMission({ systemAddress: OTHER_PORTAL })]);
      seedStations([]);
      signInAs(moderator);
      const res = await patch(mission.id, editInput({ systemAddress: `1${OTHER_PORTAL.slice(1)}` }));
      expect(res.status).toBe(409);
    });

    it("can move the mission to another planet of its own system", async () => {
      seedStations([]);
      signInAs(moderator);
      const res = await patch(mission.id, editInput({ systemAddress: SAME_SYSTEM_OTHER_PLANET.toLowerCase() }));
      expect(res.status).toBe(200);
      expect(readStoredMissions()[0].systemAddress).toBe(SAME_SYSTEM_OTHER_PLANET);
    });

    it("applies a progress update to a mission assigned to the moderator", async () => {
      seedMissions([{ ...mission, assignedMemberId: moderator.publicId }]);
      signInAs(moderator);
      const res = await patch(mission.id, { status: "completed", progress: 100 });
      expect(res.status).toBe(200);
      expect(readStoredMissions()[0]).toMatchObject({ status: "completed", title: "Original" });
    });

    it("returns 503 when missions cannot be read", async () => {
      corruptDataFile("missions.json");
      vi.spyOn(console, "error").mockImplementation(() => {});
      signInAs(moderator);
      expect((await patch(mission.id, editInput())).status).toBe(503);
    });
  });
});

describe("DELETE /api/missions/[id]", () => {
  it("requires a session", async () => {
    expect((await remove(mission.id)).status).toBe(401);
  });

  it("rejects pending members", async () => {
    const pendingModerator = makeMember({ role: "moderator", membershipStatus: "pending" });
    seedMembers([pendingModerator]);
    signInAs(pendingModerator);
    expect((await remove(mission.id)).status).toBe(401);
  });

  it.each([
    ["user", explorer],
    ["simple-view admin", simpleAdmin],
  ])("forbids a %s", async (_label, member) => {
    signInAs(member);
    expect((await remove(mission.id)).status).toBe(403);
    expect(readStoredMissions()).toHaveLength(1);
  });

  it.each([
    ["moderator", moderator],
    ["admin", admin],
  ])("%s deletes a mission", async (_label, member) => {
    const other = storedMission({ systemAddress: OTHER_PORTAL });
    seedMissions([mission, other]);
    signInAs(member);
    const res = await remove(mission.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(readStoredMissions().map((entry) => entry.id)).toEqual([other.id]);
  });

  it("returns 404 for an unknown mission", async () => {
    signInAs(moderator);
    expect((await remove("missing")).status).toBe(404);
  });

  it("returns 503 when missions cannot be read", async () => {
    corruptDataFile("missions.json");
    vi.spyOn(console, "error").mockImplementation(() => {});
    signInAs(moderator);
    expect((await remove(mission.id)).status).toBe(503);
  });
});
