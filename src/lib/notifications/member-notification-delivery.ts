import { after } from "next/server";
import { readAccessData } from "@/lib/members/access-store";
import type { MemberRole, MembershipStatus } from "@/lib/members/member-types";
import { readMemberNotificationSettings } from "@/lib/notifications/member-notifications-store";
import {
  appOrigin,
  escapeHtml,
  escapeTelegramHtml,
  postJson,
  telegramUsername,
} from "@/lib/notifications/notification-transport";

function telegramToken() {
  const token = process.env.TELEGRAM_MEMBERS_BOT_TOKEN?.trim();
  if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error("Configure TELEGRAM_MEMBERS_BOT_TOKEN.");
  return token;
}

function resendApiKey() {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || !/^re_[A-Za-z0-9_-]+$/.test(key)) throw new Error("Configure RESEND_API_KEY.");
  return key;
}

// "name@domain" or "Display Name <name@domain>"; the domain must be verified in Resend.
function resendSender() {
  const sender = process.env.RESEND_FROM_EMAIL?.trim();
  const address = '[^\\s<>@"]+@[^\\s<>@"]+\\.[^\\s<>@"]+';
  if (!sender || !new RegExp(`^(?:${address}|[^<>\\r\\n"]{1,80} <${address}>)$`).test(sender))
    throw new Error("Configure RESEND_FROM_EMAIL.");
  return sender;
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
  return {
    telegram: ready(telegramToken),
    email: ready(() => [resendApiKey(), resendSender()]),
    links: ready(appOrigin),
  };
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

type Email = Readonly<{ to: string; subject: string; text: string; html: string }>;

async function sendEmail({ to, subject, text, html }: Email) {
  await postJson("https://api.resend.com/emails", { from: resendSender(), to: [to], subject, text, html }, "Resend", {
    Authorization: `Bearer ${resendApiKey()}`,
  });
}

// Offline players keep a placeholder address (`@offline.invalid`) and cannot receive email.
function canReceiveEmail(member: Readonly<{ email: string; offline?: boolean }>) {
  return !member.offline && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email) && !member.email.endsWith(".invalid");
}

function approvalEmail(to: string, name: string, allianceName: string): Email {
  const url = appOrigin();
  const subject = `Accesso approvato · Access approved — ${allianceName}`;
  const text = `Ciao ${name},
il tuo account su ${allianceName} è stato approvato: ora puoi accedere e usare le funzioni dell'alleanza.
Accedi: ${url}

Hi ${name},
your account on ${allianceName} has been approved: you can now sign in and use the alliance features.
Sign in: ${url}
`;
  const safeName = escapeHtml(name);
  const safeAlliance = escapeHtml(allianceName);
  const html = `<p>Ciao ${safeName},<br>il tuo account su <b>${safeAlliance}</b> è stato approvato: ora puoi accedere e usare le funzioni dell'alleanza.<br><a href="${escapeHtml(url)}">Accedi</a></p>
<p>Hi ${safeName},<br>your account on <b>${safeAlliance}</b> has been approved: you can now sign in and use the alliance features.<br><a href="${escapeHtml(url)}">Sign in</a></p>`;
  return { to, subject, text, html };
}

export async function sendMemberEmailTest(to: string) {
  if (!(await readMemberNotificationSettings()).approvalEmailEnabled)
    throw new Error("This notification channel is disabled.");
  const { alliance } = await readAccessData();
  await sendEmail(approvalEmail(to, "test", singleLine(alliance.name, "NMS Alliance Manager")));
}

// The member is told once, when their account goes from pending to approved; no other change sends email.
export async function notifyMemberApprovedByEmail(memberId: string) {
  try {
    if (!(await readMemberNotificationSettings()).approvalEmailEnabled) return;
    const { members, alliance } = await readAccessData();
    const member = members.find((entry) => entry.publicId === memberId);
    if (!member || !canReceiveEmail(member)) return;
    await sendEmail(
      approvalEmail(
        member.email,
        singleLine(member.nmsName || member.name, "Utente"),
        singleLine(alliance.name, "NMS Alliance Manager"),
      ),
    );
  } catch (error) {
    // The approval is already saved; a failed email must never surface to the caller.
    console.error("Approval email failed", error instanceof Error ? error.message : "Unknown error");
  }
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

// Schedules delivery after the response only when the channel is enabled, so ordinary requests never touch `after()`.
export async function scheduleMemberNotification(
  task: () => Promise<void>,
  channel: "telegram" | "email" = "telegram",
) {
  try {
    const settings = await readMemberNotificationSettings();
    if (!(channel === "email" ? settings.approvalEmailEnabled : settings.telegramEnabled)) return;
    after(task);
  } catch (error) {
    console.error("Unable to schedule member notification", error instanceof Error ? error.message : "Unknown error");
  }
}
