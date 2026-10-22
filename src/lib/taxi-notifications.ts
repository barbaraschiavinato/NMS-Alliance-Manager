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

export function isTaxiNotificationSettings(value: unknown): value is TaxiNotificationSettings {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.discordEnabled === "boolean" &&
    typeof input.telegramEnabled === "boolean" &&
    typeof input.pushEnabled === "boolean" &&
    typeof input.repliesEnabled === "boolean" &&
    typeof input.telegramChatId === "string" &&
    (input.telegramChatId === "" || /^-[1-9]\d{0,19}$/.test(input.telegramChatId)) &&
    typeof input.telegramThreadId === "string" &&
    (input.telegramThreadId === "" ||
      (/^[1-9]\d{0,9}$/.test(input.telegramThreadId) && Number(input.telegramThreadId) <= 2147483647)) &&
    (!input.telegramEnabled || input.telegramChatId !== "")
  );
}
