import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../../helpers/auth";
import { jsonRequest, routeParams } from "../../helpers/http";
import { makeMember, seedMembers } from "../../helpers/members";
import { corruptDataFile, readStoredMissions, resetData, seedMissions, storedMission } from "./fixtures";

vi.mock("@/auth", async () => (await import("../../helpers/auth")).authMock);

const { POST } = await import("@/app/api/missions/[id]/claim/route");

const explorer = makeMember({ specialty: "explorer" });
const builder = makeMember({ specialty: "builder" });
const moderator = makeMember({ role: "moderator", specialty: "builder" });
const admin = makeMember({ role: "admin", specialty: "explorer" });
const simpleAdmin = makeMember({ role: "admin", specialty: "builder", simpleView: true });
const mission = storedMission({ targetSpecialty: "explorer", status: "pending" });
const forAll = storedMission({ targetSpecialty: "all", systemAddress: "02A1B2C3D4E5" });

const claim = (id: string) => POST(jsonRequest(`/api/missions/${id}/claim`, "POST"), routeParams({ id }));

beforeEach(() => {
  resetData();
  signInAs(null);
  seedMembers([explorer, builder, moderator, admin, simpleAdmin]);
  seedMissions([mission, forAll]);
});

describe("POST /api/missions/[id]/claim", () => {
  it("requires a session", async () => {
    expect((await claim(mission.id)).status).toBe(401);
  });

  it.each([
    ["pending", makeMember({ specialty: "explorer", membershipStatus: "pending" })],
    ["blocked", makeMember({ specialty: "explorer", membershipStatus: "blocked" })],
  ])("rejects %s members", async (_label, member) => {
    seedMembers([member]);
    signInAs(member);
    expect((await claim(mission.id)).status).toBe(401);
  });

  it.each([
    ["no NMS name", { nmsName: " " }],
    ["an invalid friend code", { nmsCode: "SHORT" }],
    ["no specialty", { specialty: "" as const }],
  ])("asks members with %s to complete their profile", async (_label, overrides) => {
    const member = makeMember({ specialty: "explorer", ...overrides });
    seedMembers([member]);
    signInAs(member);
    expect((await claim(mission.id)).status).toBe(409);
    expect(readStoredMissions()[0].assignedMemberId).toBeUndefined();
  });

  it.each([
    ["user", explorer],
    ["admin", admin],
  ])("lets a %s of the target specialty claim the mission", async (_label, member) => {
    signInAs(member);
    const res = await claim(mission.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: mission.id,
      assignedMemberId: member.publicId,
      assignedTo: member.nmsName,
      status: "in_progress",
    });
    expect(readStoredMissions()[0]).toMatchObject({
      id: mission.id,
      assignedMemberId: member.publicId,
      status: "in_progress",
    });
  });

  it.each([
    ["user", builder],
    ["moderator", moderator],
    ["simple-view admin", simpleAdmin],
  ])("lets any %s claim an 'all' mission", async (_label, member) => {
    signInAs(member);
    expect((await claim(forAll.id)).status).toBe(200);
    expect(readStoredMissions()[1].assignedMemberId).toBe(member.publicId);
  });

  it.each([
    ["user", builder],
    ["moderator", moderator],
  ])("rejects a %s of another specialty with 403", async (_label, member) => {
    signInAs(member);
    expect((await claim(mission.id)).status).toBe(403);
    expect(readStoredMissions()[0].assignedMemberId).toBeUndefined();
  });

  it("rejects an already assigned mission with 409", async () => {
    seedMissions([{ ...mission, assignedMemberId: admin.publicId }]);
    signInAs(explorer);
    expect((await claim(mission.id)).status).toBe(409);
    expect(readStoredMissions()[0].assignedMemberId).toBe(admin.publicId);
  });

  it("rejects a mission assigned to a former member by name", async () => {
    seedMissions([{ ...mission, assignedTo: "Somebody Gone" }]);
    signInAs(explorer);
    expect((await claim(mission.id)).status).toBe(409);
  });

  it("returns 404 for an unknown mission", async () => {
    signInAs(explorer);
    expect((await claim("missing")).status).toBe(404);
  });

  it("returns 503 when missions cannot be read", async () => {
    corruptDataFile("missions.json");
    vi.spyOn(console, "error").mockImplementation(() => {});
    signInAs(explorer);
    expect((await claim(mission.id)).status).toBe(503);
  });
});
