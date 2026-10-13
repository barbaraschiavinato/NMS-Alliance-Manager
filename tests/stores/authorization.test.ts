import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AllianceMember, MemberRole } from "@/lib/member-types";
import { signInAs as helperSignInAs } from "../helpers/auth";
import { makeMember, seedMembers } from "../helpers/members";
import { readDataFile, resetStores } from "./helpers";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);

const load = () => import("@/lib/authorization");

// resetStores azzera il registro dei moduli, ma la factory di vi.mock resta in cache:
// il mock va preso da @/auth stesso, non dall'helper importato staticamente.
let authMock: typeof import("../helpers/auth").authMock;

function signInAs(member: Pick<AllianceMember, "email" | "name" | "image"> | null) {
  helperSignInAs(member);
  authMock.auth.mockResolvedValue(
    member ? { user: { email: member.email, name: member.name, image: member.image } } : null,
  );
}

beforeEach(async () => {
  resetStores();
  authMock = (await import("@/auth")) as unknown as typeof authMock;
});

describe("getCurrentMember", () => {
  it.each(["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"])(
    "returns null without calling auth when %s is missing",
    async (key) => {
      const member = makeMember();
      seedMembers([member]);
      signInAs(member);
      vi.stubEnv(key, "");
      const { getCurrentMember } = await load();
      expect(await getCurrentMember()).toBeNull();
      expect(authMock.auth).not.toHaveBeenCalled();
    },
  );

  it("still resolves the member when only ALLIANCE_ADMIN_EMAIL is missing", async () => {
    const member = makeMember();
    seedMembers([member]);
    signInAs(member);
    vi.stubEnv("ALLIANCE_ADMIN_EMAIL", "");
    const { getCurrentMember } = await load();
    expect((await getCurrentMember())?.publicId).toBe(member.publicId);
  });

  it("skips the configuration check in local auth mode", async () => {
    const member = makeMember();
    seedMembers([member]);
    vi.stubEnv("LOCAL_AUTH", "true");
    vi.stubEnv("NODE_ENV", "development");
    authMock.auth.mockResolvedValue({ user: { email: member.email, name: member.name, image: member.image } });
    const { getCurrentMember } = await load();
    expect((await getCurrentMember())?.publicId).toBe(member.publicId);
  });

  it("returns null without a session or session email", async () => {
    signInAs(null);
    const { getCurrentMember } = await load();
    expect(await getCurrentMember()).toBeNull();
    authMock.auth.mockResolvedValue({ user: { name: "No Email" } });
    expect(await getCurrentMember()).toBeNull();
    authMock.auth.mockResolvedValue({});
    expect(await getCurrentMember()).toBeNull();
  });

  it("registers a first-time visitor as pending and hides them unless allowPending", async () => {
    signInAs(null);
    authMock.auth.mockResolvedValue({ user: { email: "New@Example.com" } });
    const { getCurrentMember } = await load();
    expect(await getCurrentMember()).toBeNull();
    const pending = await getCurrentMember({ allowPending: true });
    expect(pending).toMatchObject({
      email: "new@example.com",
      name: "New@Example.com",
      image: "",
      membershipStatus: "pending",
      role: "user",
    });
    expect((readDataFile("access.json") as { members: AllianceMember[] }).members).toHaveLength(1);
  });

  it("hides blocked members unless allowBlocked", async () => {
    const member = makeMember({ membershipStatus: "blocked" });
    seedMembers([member]);
    signInAs(member);
    const { getCurrentMember } = await load();
    expect(await getCurrentMember()).toBeNull();
    expect(await getCurrentMember({ allowPending: true })).toBeNull();
    expect((await getCurrentMember({ allowBlocked: true }))?.publicId).toBe(member.publicId);
  });

  it("never returns offline members", async () => {
    const member = makeMember({ offline: true });
    seedMembers([member]);
    signInAs(member);
    const { getCurrentMember } = await load();
    expect(await getCurrentMember({ allowBlocked: true, allowPending: true })).toBeNull();
  });

  it("auto-approves the configured admin", async () => {
    signInAs({ email: "root-admin@example.com", name: "Root", image: "" });
    const { getCurrentMember } = await load();
    expect(await getCurrentMember()).toMatchObject({ role: "admin", membershipStatus: "approved", simpleView: false });
  });

  it.each(["moderator", "admin"] as const)(
    "downgrades a %s in simple view to user, keeping displayRole",
    async (role) => {
      const member = makeMember({ role, simpleView: true });
      seedMembers([member]);
      signInAs(member);
      const { getCurrentMember } = await load();
      expect(await getCurrentMember()).toEqual({ ...member, role: "user", displayRole: role });
    },
  );

  it("returns staff unchanged without simple view, and users unchanged", async () => {
    const moderator = makeMember({ role: "moderator", simpleView: false });
    const user = makeMember({ role: "user" });
    seedMembers([moderator, user]);
    const { getCurrentMember } = await load();
    signInAs(moderator);
    expect(await getCurrentMember()).toEqual(moderator);
    signInAs(user);
    const current = await getCurrentMember();
    expect(current).toEqual(user);
    expect(current).not.toHaveProperty("displayRole");
  });
});

describe("hasRole", () => {
  const cases: [MemberRole, MemberRole, boolean][] = [
    ["user", "user", true],
    ["user", "moderator", false],
    ["user", "admin", false],
    ["moderator", "user", true],
    ["moderator", "moderator", true],
    ["moderator", "admin", false],
    ["admin", "user", true],
    ["admin", "moderator", true],
    ["admin", "admin", true],
  ];

  it.each(cases)("%s meets minimum %s: %s", async (role, minimum, expected) => {
    const { hasRole } = await load();
    expect(hasRole(makeMember({ role }), minimum)).toBe(expected);
  });

  it("is false for a missing member", async () => {
    const { hasRole } = await load();
    expect(hasRole(null, "user")).toBe(false);
  });
});
