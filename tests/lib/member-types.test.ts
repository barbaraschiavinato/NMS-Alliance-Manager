import { describe, expect, it } from "vitest";
import {
  formatNmsFriendCode,
  isEmailAddress,
  isValidNmsFriendCode,
  memberRoles,
  memberSpecialties,
  membershipStatuses,
  normalizeNmsFriendCode,
} from "@/lib/member-types";

describe("member constants", () => {
  it("lists roles from lowest to highest", () => {
    expect(memberRoles).toEqual(["user", "moderator", "admin"]);
    expect(memberSpecialties).toEqual(["builder", "ranger", "explorer"]);
    expect(membershipStatuses).toEqual(["pending", "approved", "blocked"]);
  });
});

describe("friend codes", () => {
  it("normalizes case, spaces and dashes", () => {
    expect(normalizeNmsFriendCode(" ab12-cd34 ef56g ")).toBe("AB12CD34EF56G");
  });

  it("formats as 4-4-5 groups, truncating extra characters", () => {
    expect(formatNmsFriendCode("ab12cd34ef56g")).toBe("AB12-CD34-EF56G");
    expect(formatNmsFriendCode("ab12cd34ef56gXYZ")).toBe("AB12-CD34-EF56G");
  });

  it("formats partial codes without trailing dashes", () => {
    expect(formatNmsFriendCode("")).toBe("");
    expect(formatNmsFriendCode("ab1")).toBe("AB1");
    expect(formatNmsFriendCode("ab12c")).toBe("AB12-C");
    expect(formatNmsFriendCode("ab12cd34")).toBe("AB12-CD34");
  });

  it("validates exactly 13 alphanumeric characters", () => {
    expect(isValidNmsFriendCode("AB12-CD34-EF56G")).toBe(true);
    expect(isValidNmsFriendCode("ab12 cd34 ef56g")).toBe(true);
    expect(isValidNmsFriendCode("AB12CD34EF56")).toBe(false);
    expect(isValidNmsFriendCode("AB12CD34EF56GH")).toBe(false);
    expect(isValidNmsFriendCode("AB12CD34EF56_")).toBe(false);
  });
});

describe("isEmailAddress", () => {
  it("accepts plain addresses, trimming whitespace", () => {
    expect(isEmailAddress("user@example.com")).toBe(true);
    expect(isEmailAddress("  user@example.com  ")).toBe(true);
  });

  it("rejects names and malformed addresses", () => {
    expect(isEmailAddress("Traveller")).toBe(false);
    expect(isEmailAddress("user@localhost")).toBe(false);
    expect(isEmailAddress("us er@example.com")).toBe(false);
    expect(isEmailAddress("a@b@c.com")).toBe(false);
    expect(isEmailAddress("")).toBe(false);
  });
});
