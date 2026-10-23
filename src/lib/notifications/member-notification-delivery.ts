import { after } from "next/server";
import { readAccessData } from "@/lib/members/access-store";
import type { MemberRole, MembershipStatus } from "@/lib/members/member-types";
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
  await sendTelegram("Test utenti", ["Notifica di prova per gli avvisi sugli utenti."]);
}

type Alert = Readonly<{ title: string; lines: string[] }>;
type Actor = Readonly<{ name: string; telegramName?: string }>;

async function deliver(alert: () => Promise<Alert | undefined>) {
  try {
    if (!(await readMemberNotificationSettings()).telegramEnabled) return;
    const content = await alert();
    if (content) await sendTelegram(content.title, content.lines);
  } catch (error) {
    // The change is already saved; a failed alert must never surface to the caller.
    console.error("Member Telegram notification failed", error instanceof Error ? error.message : "Unknown error");
  }
}

// Resolves the member's current display name when the alert is sent.
function aboutMember(memberId: string, build: (name: string) => Alert) {
  return deliver(async () => {
    const { members } = await readAccessData();
    const member = members.find((entry) => entry.publicId === memberId);
    return member ? build(singleLine(member.nmsName || member.name, "Utente")) : undefined;
  });
}

function actorLine(label: string, actor: Actor) {
  const username = telegramUsername(actor.telegramName);
  return `${label}: ${singleLine(actor.name, "un moderatore")}${username ? ` (@${username})` : ""}`;
}

export function notifyMemberRegistered(memberId: string) {
  return aboutMember(memberId, (name) => ({
    title: "Nuova registrazione",
    lines: [`Utente: ${name}`, "In attesa di approvazione."],
  }));
}

const statusAlerts: Record<string, { title: string; actor: string } | undefined> = {
  "pending>approved": { title: "Utente approvato", actor: "Approvato da" },
  "blocked>approved": { title: "Utente sbloccato", actor: "Sbloccato da" },
  "pending>blocked": { title: "Utente bloccato", actor: "Bloccato da" },
  "approved>blocked": { title: "Utente bloccato", actor: "Bloccato da" },
  "approved>pending": { title: "Utente rimesso in attesa", actor: "Modificato da" },
  "blocked>pending": { title: "Utente rimesso in attesa", actor: "Modificato da" },
};

export function notifyMemberStatusChanged(
  memberId: string,
  previous: MembershipStatus,
  next: MembershipStatus,
  actor: Actor,
) {
  const alert = statusAlerts[`${previous}>${next}`];
  if (!alert) return Promise.resolve();
  return aboutMember(memberId, (name) => ({
    title: alert.title,
    lines: [`Utente: ${name}`, actorLine(alert.actor, actor)],
  }));
}

const roleLabels: Record<MemberRole, string> = { user: "Utente", moderator: "Moderatore", admin: "Amministratore" };

export function notifyMemberRoleChanged(memberId: string, previous: MemberRole, next: MemberRole, actor: Actor) {
  if (previous === next) return Promise.resolve();
  return aboutMember(memberId, (name) => ({
    title: "Ruolo modificato",
    lines: [
      `Utente: ${name}`,
      `Ruolo: ${roleLabels[previous]} → ${roleLabels[next]}`,
      actorLine("Modificato da", actor),
    ],
  }));
}

// The member no longer exists when the alert is sent, so the caller passes the name captured before deletion.
export function notifyMemberRemoved(name: string, actor: Actor) {
  return deliver(async () => ({
    title: "Utente rimosso",
    lines: [`Utente: ${singleLine(name, "Utente")}`, actorLine("Rimosso da", actor)],
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
