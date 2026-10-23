import { isTelegramChatId, isTelegramThreadId } from "@/lib/notifications/taxi-notifications";

export type MemberNotificationSettings = {
  telegramEnabled: boolean;
  telegramChatId: string;
  telegramThreadId: string;
};

export const defaultMemberNotificationSettings: MemberNotificationSettings = {
  telegramEnabled: false,
  telegramChatId: "",
  telegramThreadId: "",
};

export function isMemberNotificationSettings(value: unknown): value is MemberNotificationSettings {
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
