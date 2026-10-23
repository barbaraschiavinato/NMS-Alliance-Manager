import { describe, expect, it, vi } from "vitest";
import { signInAs } from "../helpers/auth";
import { makeMember, seedMembers } from "../helpers/members";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);

describe("test harness", () => {
  it("resolves the real member from a mocked session", async () => {
    const member = makeMember({ role: "moderator", simpleView: true });
    seedMembers([member]);
    signInAs(member);
    const { getCurrentMember } = await import("@/lib/auth/authorization");
    const current = await getCurrentMember();
    expect(current?.publicId).toBe(member.publicId);
    expect(current?.role).toBe("user");
    expect(current?.displayRole).toBe("moderator");
    expect(process.cwd()).toContain("alliance-manager-test-");
  });
});
