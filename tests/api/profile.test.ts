import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../helpers/auth";
import { jsonRequest } from "../helpers/http";
import { makeMember, seedMembers } from "../helpers/members";
import { castMembers, makeCast, readMembers, resetData, type Cast } from "./helpers/fixtures";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);

let cast: Cast;

beforeEach(() => {
  resetData();
  cast = makeCast();
  seedMembers(castMembers(cast));
});

async function routes() {
  return import("@/app/api/profile/route");
}

async function patch(body: unknown) {
  return (await routes()).PATCH(jsonRequest("/api/profile", "PATCH", body));
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    nmsName: " Captain ",
    nmsCode: "zzzz-yyyy-xxxxx",
    platforms: ["PlayStation"],
    specialty: "ranger",
    telegramName: " tg ",
    discordName: "",
    ...overrides,
  };
}

describe("GET /api/profile", () => {
  it("returns 401 without a session and for blocked or offline members", async () => {
    signInAs(null);
    expect((await (await routes()).GET()).status).toBe(401);
    for (const member of [cast.blocked, cast.offline]) {
      signInAs(member);
      expect((await (await routes()).GET()).status).toBe(401);
    }
  });

  it("returns the profile of an approved member without email or ids", async () => {
    const member = makeMember({ telegramName: "tg", platforms: ["PC", "Mac"] });
    seedMembers([...castMembers(cast), member]);
    signInAs(member);
    const response = await (await routes()).GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      nmsName: member.nmsName,
      nmsCode: member.nmsCode,
      telegramName: "tg",
      discordName: "",
      platforms: ["PC", "Mac"],
      specialty: "explorer",
      simpleView: true,
      pulseEffectsEnabled: true,
      role: "user",
    });
  });

  it("is available to pending members, including a first Google login", async () => {
    signInAs(cast.pending);
    expect((await (await routes()).GET()).status).toBe(200);
    signInAs({ email: "first@example.com", name: "First", image: "" });
    expect(await (await (await routes()).GET()).json()).toMatchObject({
      nmsName: "",
      nmsCode: "",
      platforms: [],
      specialty: "",
      role: "user",
    });
  });

  it("reports simple-view admins as users", async () => {
    signInAs(cast.simpleAdmin);
    expect(await (await (await routes()).GET()).json()).toMatchObject({ role: "user", simpleView: true });
    signInAs(cast.admin);
    expect(await (await (await routes()).GET()).json()).toMatchObject({ role: "admin", simpleView: false });
  });
});

describe("PATCH /api/profile", () => {
  it("returns 401 without a session and for blocked members", async () => {
    signInAs(null);
    expect((await patch(profile())).status).toBe(401);
    signInAs(cast.blocked);
    expect((await patch(profile())).status).toBe(401);
    expect(readMembers().find((member) => member.publicId === cast.blocked.publicId)?.nmsName).toBe(
      cast.blocked.nmsName,
    );
  });

  it.each([
    ["a malformed body", "{"],
    ["an empty in-game name", profile({ nmsName: " " })],
    ["an in-game name over 40 characters", profile({ nmsName: "x".repeat(41) })],
    ["a short friend code", profile({ nmsCode: "ABC" })],
    ["an empty friend code", profile({ nmsCode: "" })],
    ["an unknown platform", profile({ platforms: ["Amiga"] })],
    ["a non-array platform list", profile({ platforms: "PC" })],
    ["an unknown specialty", profile({ specialty: "pilot" })],
    ["a long Telegram name", profile({ telegramName: "t".repeat(41) })],
    ["a non-string Discord name", profile({ discordName: 3 })],
    ["a non-boolean simple view", profile({ simpleView: "yes" })],
    ["a non-boolean pulse preference", profile({ pulseEffectsEnabled: "yes" })],
  ])("rejects %s", async (_label, body) => {
    signInAs(cast.user);
    expect((await patch(body)).status).toBe(400);
  });

  describe("fixed test-set accounts", () => {
    function fixedMember() {
      return makeMember({
        email: "test-user-explorer@local",
        nmsName: "TestUserExplorer",
        nmsCode: "TESTUSREXP001",
        platforms: ["PC"],
        specialty: "explorer",
        telegramName: "",
        discordName: "",
      });
    }

    function unchangedProfile(member: ReturnType<typeof fixedMember>, overrides: Record<string, unknown> = {}) {
      return {
        nmsName: member.nmsName,
        nmsCode: member.nmsCode,
        platforms: member.platforms,
        specialty: member.specialty,
        telegramName: "",
        discordName: "",
        ...overrides,
      };
    }

    beforeEach(() => {
      vi.stubEnv("LOCAL_AUTH", "true");
      vi.stubEnv("LOCAL_AUTH_SET", "test");
    });

    it("refuses any profile change", async () => {
      const member = fixedMember();
      seedMembers([...castMembers(cast), member]);
      signInAs(member);
      for (const overrides of [
        { nmsName: "Renamed" },
        { platforms: ["PC", "Mac"] },
        { specialty: "builder" },
        { telegramName: "tg" },
        { pulseEffectsEnabled: false },
      ]) {
        const response = await patch(unchangedProfile(member, overrides));
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({
          error: "Questo account locale è fisso per i test: il profilo non è modificabile.",
        });
      }
      expect(readMembers().find((item) => item.publicId === member.publicId)).toMatchObject({
        nmsName: member.nmsName,
        specialty: "explorer",
      });
    });

    it("still accepts the unchanged profile sent by the view toggle", async () => {
      const member = fixedMember();
      seedMembers([...castMembers(cast), member]);
      signInAs(member);
      const response = await patch(unchangedProfile(member, { simpleView: true }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ nmsName: member.nmsName, simpleView: true });
    });

    it("treats omitted contact names as unchanged empty names", async () => {
      const member = fixedMember();
      seedMembers([...castMembers(cast), member]);
      signInAs(member);
      const body: Record<string, unknown> = unchangedProfile(member);
      delete body.telegramName;
      delete body.discordName;
      expect((await patch(body)).status).toBe(200);
      const refused = await patch({ ...body, discordName: "new#1" });
      expect(refused.status).toBe(403);
    });

    it("does not restrict development accounts", async () => {
      vi.stubEnv("LOCAL_AUTH_SET", "");
      const member = makeMember({ email: "user@local" });
      seedMembers([...castMembers(cast), member]);
      signInAs(member);
      expect((await patch(profile())).status).toBe(200);
    });
  });

  it("lets a pending member complete their profile", async () => {
    signInAs(cast.pending);
    const response = await patch(profile());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      nmsName: "Captain",
      nmsCode: "ZZZZYYYYXXXXX",
      telegramName: "tg",
      discordName: "",
      platforms: ["PlayStation"],
      specialty: "ranger",
      simpleView: true,
      pulseEffectsEnabled: true,
      role: "user",
    });
    const stored = readMembers().find((member) => member.publicId === cast.pending.publicId);
    expect(stored).toMatchObject({
      nmsName: "Captain",
      nmsCode: "ZZZZYYYYXXXXX",
      telegramName: "tg",
      membershipStatus: "pending",
    });
    expect(stored).not.toHaveProperty("discordName");
  });

  it("ignores simple view for users and stores it for moderators and admins", async () => {
    signInAs(cast.user);
    expect(await (await patch(profile({ simpleView: false }))).json()).toMatchObject({ simpleView: true });

    signInAs(cast.moderator);
    expect(
      await (await patch(profile({ nmsName: "Mod", nmsCode: "MMMMMMMMMMMMM", simpleView: true }))).json(),
    ).toMatchObject({ simpleView: true, role: "moderator" });
    expect(readMembers().find((member) => member.publicId === cast.moderator.publicId)?.simpleView).toBe(true);

    signInAs(cast.simpleAdmin);
    expect((await patch(profile({ nmsName: "Back", nmsCode: "BBBBBBBBBBBBB", simpleView: false }))).status).toBe(200);
    expect(readMembers().find((member) => member.publicId === cast.simpleAdmin.publicId)?.simpleView).toBe(false);
  });

  it("saves and returns the pulse preference, enabled by default", async () => {
    signInAs(cast.user);
    expect(await (await (await routes()).GET()).json()).toMatchObject({ pulseEffectsEnabled: true });

    const disabled = await patch(profile({ pulseEffectsEnabled: false }));
    expect(disabled.status).toBe(200);
    expect(await disabled.json()).toMatchObject({ pulseEffectsEnabled: false });
    expect(readMembers().find((member) => member.publicId === cast.user.publicId)).toMatchObject({
      pulseEffectsEnabled: false,
    });

    const enabled = await patch(profile({ pulseEffectsEnabled: true }));
    expect(enabled.status).toBe(200);
    expect(await enabled.json()).toMatchObject({ pulseEffectsEnabled: true });
    expect(readMembers().find((member) => member.publicId === cast.user.publicId)).not.toHaveProperty(
      "pulseEffectsEnabled",
    );
  });

  it("returns 409 when the name or friend code belongs to someone else", async () => {
    signInAs(cast.user);
    const nameClash = await patch(profile({ nmsName: cast.offline.nmsName }));
    expect(nameClash.status).toBe(409);
    expect(await nameClash.json()).toEqual({ error: "members.duplicate_in_game_name" });
    const codeClash = await patch(profile({ nmsCode: cast.admin.nmsCode }));
    expect(codeClash.status).toBe(409);
    expect(await codeClash.json()).toEqual({ error: "members.duplicate_friend_code" });
    expect(readMembers().find((member) => member.publicId === cast.user.publicId)?.nmsName).toBe(cast.user.nmsName);
  });

  it("allows keeping one's own name and code", async () => {
    signInAs(cast.user);
    expect((await patch(profile({ nmsName: cast.user.nmsName, nmsCode: cast.user.nmsCode }))).status).toBe(200);
  });

  it("returns 404 if the profile disappears before the update", async () => {
    const store = await import("@/lib/access-store");
    vi.spyOn(store, "updateMemberProfile").mockResolvedValue(null);
    signInAs(cast.user);
    expect((await patch(profile())).status).toBe(404);
  });
});
