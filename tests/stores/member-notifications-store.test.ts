import { mkdirSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeDataFile } from "../helpers/members";
import { blobMock, readBlobJson, resetStores, setBlobJson, useBlobBackend } from "./helpers";
import { defaultMemberNotificationSettings, isMemberNotificationSettings } from "@/lib/member-notifications";

vi.mock("@vercel/blob", async () => (await import("./helpers")).blobModule);
const load = () => import("@/lib/member-notifications-store");
const file = "member-notifications.json";
const blob = `alliance-manager/${file}`;
const settings = { telegramEnabled: true, telegramChatId: "-123", telegramThreadId: "5" };
const invalid = { settings: { ...settings, telegramChatId: "" } };

beforeEach(() => {
  resetStores();
});

describe("Member notification persistence", () => {
  it.each([false, true])("defaults to disabled alerts and round-trips settings (Blob=%s)", async (blobBackend) => {
    if (blobBackend) useBlobBackend();
    const { readMemberNotificationSettings, saveMemberNotificationSettings } = await load();
    expect(await readMemberNotificationSettings()).toEqual(defaultMemberNotificationSettings);
    await saveMemberNotificationSettings({ ...settings, extra: "ignored" } as typeof settings);
    const stored = blobBackend ? readBlobJson(blob) : JSON.parse(readFileSync(`data/${file}`, "utf8"));
    expect(stored).toEqual({ settings });
    expect(await readMemberNotificationSettings()).toEqual(settings);
  });

  it("treats a 304 Blob response as a new installation", async () => {
    useBlobBackend();
    blobMock.get.mockResolvedValueOnce({ statusCode: 304, stream: null });
    expect(await (await load()).readMemberNotificationSettings()).toEqual(defaultMemberNotificationSettings);
  });

  it.each([false, true])("rejects a corrupted document (Blob=%s)", async (blobBackend) => {
    if (blobBackend) {
      useBlobBackend();
      setBlobJson(blob, invalid);
    } else {
      writeDataFile(file, invalid);
    }
    await expect((await load()).readMemberNotificationSettings()).rejects.toThrow(
      "Invalid member notification storage.",
    );
  });

  it("rejects a document that is not an object", async () => {
    writeDataFile(file, "text");
    await expect((await load()).readMemberNotificationSettings()).rejects.toThrow(
      "Invalid member notification storage.",
    );
  });

  it("rethrows unexpected read errors", async () => {
    mkdirSync(`data/${file}`, { recursive: true });
    await expect((await load()).readMemberNotificationSettings()).rejects.toThrow();
  });

  it.each([null, [], { ...settings, telegramThreadId: "0" }, { ...settings, telegramEnabled: "true" }])(
    "validates settings %j",
    (value) => {
      expect(isMemberNotificationSettings(value)).toBe(false);
    },
  );
});
