import { get, put } from "@vercel/blob";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getBlobAuthOptions } from "@/lib/storage/blob-config";
import { localDataPath } from "@/lib/storage/local-data-path";
import {
  defaultMemberNotificationSettings,
  isMemberNotificationSettings,
  type MemberNotificationSettings,
} from "@/lib/notifications/member-notifications";

const blobPath = "alliance-manager/member-notifications.json";

export async function readMemberNotificationSettings(): Promise<MemberNotificationSettings> {
  const options = getBlobAuthOptions();
  let json: string | undefined;
  if (options) {
    const blob = await get(blobPath, { access: "private", useCache: false, ...options });
    if (blob && blob.statusCode !== 304) json = await new Response(blob.stream).text();
  } else {
    try {
      json = await readFile(localDataPath("member-notifications.json"), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  // Existing installations have no document: alerts start disabled.
  if (json === undefined) return { ...defaultMemberNotificationSettings };
  const value: unknown = JSON.parse(json);
  const stored = value && typeof value === "object" ? (value as Record<string, unknown>).settings : undefined;
  // Documents written before the approval email existed have no flag: it starts disabled.
  const settings =
    stored && typeof stored === "object" && !("approvalEmailEnabled" in stored)
      ? { ...stored, approvalEmailEnabled: false }
      : stored;
  if (!isMemberNotificationSettings(settings)) throw new Error("Invalid member notification storage.");
  return settings;
}

export async function saveMemberNotificationSettings(settings: MemberNotificationSettings) {
  // Copy only supported fields; never persist credentials supplied by clients.
  const json = `${JSON.stringify(
    {
      settings: {
        telegramEnabled: settings.telegramEnabled,
        telegramChatId: settings.telegramChatId,
        telegramThreadId: settings.telegramThreadId,
        approvalEmailEnabled: settings.approvalEmailEnabled,
      },
    },
    null,
    2,
  )}\n`;
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
  const file = localDataPath("member-notifications.json");
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, json, "utf8");
  await rename(temporary, file);
}
