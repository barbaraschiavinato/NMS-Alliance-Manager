export type TaxiNotificationSettings = {
  discordEnabled: boolean;
  telegramEnabled: boolean;
  pushEnabled: boolean;
  repliesEnabled: boolean;
  telegramChatId: string;
  telegramThreadId: string;
};

export type TaxiNotificationChannel = "discord" | "telegram" | "push";

export const defaultTaxiNotificationSettings: TaxiNotificationSettings = {
  discordEnabled: false,
  telegramEnabled: false,
  pushEnabled: false,
  repliesEnabled: true,
  telegramChatId: "",
  telegramThreadId: "",
};

export function isTelegramChatId(value: string) {
  return value === "" || /^-[1-9]\d{0,19}$/.test(value);
}

export function isTelegramThreadId(value: string) {
  return value === "" || (/^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647);
}

export function isTaxiNotificationSettings(value: unknown): value is TaxiNotificationSettings {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.discordEnabled === "boolean" &&
    typeof input.telegramEnabled === "boolean" &&
    typeof input.pushEnabled === "boolean" &&
    typeof input.repliesEnabled === "boolean" &&
    typeof input.telegramChatId === "string" &&
    isTelegramChatId(input.telegramChatId) &&
    typeof input.telegramThreadId === "string" &&
    isTelegramThreadId(input.telegramThreadId) &&
    (!input.telegramEnabled || input.telegramChatId !== "")
  );
}
