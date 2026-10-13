import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../../helpers/auth";
import { jsonRequest, routeParams } from "../../helpers/http";
import { makeMember, seedMembers } from "../../helpers/members";
import {
  OTHER_PORTAL,
  PORTAL,
  corruptDataFile,
  resetData,
  seedMissions,
  seedStations,
  storedMission,
} from "./fixtures";

vi.mock("@/auth", async () => (await import("../../helpers/auth")).authMock);

const { GET } = await import("@/app/api/missions/[id]/planet-notes/route");

const explorer = makeMember({ specialty: "explorer" });
const builder = makeMember({ specialty: "builder" });
const owner = makeMember({ specialty: "ranger" });
const moderator = makeMember({ role: "moderator", specialty: "ranger" });
const simpleAdmin = makeMember({ role: "admin", specialty: "ranger", simpleView: true });
const mission = storedMission({
  targetSpecialty: "explorer",
  systemAddress: PORTAL.toLowerCase(),
  stationOwnerMemberId: owner.publicId,
});

const notes = (id: string) => GET(jsonRequest(`/api/missions/${id}/planet-notes`, "GET"), routeParams({ id }));

beforeEach(() => {
  resetData();
  signInAs(null);
  seedMembers([explorer, builder, owner, moderator, simpleAdmin]);
  seedMissions([mission]);
  seedStations([
    { portal: PORTAL, galaxy: 0, ownerId: owner.publicId, note: "  Landing pad north  " },
    { portal: OTHER_PORTAL, galaxy: 0, ownerId: owner.publicId, note: "Other" },
  ]);
});

describe("GET /api/missions/[id]/planet-notes", () => {
  it("requires a session", async () => {
    expect((await notes(mission.id)).status).toBe(401);
  });

  it.each([
    ["pending", makeMember({ specialty: "explorer", membershipStatus: "pending" })],
    ["blocked", makeMember({ specialty: "explorer", membershipStatus: "blocked" })],
  ])("rejects %s members", async (_label, member) => {
    seedMembers([member]);
    signInAs(member);
    expect((await notes(mission.id)).status).toBe(401);
  });

  it("returns the note of the mission's station owner", async () => {
    signInAs(explorer);
    const res = await notes(mission.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ note: "Landing pad north" });
  });

  it("falls back to the only station note when the owner differs", async () => {
    seedMissions([{ ...mission, stationOwnerMemberId: builder.publicId }]);
    signInAs(explorer);
    expect(await (await notes(mission.id)).json()).toEqual({ note: "Landing pad north" });
  });

  it("returns null when the station has no note", async () => {
    seedStations([{ portal: PORTAL, galaxy: 0, ownerId: owner.publicId }]);
    signInAs(explorer);
    expect(await (await notes(mission.id)).json()).toEqual({ note: null });
  });

  it("ignores stations in another galaxy", async () => {
    seedStations([{ portal: PORTAL, galaxy: 2, ownerId: owner.publicId, note: "Wrong galaxy" }]);
    signInAs(explorer);
    expect(await (await notes(mission.id)).json()).toEqual({ note: null });
  });

  it.each([
    ["user of another specialty", builder],
    ["simple-view admin", simpleAdmin],
  ])("forbids a %s who cannot see the mission", async (_label, member) => {
    signInAs(member);
    expect((await notes(mission.id)).status).toBe(403);
  });

  it("forbids users when the mission is assigned to someone else", async () => {
    seedMissions([{ ...mission, assignedMemberId: builder.publicId }]);
    signInAs(explorer);
    expect((await notes(mission.id)).status).toBe(403);
  });

  it("lets moderators read any mission note", async () => {
    signInAs(moderator);
    expect(await (await notes(mission.id)).json()).toEqual({ note: "Landing pad north" });
  });

  it("returns 404 for an unknown mission", async () => {
    signInAs(explorer);
    expect((await notes("missing")).status).toBe(404);
  });

  it("returns 503 when stations cannot be read", async () => {
    corruptDataFile("stations-v2.json");
    vi.spyOn(console, "error").mockImplementation(() => {});
    signInAs(explorer);
    expect((await notes(mission.id)).status).toBe(503);
  });
});
