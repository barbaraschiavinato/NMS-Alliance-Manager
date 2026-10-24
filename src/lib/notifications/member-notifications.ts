import { isTelegramChatId, isTelegramThreadId } from "@/lib/notifications/taxi-notifications";

export type MemberNotificationSettings = {
  telegramEnabled: boolean;
  telegramChatId: string;
  telegramThreadId: string;
  approvalEmailEnabled: boolean;
};

export const defaultMemberNotificationSettings: MemberNotificationSettings = {
  telegramEnabled: false,
  telegramChatId: "",
  telegramThreadId: "",
  approvalEmailEnabled: false,
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
    typeof input.approvalEmailEnabled === "boolean" &&
    (!input.telegramEnabled || input.telegramChatId !== "")
  );
}
