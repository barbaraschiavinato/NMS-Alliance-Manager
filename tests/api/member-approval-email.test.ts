import { beforeEach, describe, expect, it, vi } from "vitest";
import { after } from "next/server";
import { signInAs } from "../helpers/auth";
import { defaultAlliance, makeMember, seedMembers } from "../helpers/members";
import { jsonRequest } from "../helpers/http";
import * as admin from "@/app/api/admin/member-notifications/route";
import { PATCH as patchMembers } from "@/app/api/admin/members/route";
import { defaultMemberNotificationSettings } from "@/lib/notifications/member-notifications";
import { saveMemberNotificationSettings } from "@/lib/notifications/member-notifications-store";
import { memberNotificationReadiness } from "@/lib/notifications/member-notification-delivery";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: vi.fn(),
}));

const adminUrl = "/api/admin/member-notifications";
const administrator = makeMember({ role: "admin", simpleView: false, nmsName: "Chief" });
const pending = makeMember({
  membershipStatus: "pending",
  nmsName: "Newbie",
  email: "newbie@example.com",
  approvedBy: "",
  approvedAt: "",
});
const emailOnly = { ...defaultMemberNotificationSettings, approvalEmailEnabled: true };

function stubResend(status = 200) {
  vi.stubEnv("AUTH_URL", "https://alliance.example.com/api/auth");
  vi.stubEnv("RESEND_API_KEY", "re_test_key_123");
  vi.stubEnv("RESEND_FROM_EMAIL", "Alliance <no-reply@alliance.example.com>");
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "mail-1" }), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function runScheduled(index: number) {
  const task = vi.mocked(after).mock.calls[index]?.[0];
  if (typeof task !== "function") throw new Error("Expected an after callback.");
  await task();
}

const approve = (email = pending.email, membershipStatus = "approved") =>
  patchMembers(jsonRequest("/api/admin/members", "PATCH", { email, membershipStatus }));

beforeEach(async () => {
  vi.mocked(after).mockClear();
  await saveMemberNotificationSettings(defaultMemberNotificationSettings);
  seedMembers([administrator, pending], { ...defaultAlliance, name: "Test Alliance" });
  signInAs(administrator);
});

describe("approval email", () => {
  it("emails the approved member once, in Italian and English, without staff details", async () => {
    const fetch = stubResend();
    await saveMemberNotificationSettings(emailOnly);
    expect((await approve()).status).toBe(200);
    expect(after).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    await runScheduled(0);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test_key_123", "Content-Type": "application/json" });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: "Alliance <no-reply@alliance.example.com>", to: ["newbie@example.com"] });
    expect(body.subject).toBe("Accesso approvato · Access approved — Test Alliance");
    for (const part of [body.text, body.html]) {
      expect(part).toContain("Ciao Newbie");
      expect(part).toContain("Hi Newbie");
      expect(part).toContain("https://alliance.example.com");
      expect(part).not.toContain("Chief");
    }
  });

  it("sends the Telegram alert and the email independently", async () => {
    const fetch = stubResend();
    vi.stubEnv("TELEGRAM_MEMBERS_BOT_TOKEN", "123:test");
    await saveMemberNotificationSettings({
      ...emailOnly,
      telegramEnabled: true,
      telegramChatId: "-123",
    });
    await approve();
    expect(after).toHaveBeenCalledTimes(2);
    await runScheduled(0);
    await runScheduled(1);
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining("api.telegram.org"),
      "https://api.resend.com/emails",
    ]);
  });

  it("does not schedule an email when the option is off", async () => {
    stubResend();
    await saveMemberNotificationSettings({ ...defaultMemberNotificationSettings, telegramEnabled: false });
    await approve();
    expect(after).not.toHaveBeenCalled();
  });

  it.each([
    ["blocked", "approved"],
    ["approved", "blocked"],
    ["approved", "pending"],
    ["approved", "approved"],
  ])("sends no email when the status goes from %s to %s", async (from, to) => {
    const fetch = stubResend();
    const target = makeMember({ membershipStatus: from as "approved", email: "target@example.com" });
    seedMembers([administrator, target]);
    await saveMemberNotificationSettings(emailOnly);
    await approve(target.email, to);
    for (let index = 0; index < vi.mocked(after).mock.calls.length; index++) await runScheduled(index);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends no email on role changes or removals", async () => {
    const fetch = stubResend();
    await saveMemberNotificationSettings(emailOnly);
    const target = makeMember({ email: "target@example.com" });
    seedMembers([administrator, target]);
    await patchMembers(jsonRequest("/api/admin/members", "PATCH", { email: target.email, role: "moderator" }));
    expect(after).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["an offline player", { offline: true, email: "offline-1@offline.invalid" }],
    ["a placeholder address", { email: "someone@offline.invalid" }],
    ["a malformed address", { email: "not-an-address" }],
  ])("never emails %s", async (_label, overrides) => {
    const fetch = stubResend();
    const target = makeMember({ membershipStatus: "pending", ...overrides });
    seedMembers([administrator, target]);
    await saveMemberNotificationSettings(emailOnly);
    await approve(target.email);
    await runScheduled(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("escapes the member and alliance names in the HTML part", async () => {
    const fetch = stubResend();
    const risky = makeMember({
      membershipStatus: "pending",
      nmsName: '<img src=x onerror="alert(1)">',
      email: "risky@example.com",
    });
    seedMembers([administrator, risky], { ...defaultAlliance, name: "A&B <Alliance>" });
    await saveMemberNotificationSettings(emailOnly);
    await approve(risky.email);
    await runScheduled(0);
    const { html } = JSON.parse(fetch.mock.calls[0][1].body);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("A&amp;B &lt;Alliance&gt;");
  });

  it("falls back to the product name for an unnamed alliance and to a generic greeting", async () => {
    const fetch = stubResend();
    const unnamed = makeMember({ membershipStatus: "pending", nmsName: "", name: "  ", email: "anon@example.com" });
    seedMembers([administrator, unnamed], { ...defaultAlliance, name: "" });
    await saveMemberNotificationSettings(emailOnly);
    await approve(unnamed.email);
    await runScheduled(0);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.subject).toContain("NMS Alliance Manager");
    expect(body.text).toContain("Ciao Utente");
  });

  it("never lets a failed email surface to the caller", async () => {
    stubResend(500);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await saveMemberNotificationSettings(emailOnly);
    expect((await approve()).status).toBe(200);
    await expect(runScheduled(0)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("Approval email failed", expect.stringContaining("Resend: HTTP 500"));
  });

  it("skips members that disappeared before delivery and logs non-Error failures", async () => {
    const fetch = stubResend();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await saveMemberNotificationSettings(emailOnly);
    await approve();
    seedMembers([administrator]);
    await runScheduled(0);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRejectedValue("unexpected");
    seedMembers([administrator, pending]);
    await runScheduled(0);
    expect(error).toHaveBeenCalledWith("Approval email failed", expect.any(String));
  });
});

describe("approval email administration", () => {
  it("validates the Resend credentials and sender for readiness", () => {
    expect(memberNotificationReadiness().email).toBe(false);
    vi.stubEnv("RESEND_API_KEY", "re_test_key_123");
    expect(memberNotificationReadiness().email).toBe(false);
    for (const sender of ["no-reply@alliance.example.com", "NMS Alliance <no-reply@alliance.example.com>"]) {
      vi.stubEnv("RESEND_FROM_EMAIL", sender);
      expect(memberNotificationReadiness().email).toBe(true);
    }
    for (const sender of ["no-reply", "<no-reply@alliance.example.com>", "Bad\nName <a@b.co>", "a@b"]) {
      vi.stubEnv("RESEND_FROM_EMAIL", sender);
      expect(memberNotificationReadiness().email).toBe(false);
    }
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@alliance.example.com");
    vi.stubEnv("RESEND_API_KEY", "not-a-key");
    expect(memberNotificationReadiness().email).toBe(false);
  });

  it("refuses to enable the email without credentials or a valid application URL", async () => {
    expect((await admin.PATCH(jsonRequest(adminUrl, "PATCH", emailOnly))).status).toBe(400);
    stubResend();
    vi.stubEnv("AUTH_URL", "");
    expect((await admin.PATCH(jsonRequest(adminUrl, "PATCH", emailOnly))).status).toBe(400);
  });

  it("saves the option, reports it and keeps the flag for documents written before it existed", async () => {
    stubResend();
    expect((await admin.PATCH(jsonRequest(adminUrl, "PATCH", emailOnly))).status).toBe(200);
    const body = await (await admin.GET()).json();
    expect(body.settings.approvalEmailEnabled).toBe(true);
    expect(body.readiness).toEqual({ telegram: false, email: true, links: true });
  });

  it.each([
    { ...emailOnly, approvalEmailEnabled: "yes" },
    { telegramEnabled: false, telegramChatId: "", telegramThreadId: "" },
  ])("rejects settings without a boolean email flag: %j", async (value) => {
    expect((await admin.PATCH(jsonRequest(adminUrl, "PATCH", value))).status).toBe(400);
  });

  it("sends the test email only to the administrator who asked for it", async () => {
    const fetch = stubResend();
    await saveMemberNotificationSettings(emailOnly);
    const response = await admin.POST(jsonRequest(adminUrl, "POST", { channel: "email" }));
    expect(response.status).toBe(200);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ to: [administrator.email] });
  });

  it("refuses the test email while the option is off, and reports delivery failures generically", async () => {
    const fetch = stubResend();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await admin.POST(jsonRequest(adminUrl, "POST", { channel: "email" }))).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    await saveMemberNotificationSettings(emailOnly);
    fetch.mockResolvedValue(new Response("{}", { status: 422 }));
    expect((await admin.POST(jsonRequest(adminUrl, "POST", { channel: "email" }))).status).toBe(503);
  });

  it.each([{ channel: "sms" }, { channel: 1 }])("rejects the unknown test channel %j", async (value) => {
    expect((await admin.POST(jsonRequest(adminUrl, "POST", value))).status).toBe(400);
  });
});
