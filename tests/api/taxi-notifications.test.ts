import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../helpers/auth";
import { makeMember, seedMembers, writeDataFile } from "../helpers/members";
import { jsonRequest } from "../helpers/http";
import * as admin from "@/app/api/admin/taxi-notifications/route";
import * as push from "@/app/api/profile/taxi-push/route";
import { defaultTaxiNotificationSettings } from "@/lib/taxi-notifications";
import { readTaxiNotifications, saveTaxiPushDevice } from "@/lib/taxi-notifications-store";
import * as notificationStore from "@/lib/taxi-notifications-store";
import { sendTaxiTest, taxiNotificationReadiness, taxiPushPublicKey } from "@/lib/taxi-notification-delivery";
import webpush from "web-push";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);
vi.mock("@/lib/taxi-notification-delivery", () => ({
  taxiNotificationReadiness: vi.fn(),
  taxiPushPublicKey: vi.fn(),
  sendTaxiTest: vi.fn(),
}));
const administrator = makeMember({ role: "admin", simpleView: false });
const member = makeMember();
const other = makeMember();
const keys = webpush.generateVAPIDKeys();
const sub = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test",
  keys: { p256dh: keys.publicKey, auth: Buffer.alloc(16).toString("base64url") },
};
const adminUrl = "/api/admin/taxi-notifications";
const pushUrl = "/api/profile/taxi-push";
const settings = {
  ...defaultTaxiNotificationSettings,
  discordEnabled: true,
  telegramEnabled: true,
  pushEnabled: true,
  telegramChatId: "-123",
};

beforeEach(() => {
  seedMembers([administrator, member, other]);
  writeDataFile("taxi-notifications.json", {
    settings: defaultTaxiNotificationSettings,
    disabledMembers: [],
    devices: [],
  });
  signInAs(administrator);
  vi.mocked(taxiNotificationReadiness).mockReturnValue({ discord: true, telegram: true, push: true, links: true });
  vi.mocked(taxiPushPublicKey).mockReturnValue(keys.publicKey);
});

describe("taxi notification APIs", () => {
  it.each([
    { ...defaultTaxiNotificationSettings },
    { ...defaultTaxiNotificationSettings, telegramEnabled: true, telegramChatId: "-123" },
    { ...defaultTaxiNotificationSettings, telegramEnabled: true, telegramChatId: "-123", telegramThreadId: "123" },
    { ...defaultTaxiNotificationSettings, telegramThreadId: "2147483647" },
    { ...defaultTaxiNotificationSettings, pushEnabled: true },
  ])("saves independently enabled channels %j", async (value) => {
    expect((await admin.PATCH(jsonRequest(adminUrl, "PATCH", value))).status).toBe(200);
    expect((await (await admin.GET()).json()).settings).toEqual(value);
  });
  it("clears the Telegram topic without changing the group or other settings", async () => {
    await admin.PATCH(jsonRequest(adminUrl, "PATCH", { ...settings, telegramThreadId: "123" }));
    expect((await readTaxiNotifications()).settings.telegramThreadId).toBe("123");
    await admin.PATCH(jsonRequest(adminUrl, "PATCH", settings));
    expect((await readTaxiNotifications()).settings).toEqual(settings);
  });
  it("rejects malformed JSON for every mutation endpoint", async () => {
    const malformed = (url: string, method: string) =>
      new Request(`http://localhost:3000${url}`, {
        method,
        body: "{",
        headers: { "Content-Type": "application/json" },
      });
    expect((await admin.PATCH(malformed(adminUrl, "PATCH"))).status).toBe(400);
    expect((await admin.POST(malformed(adminUrl, "POST"))).status).toBe(400);
    expect((await push.PATCH(malformed(pushUrl, "PATCH"))).status).toBe(400);
    expect((await push.POST(malformed(pushUrl, "POST"))).status).toBe(400);
    expect((await push.DELETE(malformed(pushUrl, "DELETE"))).status).toBe(400);
  });
  it("logs unexpected non-Error storage failures without exposing them to clients", async () => {
    vi.spyOn(notificationStore, "readTaxiNotifications").mockRejectedValue("unexpected");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await admin.GET()).status).toBe(503);
    expect((await push.GET()).status).toBe(503);
  });
  it("does not advertise push availability when an enabled channel has invalid credentials", async () => {
    await admin.PATCH(jsonRequest(adminUrl, "PATCH", settings));
    vi.mocked(taxiNotificationReadiness).mockReturnValue({ discord: true, telegram: true, push: false, links: true });
    expect((await (await push.GET()).json()).available).toBe(false);
    expect((await push.POST(jsonRequest(pushUrl, "POST", sub))).status).toBe(409);
  });
  it("restricts all admin operations to approved admins, including simple view", async () => {
    for (const user of [
      null,
      makeMember({ membershipStatus: "pending" }),
      member,
      makeMember({ role: "moderator" }),
      { ...administrator, simpleView: true },
    ]) {
      if (user) seedMembers([user]);
      signInAs(user);
      const expected = !user || user.membershipStatus !== "approved" ? 401 : 403;
      expect((await admin.GET()).status).toBe(expected);
      expect((await admin.PATCH(jsonRequest(adminUrl, "PATCH", settings))).status).toBe(expected);
      expect((await admin.POST(jsonRequest(adminUrl, "POST", { channel: "discord" }))).status).toBe(expected);
    }
  });
  it("saves settings separately and returns readiness without private subscriptions", async () => {
    const response = await admin.PATCH(jsonRequest(adminUrl, "PATCH", settings));
    expect(response.status).toBe(200);
    const body = await (await admin.GET()).json();
    expect(body.settings).toEqual(settings);
    expect(body).not.toHaveProperty("devices");
    expect((await admin.GET()).headers.get("cache-control")).toBe("no-store");
    await admin.POST(jsonRequest(adminUrl, "POST", { channel: "discord" }));
    expect(sendTaxiTest).toHaveBeenCalledWith("discord", administrator.publicId);
  });
  it.each([
    null,
    [],
    {},
    { ...settings, telegramChatId: "123" },
    { ...settings, telegramChatId: "" },
    { ...settings, pushEnabled: 1 },
    ...[undefined, null, 123, "0", "-1", "1.5", "abc", " 123 ", "01", "2147483648", "9007199254740992"].map(
      (telegramThreadId) => ({ ...settings, telegramThreadId }),
    ),
  ])("rejects invalid settings %j", async (value) => {
    expect((await admin.PATCH(jsonRequest(adminUrl, "PATCH", value))).status).toBe(400);
  });
  it.each(["discord", "telegram", "push", "links"] as const)(
    "requires valid %s configuration before enabling",
    async (channel) => {
      vi.mocked(taxiNotificationReadiness).mockReturnValue({
        discord: true,
        telegram: true,
        push: true,
        links: true,
        [channel]: false,
      });
      expect((await admin.PATCH(jsonRequest(adminUrl, "PATCH", settings))).status).toBe(400);
    },
  );
  it.each([null, {}, { channel: "other" }])("validates test channels %j", async (value) => {
    expect((await admin.POST(jsonRequest(adminUrl, "POST", value))).status).toBe(400);
  });
  it("reports test delivery failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendTaxiTest).mockRejectedValue(new Error("failed"));
    expect((await admin.POST(jsonRequest(adminUrl, "POST", { channel: "telegram" }))).status).toBe(503);
  });
  it("requires approved membership for every push operation", async () => {
    signInAs(null);
    expect((await push.GET()).status).toBe(401);
    expect((await push.POST(jsonRequest(pushUrl, "POST", sub))).status).toBe(401);
    expect((await push.PATCH(jsonRequest(pushUrl, "PATCH", { enabled: false }))).status).toBe(401);
    expect((await push.DELETE(jsonRequest(pushUrl, "DELETE", { endpoint: sub.endpoint }))).status).toBe(401);
  });
  it("defaults personal preferences to enabled, supports opt-out and guards disabled subscriptions", async () => {
    signInAs(member);
    expect(await (await push.GET()).json()).toEqual({ enabled: true, available: false, publicKey: keys.publicKey });
    expect((await push.POST(jsonRequest(pushUrl, "POST", sub))).status).toBe(409);
    expect((await push.PATCH(jsonRequest(pushUrl, "PATCH", { enabled: false, memberId: other.publicId }))).status).toBe(
      200,
    );
    expect((await (await push.GET()).json()).enabled).toBe(false);
    expect((await readTaxiNotifications()).disabledMembers).toEqual([member.publicId]);
    vi.mocked(taxiNotificationReadiness).mockReturnValue({ discord: true, telegram: true, push: false, links: true });
    expect((await (await push.GET()).json()).publicKey).toBeNull();
  });
  it("registers devices only for the session member and cannot delete other members' devices", async () => {
    await admin.PATCH(jsonRequest(adminUrl, "PATCH", settings));
    signInAs(member);
    expect((await push.POST(jsonRequest(pushUrl, "POST", { ...sub, memberId: other.publicId }))).status).toBe(201);
    expect((await readTaxiNotifications()).devices[0].memberId).toBe(member.publicId);
    signInAs(other);
    expect((await push.DELETE(jsonRequest(pushUrl, "DELETE", { endpoint: sub.endpoint }))).status).toBe(200);
    expect((await readTaxiNotifications()).devices).toHaveLength(1);
    signInAs(member);
    expect((await push.DELETE(jsonRequest(pushUrl, "DELETE", { endpoint: sub.endpoint }))).status).toBe(200);
    expect((await readTaxiNotifications()).devices).toHaveLength(0);
  });
  it.each([null, {}, { enabled: "yes" }])("rejects invalid push preferences %j", async (value) => {
    expect((await push.PATCH(jsonRequest(pushUrl, "PATCH", value))).status).toBe(400);
  });
  it.each([null, {}, { ...sub, endpoint: "http://127.0.0.1" }, { ...sub, keys: {} }])(
    "rejects invalid subscriptions %j",
    async (value) => {
      expect((await push.POST(jsonRequest(pushUrl, "POST", value))).status).toBe(400);
    },
  );
  it.each([null, {}, { endpoint: "" }, { endpoint: 1 }])("rejects invalid deletions %j", async (value) => {
    expect((await push.DELETE(jsonRequest(pushUrl, "DELETE", value))).status).toBe(400);
  });
  it("surfaces store errors explicitly", async () => {
    writeDataFile("taxi-notifications.json", {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await admin.GET()).status).toBe(503);
    expect((await admin.PATCH(jsonRequest(adminUrl, "PATCH", settings))).status).toBe(503);
    expect((await push.GET()).status).toBe(503);
    expect((await push.POST(jsonRequest(pushUrl, "POST", sub))).status).toBe(503);
    expect((await push.PATCH(jsonRequest(pushUrl, "PATCH", { enabled: true }))).status).toBe(503);
    expect((await push.DELETE(jsonRequest(pushUrl, "DELETE", { endpoint: sub.endpoint }))).status).toBe(503);
  });
  it("limits devices and reassigns an existing endpoint on explicit connection", async () => {
    for (let i = 0; i < 10; i++) await saveTaxiPushDevice(member.publicId, { ...sub, endpoint: sub.endpoint + i });
    await expect(saveTaxiPushDevice(member.publicId, sub)).rejects.toThrow("Too many");
    await saveTaxiPushDevice(other.publicId, { ...sub, endpoint: sub.endpoint + "0" });
    expect(
      (await readTaxiNotifications()).devices.filter((device) => device.memberId === member.publicId),
    ).toHaveLength(9);
  });
});
