import { readJsonDocument, writeJsonDocument } from "@/lib/storage/json-document";
import {
  defaultMemberNotificationSettings,
  isMemberNotificationSettings,
  type MemberNotificationSettings,
} from "@/lib/notifications/member-notifications";

export async function readMemberNotificationSettings(): Promise<MemberNotificationSettings> {
  const value = await readJsonDocument("member-notifications");
  // Existing installations have no document: alerts start disabled.
  if (value === undefined) return { ...defaultMemberNotificationSettings };
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
  await writeJsonDocument("member-notifications", {
    settings: {
      telegramEnabled: settings.telegramEnabled,
      telegramChatId: settings.telegramChatId,
      telegramThreadId: settings.telegramThreadId,
      approvalEmailEnabled: settings.approvalEmailEnabled,
    },
  });
}
