import { after } from "next/server";
import { readAccessData } from "@/lib/members/access-store";
import { readMemberNotificationSettings } from "@/lib/notifications/member-notifications-store";
import { appOrigin, escapeTelegramHtml, postJson, telegramUsername } from "@/lib/notifications/notification-transport";

function telegramToken() {
  const token = process.env.TELEGRAM_MEMBERS_BOT_TOKEN?.trim();
  if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error("Configure TELEGRAM_MEMBERS_BOT_TOKEN.");
  return token;
}

export function memberNotificationReadiness() {
  function ready(validate: () => unknown) {
    try {
      validate();
      return true;
    } catch {
      return false;
    }
  }
  return { telegram: ready(telegramToken), links: ready(appOrigin) };
}

function singleLine(value: string, fallback: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 100) || fallback;
}

async function sendTelegram(title: string, lines: string[]) {
  const settings = await readMemberNotificationSettings();
  if (!settings.telegramEnabled) throw new Error("This notification channel is disabled.");
  const url = new URL("/users", appOrigin()).href;
  await postJson(
    `https://api.telegram.org/bot${telegramToken()}/sendMessage`,
    {
      chat_id: settings.telegramChatId,
      ...(settings.telegramThreadId ? { message_thread_id: Number(settings.telegramThreadId) } : {}),
      text: `<b>${escapeTelegramHtml(title)}</b>\n${lines.map(escapeTelegramHtml).join("\n")}\n\n<a href="${escapeTelegramHtml(url)}">Apri la pagina Utenti</a>`,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    },
    "Telegram",
  );
}

export async function sendMemberNotificationTest() {
  await sendTelegram("Test utenti", ["Notifica di prova per registrazioni e approvazioni."]);
}

async function dispatch(memberId: string, build: (name: string) => { title: string; lines: string[] }) {
  try {
    if (!(await readMemberNotificationSettings()).telegramEnabled) return;
    const { members } = await readAccessData();
    const member = members.find((entry) => entry.publicId === memberId);
    if (!member) return;
    const { title, lines } = build(singleLine(member.nmsName || member.name, "Utente"));
    await sendTelegram(title, lines);
  } catch (error) {
    // The registration or approval is already saved; a failed alert must never surface to the caller.
    console.error("Member Telegram notification failed", error instanceof Error ? error.message : "Unknown error");
  }
}

export function notifyMemberRegistered(memberId: string) {
  return dispatch(memberId, (name) => ({
    title: "Nuova registrazione",
    lines: [`Utente: ${name}`, "In attesa di approvazione."],
  }));
}

export function notifyMemberApproved(memberId: string, approver: Readonly<{ name: string; telegramName?: string }>) {
  const username = telegramUsername(approver.telegramName);
  return dispatch(memberId, (name) => ({
    title: "Utente approvato",
    lines: [
      `Utente: ${name}`,
      `Approvato da: ${singleLine(approver.name, "un moderatore")}${username ? ` (@${username})` : ""}`,
    ],
  }));
}

// Schedules delivery after the response only when alerts are enabled, so ordinary requests never touch `after()`.
export async function scheduleMemberNotification(task: () => Promise<void>) {
  try {
    if (!(await readMemberNotificationSettings()).telegramEnabled) return;
    after(task);
  } catch (error) {
    console.error("Unable to schedule member notification", error instanceof Error ? error.message : "Unknown error");
  }
}
