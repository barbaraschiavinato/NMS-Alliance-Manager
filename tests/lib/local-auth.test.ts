import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidNmsFriendCode, memberRoles, memberSpecialties } from "@/lib/members/member-types";
import {
  adminEmail,
  devLocalAccounts,
  findLocalAccount,
  getLocalAccountOptions,
  getLocalAccounts,
  isFixedLocalAccount,
  testLocalAccounts,
} from "@/lib/auth/local-auth";

describe.each([
  ["development", devLocalAccounts],
  ["test", testLocalAccounts],
])("%s accounts", (_name, accounts) => {
  it.each(["email", "name", "nmsName", "nmsCode"] as const)("have a unique %s", (field) => {
    const values = accounts.map((account) => account[field].toLowerCase());
    expect(new Set(values).size).toBe(values.length);
  });

  it("use valid NMS friend codes", () => {
    for (const account of accounts) expect(isValidNmsFriendCode(account.nmsCode)).toBe(true);
  });
});

describe("devLocalAccounts", () => {
  it("has one account per role, starting with the main admin", () => {
    expect(devLocalAccounts.map((account) => account.role)).toEqual(["admin", "moderator", "user"]);
    expect(devLocalAccounts[0].email).toBe(adminEmail);
  });

  it("gives the main admin explorer as the default specialty", () => {
    expect(devLocalAccounts[0].specialty).toBe("explorer");
  });
});

describe("testLocalAccounts", () => {
  it("has every role and specialty combination exactly once", () => {
    const combinations = testLocalAccounts.map((account) => `${account.role}:${account.specialty}`).sort();
    const expected = memberRoles.flatMap((role) => memberSpecialties.map((specialty) => `${role}:${specialty}`)).sort();
    expect(testLocalAccounts).toHaveLength(9);
    expect(combinations).toEqual(expected);
  });

  it("derives the email from the role and the specialty", () => {
    const account = testLocalAccounts.find((item) => item.role === "moderator" && item.specialty === "builder");
    expect(account?.email).toBe("test-moderator-builder@local");
    expect(account?.nmsCode).toBe("TESTMODBLD001");
  });

  it("does not share emails with the development accounts", () => {
    const devEmails = new Set(devLocalAccounts.map((account) => account.email));
    expect(testLocalAccounts.some((account) => devEmails.has(account.email))).toBe(false);
  });
});

describe("account set selection", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the development accounts by default", () => {
    vi.stubEnv("LOCAL_AUTH_SET", "");
    expect(getLocalAccounts()).toBe(devLocalAccounts);
  });

  it("uses the test accounts with LOCAL_AUTH_SET=test", () => {
    vi.stubEnv("LOCAL_AUTH_SET", "test");
    expect(getLocalAccounts()).toBe(testLocalAccounts);
  });
});

describe("findLocalAccount", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("finds an account by email, ignoring case and spaces", () => {
    const account = devLocalAccounts[1];
    expect(findLocalAccount(` ${account.email.toUpperCase()} `)).toBe(account);
  });

  it("only knows the accounts of the selected set", () => {
    expect(findLocalAccount("test-admin-ranger@local")).toBeUndefined();
    vi.stubEnv("LOCAL_AUTH_SET", "test");
    expect(findLocalAccount("test-admin-ranger@local")).toBe(testLocalAccounts[0]);
    expect(findLocalAccount("moderator@local")).toBeUndefined();
  });

  it("ignores unknown emails", () => {
    expect(findLocalAccount("nobody@local")).toBeUndefined();
    expect(findLocalAccount(undefined)).toBeUndefined();
  });
});

describe("isFixedLocalAccount", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("leaves the development accounts editable", () => {
    vi.stubEnv("LOCAL_AUTH", "true");
    for (const account of devLocalAccounts) expect(isFixedLocalAccount(account.email)).toBe(false);
  });

  it("fixes every test account when local login is on", () => {
    vi.stubEnv("LOCAL_AUTH", "true");
    vi.stubEnv("LOCAL_AUTH_SET", "test");
    for (const account of testLocalAccounts) {
      expect(isFixedLocalAccount(account.email)).toBe(true);
      expect(isFixedLocalAccount(` ${account.email.toUpperCase()} `)).toBe(true);
    }
  });

  it("never affects Google users", () => {
    vi.stubEnv("LOCAL_AUTH", "true");
    vi.stubEnv("LOCAL_AUTH_SET", "test");
    expect(isFixedLocalAccount("someone@gmail.com")).toBe(false);
  });

  it("is off when local login is disabled", () => {
    vi.stubEnv("LOCAL_AUTH", "false");
    vi.stubEnv("LOCAL_AUTH_SET", "test");
    expect(isFixedLocalAccount("test-admin-ranger@local")).toBe(false);
  });
});

describe("getLocalAccountOptions", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is disabled unless LOCAL_AUTH is true", () => {
    vi.stubEnv("LOCAL_AUTH", "");
    expect(getLocalAccountOptions()).toBeUndefined();
  });

  it("lists the accounts of the selected set with their name as the label", () => {
    vi.stubEnv("LOCAL_AUTH", "true");
    vi.stubEnv("LOCAL_AUTH_SET", "test");
    const options = getLocalAccountOptions();
    expect(options).toHaveLength(9);
    expect(options?.[0]).toEqual({
      email: "test-admin-ranger@local",
      label: "Test Admin Ranger",
      role: "admin",
      specialty: "ranger",
    });
  });
});
