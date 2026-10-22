import { mkdirSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { writeDataFile } from "../helpers/members";
import { blobMock, readBlobJson, resetStores, setBlobJson, useBlobBackend } from "./helpers";
import { defaultTaxiNotificationSettings, isTaxiNotificationSettings } from "@/lib/taxi-notifications";

vi.mock("@vercel/blob", async () => (await import("./helpers")).blobModule);
const load = () => import("@/lib/taxi-notifications-store");
const file = "taxi-notifications.json";
const blob = "alliance-manager/" + file;
const keys = webpush.generateVAPIDKeys();
const sub = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test",
  keys: { p256dh: keys.publicKey, auth: Buffer.alloc(16).toString("base64url") },
};
const data = () => ({ settings: { ...defaultTaxiNotificationSettings }, disabledMembers: [], devices: [] });
beforeEach(() => {
  resetStores();
});

describe("Taxi notification persistence", () => {
  it.each([false, true])(
    "migrates legacy settings without changing delivery or devices (Blob=%s)",
    async (blobBackend) => {
      const legacy = {
        settings: { ...defaultTaxiNotificationSettings, telegramEnabled: true, telegramChatId: "-123" },
        disabledMembers: ["one"],
        devices: [{ memberId: "two", subscription: sub }],
      };
      Reflect.deleteProperty(legacy.settings, "telegramThreadId");
      if (blobBackend) {
        useBlobBackend();
        setBlobJson(blob, legacy);
      } else {
        writeDataFile(file, legacy);
      }
      const expected = { ...legacy, settings: { ...legacy.settings, telegramThreadId: "" } };
      expect(await (await load()).readTaxiNotifications()).toEqual(expected);
      expect(blobBackend ? readBlobJson(blob) : JSON.parse(readFileSync("data/" + file, "utf8"))).toEqual(expected);
      if (blobBackend) {
        blobMock.put.mockClear();
        await (await load()).readTaxiNotifications();
        expect(blobMock.put).not.toHaveBeenCalled();
      }
    },
  );
  it("defaults missing documents to disabled channels and enabled personal preferences", async () => {
    const { readTaxiNotifications } = await load();
    expect(await readTaxiNotifications()).toEqual(data());
    const first = await readTaxiNotifications();
    first.settings.pushEnabled = true;
    expect((await readTaxiNotifications()).settings.pushEnabled).toBe(false);
  });
  it("atomically persists settings, devices and preferences, serializing concurrent mutations", async () => {
    const store = await load();
    await Promise.all([
      store.saveTaxiNotificationSettings({
        ...defaultTaxiNotificationSettings,
        pushEnabled: true,
        telegramThreadId: "123",
      }),
      store.setTaxiPushPreference("one", false),
      store.saveTaxiPushDevice("one", sub),
      store.setTaxiPushPreference("two", false),
    ]);
    expect(await store.readTaxiNotifications()).toMatchObject({
      settings: { pushEnabled: true, telegramThreadId: "123" },
      disabledMembers: ["one", "two"],
      devices: [{ memberId: "one", subscription: sub }],
    });
    await store.setTaxiPushPreference("one", true);
    await store.removeTaxiPushDevice(sub.endpoint);
    expect(await store.readTaxiNotifications()).toMatchObject({ disabledMembers: ["two"], devices: [] });
  });
  it("uses private Blob in production and treats absent/304 documents as new installations", async () => {
    useBlobBackend();
    const store = await load();
    expect(await store.readTaxiNotifications()).toEqual(data());
    blobMock.get.mockResolvedValueOnce({ statusCode: 304, stream: null });
    expect(await store.readTaxiNotifications()).toEqual(data());
    await store.saveTaxiNotificationSettings({ ...defaultTaxiNotificationSettings, discordEnabled: true });
    expect(blobMock.put).toHaveBeenCalledWith(
      blob,
      expect.any(String),
      expect.objectContaining({ access: "private", allowOverwrite: true }),
    );
    expect(readBlobJson(blob)).toMatchObject({ settings: { discordEnabled: true } });
    expect((await store.readTaxiNotifications()).settings.discordEnabled).toBe(true);
    setBlobJson(blob, {});
    await expect(store.readTaxiNotifications()).rejects.toThrow("Invalid");
  });
  it("propagates filesystem errors rather than replacing unreadable data", async () => {
    mkdirSync("data/" + file, { recursive: true });
    await expect((await load()).readTaxiNotifications()).rejects.toThrow();
  });
  it.each([
    null,
    [],
    {},
    { settings: null, disabledMembers: [], devices: [] },
    { ...data(), disabledMembers: [1] },
    { ...data(), devices: null },
    { ...data(), devices: [null] },
    { ...data(), devices: [{}] },
    { ...data(), devices: [{ memberId: 1, subscription: sub }] },
  ])("rejects corrupt stored data %j", async (value) => {
    writeDataFile(file, value);
    await expect((await load()).readTaxiNotifications()).rejects.toThrow("Invalid");
  });
  it.each([
    null,
    [],
    {},
    { ...sub, endpoint: 1 },
    { ...sub, endpoint: "x".repeat(2049) },
    { ...sub, endpoint: "not a url" },
    { ...sub, endpoint: "http://fcm.googleapis.com/test" },
    { ...sub, endpoint: "https://user:secret@fcm.googleapis.com/test" },
    { ...sub, endpoint: "https://fcm.googleapis.com:8443/test" },
    { ...sub, endpoint: "https://fcm.googleapis.com/test#hash" },
    { ...sub, endpoint: "https://localhost/test" },
    { ...sub, endpoint: "https://fcm.googleapis.com.attacker.example/test" },
    { ...sub, keys: null },
    { ...sub, keys: {} },
    { ...sub, keys: { ...sub.keys, p256dh: 1 } },
    { ...sub, keys: { ...sub.keys, p256dh: "a" } },
    { ...sub, keys: { ...sub.keys, p256dh: "A".repeat(87) } },
    { ...sub, keys: { ...sub.keys, auth: 1 } },
    { ...sub, keys: { ...sub.keys, auth: "bad" } },
  ])("rejects malformed/unsafe push subscriptions %j", async (value) => {
    expect((await load()).isPushSubscription(value)).toBe(false);
  });
  it.each(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "wns1.notify.windows.com"])(
    "accepts the browser push service %s",
    async (host) => {
      expect((await load()).isPushSubscription({ ...sub, endpoint: `https://${host}/test` })).toBe(true);
    },
  );
  it.each([
    null,
    {},
    { ...defaultTaxiNotificationSettings, repliesEnabled: 1 },
    { ...defaultTaxiNotificationSettings, telegramChatId: 1 },
  ])("rejects invalid setting shapes %j", (value) => {
    expect(isTaxiNotificationSettings(value)).toBe(false);
  });
});
