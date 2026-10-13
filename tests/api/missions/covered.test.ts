import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../../helpers/auth";
import { makeMember, seedMembers } from "../../helpers/members";
import { OTHER_PORTAL, PORTAL, corruptDataFile, resetData, seedMissions, storedMission } from "./fixtures";

vi.mock("@/auth", async () => (await import("../../helpers/auth")).authMock);

const { GET } = await import("@/app/api/missions/covered/route");

const user = makeMember({ specialty: "explorer" });
const moderator = makeMember({ role: "moderator" });
const simpleAdmin = makeMember({ role: "admin", simpleView: true });

beforeEach(() => {
  resetData();
  signInAs(null);
  seedMembers([user, moderator, simpleAdmin]);
});

describe("GET /api/missions/covered", () => {
  it("requires a session", async () => {
    expect((await GET()).status).toBe(401);
  });

  it.each([
    ["pending", makeMember({ membershipStatus: "pending" })],
    ["blocked", makeMember({ membershipStatus: "blocked" })],
  ])("rejects %s members", async (_label, member) => {
    seedMembers([member]);
    signInAs(member);
    expect((await GET()).status).toBe(401);
  });

  it.each([
    ["user", user],
    ["moderator", moderator],
    ["simple-view admin", simpleAdmin],
  ])("returns covered specialties per system to a %s", async (_label, member) => {
    seedMissions([
      storedMission({ targetSpecialty: "explorer", systemAddress: PORTAL.toLowerCase() }),
      storedMission({ targetSpecialty: "explorer", assignedMemberId: user.publicId }),
      storedMission({ targetSpecialty: "builder" }),
      storedMission({ targetSpecialty: "all", systemAddress: OTHER_PORTAL, galaxy: 4 }),
    ]);
    signInAs(member);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      covered: {
        [`0:${PORTAL}`]: ["explorer", "builder"],
        [`4:${OTHER_PORTAL}`]: ["builder", "ranger", "explorer"],
      },
    });
  });

  it("returns an empty map without missions", async () => {
    seedMissions([]);
    signInAs(user);
    expect(await (await GET()).json()).toEqual({ covered: {} });
  });

  it("returns 503 when missions cannot be read", async () => {
    corruptDataFile("missions.json");
    vi.spyOn(console, "error").mockImplementation(() => {});
    signInAs(user);
    expect((await GET()).status).toBe(503);
  });
});
