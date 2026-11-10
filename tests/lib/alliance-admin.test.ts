import { describe, expect, it, vi } from "vitest";
import { allianceAdminEmail } from "@/lib/auth/alliance-admin";

describe("allianceAdminEmail", () => {
  it("returns the configured email trimmed and lowercased", () => {
    vi.stubEnv("ALLIANCE_ADMIN_EMAIL", "  Root-Admin@Example.com ");
    expect(allianceAdminEmail()).toBe("root-admin@example.com");
  });

  it("returns undefined when the variable is unset or blank", () => {
    expect(allianceAdminEmail()).toBeUndefined();
    vi.stubEnv("ALLIANCE_ADMIN_EMAIL", "");
    expect(allianceAdminEmail()).toBeUndefined();
    vi.stubEnv("ALLIANCE_ADMIN_EMAIL", "   ");
    expect(allianceAdminEmail()).toBeUndefined();
  });
});
