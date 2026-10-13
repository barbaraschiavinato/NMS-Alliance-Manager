import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../../helpers/auth";
import { jsonRequest } from "../../helpers/http";
import { makeMember, seedMembers, writeDataFile } from "../../helpers/members";
import {
  castMembers,
  makeCast,
  readDataFile,
  readMembers,
  resetData,
  storedMission,
  type Cast,
} from "../helpers/fixtures";

vi.mock("@/auth", async () => (await import("../../helpers/auth")).authMock);

const url = "/api/admin/members";
let cast: Cast;

beforeEach(() => {
  resetData();
  cast = makeCast();
  seedMembers(castMembers(cast));
  writeDataFile("missions.json", []);
});

async function routes() {
  return import("@/app/api/admin/members/route");
}

function validProfile(overrides: Record<string, unknown> = {}) {
  return {
    nmsName: "Fresh Name",
    nmsCode: "ABCD-EFGH-12345",
    platforms: ["Xbox", "Xbox"],
    specialty: "builder",
    ...overrides,
  };
}

describe("authorization shared by every method", () => {
  const calls = {
    GET: async () => (await routes()).GET(),
    PATCH: async () =>
      (await routes()).PATCH(jsonRequest(url, "PATCH", { email: cast.user.email, membershipStatus: "blocked" })),
    DELETE: async () => (await routes()).DELETE(jsonRequest(url, "DELETE", { email: cast.user.email })),
    POST: async () => (await routes()).POST(jsonRequest(url, "POST", validProfile())),
  };

  for (const [method, call] of Object.entries(calls)) {
    it(`${method} returns 401 without a session`, async () => {
      signInAs(null);
      expect((await call()).status).toBe(401);
    });

    it(`${method} returns 401 for pending, blocked and offline members`, async () => {
      for (const member of [cast.pending, cast.blocked, cast.offline]) {
        signInAs(member);
        expect((await call()).status).toBe(401);
      }
    });

    it(`${method} returns 403 for users and simple-view admins`, async () => {
      for (const member of [cast.user, cast.simpleAdmin]) {
        signInAs(member);
        const response = await call();
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "Permesso moderator richiesto." });
      }
    });
  }

  it("returns 401 when the auth configuration is incomplete", async () => {
    const { authMock } = await import("../../helpers/auth");
    authMock.auth.mockResolvedValue({ user: { email: cast.admin.email, name: cast.admin.name, image: "" } });
    expect((await (await routes()).GET()).status).toBe(401);
  });
});

describe("GET /api/admin/members", () => {
  it("lists every member to moderators and flags the protected admin", async () => {
    const privatePreferenceMember = makeMember({ pulseEffectsEnabled: false });
    seedMembers([...castMembers(cast), privatePreferenceMember]);
    signInAs(cast.moderator);
    const response = await (await routes()).GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { publicId: string; protectedAdmin: boolean; membershipStatus: string }[];
    expect(body).toHaveLength(castMembers(cast).length + 1);
    expect(body.find((entry) => entry.publicId === cast.rootAdmin.publicId)?.protectedAdmin).toBe(true);
    expect(body.filter((entry) => entry.protectedAdmin)).toHaveLength(1);
    expect(body.find((entry) => entry.publicId === cast.pending.publicId)?.membershipStatus).toBe("pending");
    expect(body.find((entry) => entry.publicId === privatePreferenceMember.publicId)).not.toHaveProperty(
      "pulseEffectsEnabled",
    );
  });

  it("works for admins too", async () => {
    signInAs(cast.admin);
    expect((await (await routes()).GET()).status).toBe(200);
  });
});

describe("PATCH /api/admin/members", () => {
  async function patch(body: unknown) {
    return (await routes()).PATCH(jsonRequest(url, "PATCH", body));
  }

  it("rejects malformed bodies", async () => {
    signInAs(cast.moderator);
    expect((await patch("{not json")).status).toBe(400);
    expect((await patch(null)).status).toBe(400);
    const missingEmail = await patch({ role: "user" });
    expect(missingEmail.status).toBe(400);
    expect(await missingEmail.json()).toEqual({ error: "Email non valida." });
  });

  describe("action=profile", () => {
    it("rejects an invalid profile", async () => {
      signInAs(cast.admin);
      expect(
        (await patch({ action: "profile", email: cast.user.email, ...validProfile({ nmsCode: "short" }) })).status,
      ).toBe(400);
    });

    it("lets a moderator update a user's profile", async () => {
      signInAs(cast.moderator);
      const response = await patch({
        action: "profile",
        email: ` ${cast.user.email.toUpperCase()} `,
        ...validProfile({ telegramName: " tg " }),
      });
      expect(response.status).toBe(200);
      const stored = readMembers().find((member) => member.publicId === cast.user.publicId);
      expect(stored).toMatchObject({
        nmsName: "Fresh Name",
        nmsCode: "ABCDEFGH12345",
        platforms: ["Xbox"],
        specialty: "builder",
        telegramName: "tg",
      });
    });

    it("does not let admins change a member's personal pulse preference", async () => {
      signInAs(cast.admin);
      const response = await patch({
        action: "profile",
        email: cast.user.email,
        ...validProfile({ pulseEffectsEnabled: false }),
      });

      expect(response.status).toBe(200);
      expect(readMembers().find((member) => member.publicId === cast.user.publicId)).not.toHaveProperty(
        "pulseEffectsEnabled",
      );
    });

    it("is refused to fixed test-set accounts", async () => {
      vi.stubEnv("LOCAL_AUTH", "true");
      vi.stubEnv("LOCAL_AUTH_SET", "test");
      const moderator = makeMember({ email: "test-moderator-ranger@local", role: "moderator" });
      seedMembers([...castMembers(cast), moderator]);
      signInAs(moderator);
      const response = await patch({ action: "profile", email: cast.user.email, ...validProfile() });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "Questo account locale è fisso per i test: i profili non sono modificabili.",
      });
      expect(readMembers().find((member) => member.publicId === cast.user.publicId)?.nmsName).toBe(cast.user.nmsName);
    });

    it("hides moderators and admins from moderators, and offline or unknown members from everyone", async () => {
      signInAs(cast.moderator);
      for (const target of [cast.admin, cast.simpleAdmin]) {
        expect((await patch({ action: "profile", email: target.email, ...validProfile() })).status).toBe(404);
      }
      const otherModerator = makeMember({ role: "moderator", simpleView: false });
      seedMembers([...castMembers(cast), otherModerator]);
      expect((await patch({ action: "profile", email: otherModerator.email, ...validProfile() })).status).toBe(404);
      signInAs(cast.admin);
      expect((await patch({ action: "profile", email: cast.offline.email, ...validProfile() })).status).toBe(404);
      expect((await patch({ action: "profile", email: "nobody@example.com", ...validProfile() })).status).toBe(404);
      expect(readMembers().find((member) => member.publicId === cast.offline.publicId)?.nmsName).toBe(
        cast.offline.nmsName,
      );
    });

    it("lets an admin update a moderator and toggle their simple view", async () => {
      signInAs(cast.admin);
      const response = await patch({
        action: "profile",
        email: cast.moderator.email,
        ...validProfile({ simpleView: true }),
      });
      expect(response.status).toBe(200);
      expect(readMembers().find((member) => member.publicId === cast.moderator.publicId)).toMatchObject({
        nmsName: "Fresh Name",
        simpleView: true,
      });
    });

    it("returns 409 for duplicate in-game names and friend codes", async () => {
      signInAs(cast.admin);
      const nameClash = await patch({
        action: "profile",
        email: cast.user.email,
        ...validProfile({ nmsName: ` ${cast.moderator.nmsName.toUpperCase()} ` }),
      });
      expect(nameClash.status).toBe(409);
      expect(await nameClash.json()).toEqual({ error: "members.duplicate_in_game_name" });
      const codeClash = await patch({
        action: "profile",
        email: cast.user.email,
        ...validProfile({ nmsCode: cast.moderator.nmsCode.toLowerCase() }),
      });
      expect(codeClash.status).toBe(409);
      expect(await codeClash.json()).toEqual({ error: "members.duplicate_friend_code" });
    });

    it("returns 404 if the member disappears before the update", async () => {
      const store = await import("@/lib/access-store");
      vi.spyOn(store, "updateMemberProfile").mockResolvedValue(null);
      signInAs(cast.admin);
      expect((await patch({ action: "profile", email: cast.user.email, ...validProfile() })).status).toBe(404);
    });
  });

  describe("membershipStatus", () => {
    it("rejects unknown statuses", async () => {
      signInAs(cast.moderator);
      expect((await patch({ email: cast.pending.email, membershipStatus: "banned" })).status).toBe(400);
      expect((await patch({ email: cast.pending.email, membershipStatus: 1 })).status).toBe(400);
    });

    it("lets a moderator approve a pending user and records who approved", async () => {
      signInAs(cast.moderator);
      const response = await patch({ email: cast.pending.email, membershipStatus: "approved" });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, membershipStatus: "approved" });
      const stored = readMembers().find((member) => member.publicId === cast.pending.publicId);
      expect(stored?.membershipStatus).toBe("approved");
      expect(stored?.approvedBy).toBe(cast.moderator.email);
      expect(stored?.approvedAt).not.toBe("");
    });

    it("clears the approval when a user is blocked", async () => {
      signInAs(cast.moderator);
      expect((await patch({ email: cast.user.email, membershipStatus: "blocked" })).status).toBe(200);
      expect(readMembers().find((member) => member.publicId === cast.user.publicId)).toMatchObject({
        membershipStatus: "blocked",
        approvedBy: "",
        approvedAt: "",
      });
    });

    it("does not let a moderator change another moderator or any admin", async () => {
      const otherModerator = makeMember({ role: "moderator", simpleView: false });
      seedMembers([...castMembers(cast), otherModerator]);
      signInAs(cast.moderator);
      for (const target of [otherModerator, cast.admin, cast.rootAdmin]) {
        expect((await patch({ email: target.email, membershipStatus: "blocked" })).status).toBe(404);
      }
      expect(readMembers().find((member) => member.publicId === otherModerator.publicId)?.membershipStatus).toBe(
        "approved",
      );
    });

    it("lets an admin block a moderator but never an admin or the root admin", async () => {
      signInAs(cast.admin);
      expect((await patch({ email: cast.moderator.email, membershipStatus: "blocked" })).status).toBe(200);
      expect(readMembers().find((member) => member.publicId === cast.moderator.publicId)?.membershipStatus).toBe(
        "blocked",
      );
      expect((await patch({ email: cast.simpleAdmin.email, membershipStatus: "blocked" })).status).toBe(404);
      expect((await patch({ email: cast.rootAdmin.email, membershipStatus: "blocked" })).status).toBe(404);
      expect((await patch({ email: "nobody@example.com", membershipStatus: "blocked" })).status).toBe(404);
    });
  });

  describe("role", () => {
    it("is reserved to admins", async () => {
      signInAs(cast.moderator);
      const response = await patch({ email: cast.user.email, role: "moderator" });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Solo un admin può cambiare i ruoli." });
      expect(readMembers().find((member) => member.publicId === cast.user.publicId)?.role).toBe("user");
    });

    it("rejects unknown roles", async () => {
      signInAs(cast.admin);
      expect((await patch({ email: cast.user.email, role: "owner" })).status).toBe(400);
      expect((await patch({ email: cast.user.email })).status).toBe(400);
    });

    it("lets an admin promote a user", async () => {
      signInAs(cast.admin);
      const response = await patch({ email: cast.user.email, role: "moderator" });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(readMembers().find((member) => member.publicId === cast.user.publicId)?.role).toBe("moderator");
    });

    it("refuses to change the root admin or an unknown member", async () => {
      signInAs(cast.admin);
      expect((await patch({ email: cast.rootAdmin.email, role: "user" })).status).toBe(404);
      expect((await patch({ email: "nobody@example.com", role: "user" })).status).toBe(404);
      expect(readMembers().find((member) => member.publicId === cast.rootAdmin.publicId)?.role).toBe("admin");
    });
  });
});

describe("DELETE /api/admin/members", () => {
  async function remove(body: unknown) {
    return (await routes()).DELETE(jsonRequest(url, "DELETE", body));
  }

  it("rejects a missing email", async () => {
    signInAs(cast.moderator);
    expect((await remove("{")).status).toBe(400);
    expect((await remove({ email: 3 })).status).toBe(400);
  });

  it("lets a moderator remove a user and hands their mission stations to the root admin", async () => {
    writeDataFile("missions.json", [
      storedMission({ id: "M-1", stationOwnerMemberId: cast.user.publicId }),
      storedMission({ id: "M-2", stationOwnerMemberId: cast.moderator.publicId, systemAddress: "0124456789AB" }),
    ]);
    signInAs(cast.moderator);
    const response = await remove({ email: cast.user.email.toUpperCase() });
    expect(response.status).toBe(200);
    expect(readMembers().some((member) => member.publicId === cast.user.publicId)).toBe(false);
    const missions = readDataFile<{ id: string; stationOwnerMemberId: string }[]>("missions.json");
    expect(missions.find((mission) => mission.id === "M-1")?.stationOwnerMemberId).toBe(cast.rootAdmin.publicId);
    expect(missions.find((mission) => mission.id === "M-2")?.stationOwnerMemberId).toBe(cast.moderator.publicId);
  });

  it("hands the stations to a root admin without in-game name", async () => {
    const rootAdmin = { ...cast.rootAdmin, nmsName: "" };
    seedMembers([...castMembers(cast).filter((member) => member !== cast.rootAdmin), rootAdmin]);
    writeDataFile("missions.json", [storedMission({ id: "M-1", stationOwnerMemberId: cast.user.publicId })]);
    signInAs(cast.admin);
    expect((await remove({ email: cast.user.email })).status).toBe(200);
    const [mission] = readDataFile<Record<string, unknown>[]>("missions.json");
    expect(mission.stationOwnerMemberId).toBe(rootAdmin.publicId);
    // Il nome è un campo derivato: non viene salvato.
    expect(mission).not.toHaveProperty("stationOwnerName");
  });

  it("leaves missions alone when the removed member owned none", async () => {
    signInAs(cast.admin);
    expect((await remove({ email: cast.offline.email })).status).toBe(200);
    expect(readDataFile("missions.json")).toEqual([]);
  });

  it("keeps missions untouched when there is no root admin profile", async () => {
    seedMembers(castMembers(cast).filter((member) => member !== cast.rootAdmin));
    writeDataFile("missions.json", [storedMission({ id: "M-1", stationOwnerMemberId: cast.user.publicId })]);
    signInAs(cast.admin);
    expect((await remove({ email: cast.user.email })).status).toBe(200);
    expect(readDataFile<{ stationOwnerMemberId: string }[]>("missions.json")[0].stationOwnerMemberId).toBe(
      cast.user.publicId,
    );
  });

  it("does not let a moderator remove moderators or admins", async () => {
    const otherModerator = makeMember({ role: "moderator", simpleView: false });
    seedMembers([...castMembers(cast), otherModerator]);
    signInAs(cast.moderator);
    for (const target of [otherModerator, cast.admin]) {
      expect((await remove({ email: target.email })).status).toBe(404);
    }
    expect(readMembers()).toHaveLength(castMembers(cast).length + 1);
  });

  it("lets an admin remove another admin but never themself, the root admin or an unknown member", async () => {
    signInAs(cast.admin);
    expect((await remove({ email: cast.admin.email })).status).toBe(404);
    expect((await remove({ email: cast.rootAdmin.email })).status).toBe(404);
    expect((await remove({ email: "nobody@example.com" })).status).toBe(404);
    expect((await remove({ email: cast.simpleAdmin.email })).status).toBe(200);
    expect(readMembers().map((member) => member.publicId)).not.toContain(cast.simpleAdmin.publicId);
  });
});

describe("POST /api/admin/members", () => {
  async function post(body: unknown) {
    return (await routes()).POST(jsonRequest(url, "POST", body));
  }

  it("rejects malformed bodies and invalid profiles", async () => {
    signInAs(cast.moderator);
    expect((await post("{")).status).toBe(400);
    expect((await post(validProfile({ specialty: "pilot" }))).status).toBe(400);
    expect((await post(validProfile({ nmsName: "" }))).status).toBe(400);
  });

  it("creates an offline member, with or without a friend code", async () => {
    signInAs(cast.moderator);
    const response = await post(validProfile({ nmsName: " Offline One ", discordName: "disc" }));
    expect(response.status).toBe(201);
    const created = (await response.json()) as { publicId: string };
    const stored = readMembers().find((member) => member.publicId === created.publicId);
    expect(stored).toMatchObject({
      nmsName: "Offline One",
      name: "Offline One",
      nmsCode: "ABCDEFGH12345",
      platforms: ["Xbox"],
      offline: true,
      role: "user",
      membershipStatus: "approved",
      approvedBy: cast.moderator.email,
      discordName: "disc",
    });
    expect(stored?.email).toBe(`offline-${created.publicId}@offline.invalid`);

    const withoutCode = await post(validProfile({ nmsName: "Offline Two", nmsCode: "" }));
    expect(withoutCode.status).toBe(201);
  });

  it("returns 409 when creating a duplicate", async () => {
    signInAs(cast.admin);
    const nameClash = await post(validProfile({ nmsName: cast.user.nmsName }));
    expect(nameClash.status).toBe(409);
    expect(await nameClash.json()).toEqual({ error: "members.duplicate_in_game_name" });
    expect((await post(validProfile({ nmsCode: cast.user.nmsCode }))).status).toBe(409);
  });

  describe("action=update", () => {
    it("updates an offline member", async () => {
      signInAs(cast.moderator);
      const response = await post({
        action: "update",
        offlineId: cast.offline.publicId,
        ...validProfile({ nmsName: "Renamed" }),
      });
      expect(response.status).toBe(200);
      expect(readMembers().find((member) => member.publicId === cast.offline.publicId)).toMatchObject({
        nmsName: "Renamed",
        name: "Renamed",
        specialty: "builder",
      });
    });

    it("returns 404 for a missing id or a member that is not offline", async () => {
      signInAs(cast.moderator);
      expect((await post({ action: "update", ...validProfile() })).status).toBe(404);
      expect((await post({ action: "update", offlineId: cast.user.publicId, ...validProfile() })).status).toBe(404);
      expect(readMembers().find((member) => member.publicId === cast.user.publicId)?.nmsName).toBe(cast.user.nmsName);
    });

    it("returns 409 on duplicates", async () => {
      signInAs(cast.moderator);
      const response = await post({
        action: "update",
        offlineId: cast.offline.publicId,
        ...validProfile({ nmsCode: cast.user.nmsCode }),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "members.duplicate_friend_code" });
    });
  });

  describe("action=link", () => {
    it("merges an offline profile into a pending member and reassigns their data", async () => {
      const target = makeMember({
        membershipStatus: "pending",
        nmsName: "",
        nmsCode: "",
        specialty: "",
        platforms: [],
        approvedBy: "",
        approvedAt: "",
      });
      const offline = makeMember({
        offline: true,
        lastLogin: "",
        telegramName: "tg",
        discordName: "dc",
        approvedBy: cast.moderator.email,
      });
      seedMembers([...castMembers(cast), target, offline]);
      writeDataFile("missions.json", [
        storedMission({
          id: "M-1",
          createdByMemberId: offline.publicId,
          stationOwnerMemberId: offline.publicId,
          assignedMemberId: offline.publicId,
        }),
      ]);
      writeDataFile("stations-v2.json", [
        { portal: "0123456789AB", galaxy: 0, ownerId: offline.publicId, createdByMemberId: offline.publicId },
      ]);
      writeDataFile("private-messages.json", [
        {
          id: "pm-1",
          senderMemberId: offline.publicId,
          recipientMemberId: cast.user.publicId,
          body: "hi",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ]);

      signInAs(cast.moderator);
      const response = await post({ action: "link", offlineId: offline.publicId, targetId: target.publicId });
      expect(response.status).toBe(200);

      const members = readMembers();
      expect(members.some((member) => member.publicId === offline.publicId)).toBe(false);
      expect(members.find((member) => member.publicId === target.publicId)).toMatchObject({
        nmsName: offline.nmsName,
        nmsCode: offline.nmsCode,
        specialty: offline.specialty,
        telegramName: "tg",
        discordName: "dc",
        membershipStatus: "approved",
        approvedBy: cast.moderator.email,
      });
      expect(readDataFile<Record<string, string>[]>("missions.json")[0]).toMatchObject({
        createdByMemberId: target.publicId,
        stationOwnerMemberId: target.publicId,
        assignedMemberId: target.publicId,
      });
      expect(readDataFile<Record<string, string>[]>("stations-v2.json")[0]).toMatchObject({
        ownerId: target.publicId,
        createdByMemberId: target.publicId,
      });
      expect(readDataFile<Record<string, string>[]>("private-messages.json")[0].senderMemberId).toBe(target.publicId);
    });

    it("keeps the target's own complete profile", async () => {
      signInAs(cast.admin);
      expect(
        (await post({ action: "link", offlineId: cast.offline.publicId, targetId: cast.user.publicId })).status,
      ).toBe(200);
      expect(readMembers().find((member) => member.publicId === cast.user.publicId)?.nmsName).toBe(cast.user.nmsName);
    });

    it("rejects invalid link requests", async () => {
      signInAs(cast.moderator);
      for (const body of [
        { action: "link", offlineId: 1, targetId: cast.user.publicId },
        { action: "link", offlineId: cast.offline.publicId },
        { action: "link", offlineId: cast.offline.publicId, targetId: cast.offline.publicId },
        { action: "link", offlineId: cast.user.publicId, targetId: cast.moderator.publicId },
      ]) {
        const response = await post(body);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Impossibile collegare il profilo." });
      }
      expect(readMembers().some((member) => member.publicId === cast.offline.publicId)).toBe(true);
    });
  });
});
