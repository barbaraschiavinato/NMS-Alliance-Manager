import { isTelegramChatId, isTelegramThreadId } from "@/lib/notifications/taxi-notifications";

export type EventNotificationSettings = {
  telegramEnabled: boolean;
  telegramChatId: string;
  telegramThreadId: string;
};

export const defaultEventNotificationSettings: EventNotificationSettings = {
  telegramEnabled: false,
  telegramChatId: "",
  telegramThreadId: "",
};

export function isEventNotificationSettings(value: unknown): value is EventNotificationSettings {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.telegramEnabled === "boolean" &&
    typeof input.telegramChatId === "string" &&
    isTelegramChatId(input.telegramChatId) &&
    typeof input.telegramThreadId === "string" &&
    isTelegramThreadId(input.telegramThreadId) &&
    (!input.telegramEnabled || input.telegramChatId !== "")
  );
}
