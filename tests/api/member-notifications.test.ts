import { beforeEach, describe, expect, it, vi } from "vitest";
import { after } from "next/server";
import { signInAs } from "../helpers/auth";
import { makeMember, seedMembers } from "../helpers/members";
import { jsonRequest } from "../helpers/http";
import * as admin from "@/app/api/admin/member-notifications/route";
import { PATCH as patchMembers } from "@/app/api/admin/members/route";
import { getCurrentMember } from "@/lib/auth/authorization";
import { defaultMemberNotificationSettings } from "@/lib/notifications/member-notifications";
import {
  readMemberNotificationSettings,
  saveMemberNotificationSettings,
} from "@/lib/notifications/member-notifications-store";
import * as notificationStore from "@/lib/notifications/member-notifications-store";
import {
  memberNotificationReadiness,
  notifyMemberApproved,
  notifyMemberRegistered,
  scheduleMemberNotification,
  sendMemberNotificationTest,
} from "@/lib/notifications/member-notification-delivery";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: vi.fn(),
}));

const adminUrl = "/api/admin/member-notifications";
const administrator = makeMember({ role: "admin", simpleView: false, nmsName: "Chief", telegramName: "@chief_nms" });
const pending = makeMember({
  membershipStatus: "pending",
  nmsName: "",
  name: "Newbie",
  approvedBy: "",
  approvedAt: "",
});
const settings = { telegramEnabled: true, telegramChatId: "-123", telegramThreadId: "7" };

function stubTelegram() {
  vi.stubEnv("AUTH_URL", "http://localhost:3000/api/auth");
  vi.stubEnv("TELEGRAM_MEMBERS_BOT_TOKEN", "123:test");
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function runScheduled(index: number) {
  const task = vi.mocked(after).mock.calls[index]?.[0];
  if (typeof task !== "function") throw new Error("Expected an after callback.");
  await task();
}

beforeEach(async () => {
  vi.mocked(after).mockClear();
  await saveMemberNotificationSettings(defaultMemberNotificationSettings);
  seedMembers([administrator, pending]);
  signInAs(administrator);
});

describe("member notification administration", () => {
  it("is limited to admins", async () => {
    for (const user of [null, makeMember({ role: "moderator" }), makeMember()]) {
      if (user) seedMembers([user]);
      signInAs(user);
      const expected = user ? 403 : 401;
      expect((await admin.GET()).status).toBe(expected);
      expect((await admin.PATCH(jsonRequest(adminUrl, "PATCH", settings))).status).toBe(expected);
      expect((await admin.POST()).status).toBe(expected);
    }
  });

  it("saves settings once the credentials are configured and reports readiness", async () => {
    stubTelegram();
    expect((await admin.PATCH(jsonRequest(adminUrl, "PATCH", settings))).status).toBe(200);
    const response = await admin.GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ settings, readiness: { telegram: true, links: true } });
  });

  it("logs storage failures without exposing them to clients", async () => {
    stubTelegram();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const read = vi.spyOn(notificationStore, "readMemberNotificationSettings").mockRejectedValue("unexpected");
    expect((await admin.GET()).status).toBe(503);
    read.mockRejectedValue(new Error("disk"));
    expect((await admin.GET()).status).toBe(503);
    vi.spyOn(notificationStore, "saveMemberNotificationSettings").mockRejectedValue("unexpected");
    expect((await admin.PATCH(jsonRequest(adminUrl, "PATCH", settings))).status).toBe(503);
  });

  it("refuses to enable alerts without credentials", async () => {
    expect((await admin.PATCH(jsonRequest(adminUrl, "PATCH", settings))).status).toBe(400);
    expect(await readMemberNotificationSettings()).toEqual(defaultMemberNotificationSettings);
  });

  it.each([
    null,
    {},
    { ...settings, telegramChatId: "123" },
    { ...settings, telegramChatId: "" },
    { ...settings, telegramThreadId: "0" },
    { ...settings, telegramEnabled: "yes" },
  ])("rejects invalid settings %j", async (value) => {
    expect((await admin.PATCH(jsonRequest(adminUrl, "PATCH", value))).status).toBe(400);
  });

  it("sends a test message and hides delivery failures behind a generic error", async () => {
    const fetch = stubTelegram();
    await saveMemberNotificationSettings(settings);
    expect((await admin.POST()).status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetch.mockResolvedValue(new Response("{}", { status: 500 }));
    expect((await admin.POST()).status).toBe(503);
  });
});

describe("member notification alerts", () => {
  it("announces a new pending registration once, without the email address", async () => {
    const fetch = stubTelegram();
    await saveMemberNotificationSettings(settings);
    signInAs({ email: "newcomer@example.com", name: "Newcomer", image: "" });
    await getCurrentMember({ allowPending: true });
    expect(after).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    await runScheduled(0);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot123:test/sendMessage");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ chat_id: "-123", message_thread_id: 7, parse_mode: "HTML" });
    expect(body.text).toContain("Nuova registrazione");
    expect(body.text).toContain("Newcomer");
    expect(body.text).toContain("http://localhost:3000/users");
    expect(body.text).not.toContain("newcomer@example.com");

    await getCurrentMember({ allowPending: true });
    expect(after).toHaveBeenCalledOnce();
  });

  it("does not schedule anything when alerts are disabled or the member is not newly pending", async () => {
    stubTelegram();
    signInAs({ email: "quiet@example.com", name: "Quiet", image: "" });
    await getCurrentMember({ allowPending: true });
    await saveMemberNotificationSettings(settings);
    signInAs(administrator);
    await getCurrentMember();
    signInAs({ email: "root-admin@example.com", name: "Root", image: "" });
    await getCurrentMember();
    expect(after).not.toHaveBeenCalled();
  });

  it("announces the approval of a pending member with the approver's name", async () => {
    const fetch = stubTelegram();
    await saveMemberNotificationSettings(settings);
    const response = await patchMembers(
      jsonRequest("/api/admin/members", "PATCH", { email: pending.email, membershipStatus: "approved" }),
    );
    expect(response.status).toBe(200);
    expect(after).toHaveBeenCalledOnce();
    await runScheduled(0);
    const { text } = JSON.parse(fetch.mock.calls[0][1].body);
    expect(text).toContain("Utente approvato");
    expect(text).toContain("Newbie");
    expect(text).toContain("Approvato da: Chief (@chief_nms)");
  });

  it("stays silent for other status changes and when alerts are disabled", async () => {
    stubTelegram();
    const request = (membershipStatus: string) =>
      patchMembers(jsonRequest("/api/admin/members", "PATCH", { email: pending.email, membershipStatus }));
    await request("approved");
    await saveMemberNotificationSettings(settings);
    await request("blocked");
    await request("approved");
    expect(after).not.toHaveBeenCalled();
  });

  it("never lets a failed alert surface to the caller", async () => {
    stubTelegram().mockRejectedValue(new Error("offline"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await saveMemberNotificationSettings(settings);
    await patchMembers(
      jsonRequest("/api/admin/members", "PATCH", { email: pending.email, membershipStatus: "approved" }),
    );
    await expect(runScheduled(0)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("Member Telegram notification failed", expect.any(String));
  });
});

describe("member notification delivery", () => {
  it("validates the bot token and the application URL for readiness", () => {
    expect(memberNotificationReadiness()).toEqual({ telegram: false, links: false });
    vi.stubEnv("TELEGRAM_MEMBERS_BOT_TOKEN", "not-a-token");
    vi.stubEnv("AUTH_URL", "https://alliance.example.com/api/auth");
    expect(memberNotificationReadiness()).toEqual({ telegram: false, links: true });
    vi.stubEnv("TELEGRAM_MEMBERS_BOT_TOKEN", "123:test");
    expect(memberNotificationReadiness()).toEqual({ telegram: true, links: true });
  });

  it("refuses to send a test while the channel is disabled", async () => {
    stubTelegram();
    await expect(sendMemberNotificationTest()).rejects.toThrow("This notification channel is disabled.");
  });
});

describe("member notification edge cases", () => {
  it("falls back to the Google name for an approver without an NMS name", async () => {
    const fetch = stubTelegram();
    const boss = makeMember({ role: "admin", simpleView: false, nmsName: "", name: "Boss" });
    seedMembers([boss, pending]);
    signInAs(boss);
    await saveMemberNotificationSettings(settings);
    await patchMembers(
      jsonRequest("/api/admin/members", "PATCH", { email: pending.email, membershipStatus: "approved" }),
    );
    await runScheduled(0);
    expect(JSON.parse(fetch.mock.calls[0][1].body).text).toContain("Approvato da: Boss");
  });

  it.each(["bad name", "abc", ""])("omits an invalid approver Telegram tag %j", async (telegramName) => {
    const fetch = stubTelegram();
    await saveMemberNotificationSettings(settings);
    await notifyMemberApproved(pending.publicId, { name: "Chief", telegramName });
    expect(JSON.parse(fetch.mock.calls[0][1].body).text).toContain("Approvato da: Chief\n");
  });

  it("omits the topic when none is set and uses neutral wording for a blank approver", async () => {
    const fetch = stubTelegram();
    await saveMemberNotificationSettings({ ...settings, telegramThreadId: "" });
    await notifyMemberApproved(pending.publicId, { name: "   " });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("message_thread_id");
    expect(body.text).toContain("Approvato da: un moderatore");
  });

  it("ignores unknown members and swallows non-Error delivery failures", async () => {
    const fetch = stubTelegram();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await saveMemberNotificationSettings(settings);
    await notifyMemberRegistered("missing");
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRejectedValue("unexpected");
    await notifyMemberRegistered(pending.publicId);
    expect(error).toHaveBeenCalledWith("Member Telegram notification failed", expect.any(String));
  });

  it("does nothing when alerts were disabled after scheduling, and logs non-Error failures", async () => {
    const fetch = stubTelegram();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await notifyMemberRegistered(pending.publicId);
    expect(fetch).not.toHaveBeenCalled();
    vi.spyOn(notificationStore, "readMemberNotificationSettings").mockRejectedValue("unexpected");
    await notifyMemberRegistered(pending.publicId);
    expect(error).toHaveBeenCalledWith("Member Telegram notification failed", "Unknown error");
  });

  it("logs scheduling failures instead of throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await saveMemberNotificationSettings(settings);
    vi.mocked(after).mockImplementation(() => {
      throw new Error("no request scope");
    });
    await scheduleMemberNotification(async () => {});
    vi.mocked(after).mockImplementation(() => {
      throw "unexpected";
    });
    await scheduleMemberNotification(async () => {});
    expect(error).toHaveBeenCalledTimes(2);
  });
});
