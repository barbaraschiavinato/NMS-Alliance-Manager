import { get, put } from "@vercel/blob";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { PushSubscription } from "web-push";
import { getBlobAuthOptions } from "@/lib/blob-config";
import { localDataPath } from "@/lib/local-data-path";
import {
  defaultTaxiNotificationSettings,
  isTaxiNotificationSettings,
  type TaxiNotificationSettings,
} from "@/lib/taxi-notifications";

type Device = { memberId: string; subscription: PushSubscription };
type NotificationData = {
  settings: TaxiNotificationSettings;
  disabledMembers: string[];
  devices: Device[];
};
const blobPath = "alliance-manager/taxi-notifications.json";

export function isPushSubscription(value: unknown): value is PushSubscription {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  if (typeof input.endpoint !== "string" || input.endpoint.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(input.endpoint);
  } catch {
    return false;
  }
  // Only browser push services may receive requests; never arbitrary user-supplied hosts.
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !(
      ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(url.hostname) ||
      /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)
    )
  )
    return false;
  const keys = input.keys;
  if (!keys || typeof keys !== "object") return false;
  const { p256dh, auth } = keys as Record<string, unknown>;
  return (
    typeof p256dh === "string" &&
    /^[A-Za-z0-9_-]{87}=?$/.test(p256dh) &&
    Buffer.from(p256dh, "base64url").length === 65 &&
    Buffer.from(p256dh, "base64url")[0] === 4 &&
    typeof auth === "string" &&
    /^[A-Za-z0-9_-]{22}(==)?$/.test(auth) &&
    Buffer.from(auth, "base64url").length === 16
  );
}

function parseData(value: unknown): NotificationData {
  if (!value || typeof value !== "object") throw new Error("Invalid taxi notification storage.");
  const data = value as Record<string, unknown>;
  if (
    !isTaxiNotificationSettings(data.settings) ||
    !Array.isArray(data.disabledMembers) ||
    !data.disabledMembers.every((id) => typeof id === "string") ||
    !Array.isArray(data.devices)
  )
    throw new Error("Invalid taxi notification storage.");
  const devices: Device[] = data.devices.map((device: unknown) => {
    if (!device || typeof device !== "object") throw new Error("Invalid push device.");
    const input = device as Record<string, unknown>;
    if (typeof input.memberId !== "string" || !isPushSubscription(input.subscription))
      throw new Error("Invalid push device.");
    return { memberId: input.memberId, subscription: input.subscription };
  });
  return { settings: data.settings, disabledMembers: data.disabledMembers, devices };
}

export async function readTaxiNotifications(): Promise<NotificationData> {
  const options = getBlobAuthOptions();
  let json: string | undefined;
  if (options) {
    const blob = await get(blobPath, { access: "private", useCache: false, ...options });
    if (blob && blob.statusCode !== 304) json = await new Response(blob.stream).text();
  } else {
    try {
      json = await readFile(localDataPath("taxi-notifications.json"), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  // Existing installations have no notification document: all channels start disabled.
  if (json === undefined) return { settings: { ...defaultTaxiNotificationSettings }, disabledMembers: [], devices: [] };
  const value: unknown = JSON.parse(json);
  let migrated = false;
  if (
    value &&
    typeof value === "object" &&
    "settings" in value &&
    value.settings &&
    typeof value.settings === "object" &&
    !("telegramThreadId" in value.settings)
  ) {
    value.settings = { ...value.settings, telegramThreadId: "" };
    migrated = true;
  }
  const data = parseData(value);
  if (migrated) await writeData(data);
  return data;
}

async function writeData(data: NotificationData) {
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const options = getBlobAuthOptions();
  if (options) {
    await put(blobPath, json, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      ...options,
    });
    return;
  }
  const file = localDataPath("taxi-notifications.json");
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, json, "utf8");
  await rename(temporary, file);
}

let writeQueue: Promise<unknown> = Promise.resolve();
function updateData(change: (data: NotificationData) => void) {
  const task = async () => {
    const data = await readTaxiNotifications();
    change(data);
    await writeData(data);
  };
  const result = writeQueue.then(task, task);
  // Callers receive the original rejection; a failed write must not block later mutations.
  writeQueue = result.catch(() => undefined);
  return result;
}

export async function saveTaxiNotificationSettings(settings: TaxiNotificationSettings) {
  return updateData((data) => {
    // Copy only supported fields; never persist credentials supplied by clients.
    data.settings = {
      discordEnabled: settings.discordEnabled,
      telegramEnabled: settings.telegramEnabled,
      pushEnabled: settings.pushEnabled,
      repliesEnabled: settings.repliesEnabled,
      telegramChatId: settings.telegramChatId,
      telegramThreadId: settings.telegramThreadId,
    };
  });
}

export async function setTaxiPushPreference(memberId: string, enabled: boolean) {
  return updateData((data) => {
    data.disabledMembers = data.disabledMembers.filter((id) => id !== memberId);
    if (!enabled) data.disabledMembers.push(memberId);
  });
}

export async function saveTaxiPushDevice(memberId: string, subscription: PushSubscription) {
  return updateData((data) => {
    data.devices = data.devices.filter((device) => device.subscription.endpoint !== subscription.endpoint);
    if (data.devices.filter((device) => device.memberId === memberId).length >= 10)
      throw new Error("Too many push devices.");
    data.devices.push({
      memberId,
      subscription: { endpoint: subscription.endpoint, keys: { ...subscription.keys } },
    });
  });
}

export async function removeTaxiPushDevice(endpoint: string, memberId?: string) {
  return updateData((data) => {
    data.devices = data.devices.filter(
      (device) => device.subscription.endpoint !== endpoint || (memberId !== undefined && device.memberId !== memberId),
    );
  });
}
