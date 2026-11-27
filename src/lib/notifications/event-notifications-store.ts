import { readJsonDocument, writeJsonDocument } from "@/lib/storage/json-document";
import {
  defaultEventNotificationSettings,
  isEventNotificationSettings,
  type EventNotificationSettings,
} from "@/lib/notifications/event-notifications";

export async function readEventNotificationSettings(): Promise<EventNotificationSettings> {
  const value = await readJsonDocument("event-notifications");
  // Existing installations have no document: alerts start disabled.
  if (value === undefined) return { ...defaultEventNotificationSettings };
  const stored = value && typeof value === "object" ? (value as Record<string, unknown>).settings : undefined;
  if (!isEventNotificationSettings(stored)) throw new Error("Invalid event notification storage.");
  return stored;
}

export async function saveEventNotificationSettings(settings: EventNotificationSettings) {
  // Copy only supported fields; never persist credentials supplied by clients.
  await writeJsonDocument("event-notifications", {
    settings: {
      telegramEnabled: settings.telegramEnabled,
      telegramChatId: settings.telegramChatId,
      telegramThreadId: settings.telegramThreadId,
    },
  });
}
