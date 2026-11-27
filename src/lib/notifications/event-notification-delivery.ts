import { after } from "next/server";
import { readEvents } from "@/lib/events/events-store";
import type { AllianceEvent, EventType } from "@/lib/events/events";
import { readAccessData } from "@/lib/members/access-store";
import { eventDetailHref } from "@/lib/navigation/detail-links";
import { readEventNotificationSettings } from "@/lib/notifications/event-notifications-store";
import { appOrigin, escapeTelegramHtml, postJson } from "@/lib/notifications/notification-transport";

function telegramToken() {
  const token = process.env.TELEGRAM_EVENTS_BOT_TOKEN?.trim();
  if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error("Configure TELEGRAM_EVENTS_BOT_TOKEN.");
  return token;
}

export function eventNotificationReadiness() {
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

async function sendTelegram(title: string, lines: string[], path: string, linkLabel: string) {
  const settings = await readEventNotificationSettings();
  if (!settings.telegramEnabled) throw new Error("This notification channel is disabled.");
  const url = new URL(path, appOrigin()).href;
  await postJson(
    `https://api.telegram.org/bot${telegramToken()}/sendMessage`,
    {
      chat_id: settings.telegramChatId,
      ...(settings.telegramThreadId ? { message_thread_id: Number(settings.telegramThreadId) } : {}),
      text: `<b>${escapeTelegramHtml(title)}</b>\n${lines.map(escapeTelegramHtml).join("\n")}\n\n<a href="${escapeTelegramHtml(url)}">${escapeTelegramHtml(linkLabel)}</a>`,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    },
    "Telegram",
  );
}

export async function sendEventNotificationTest() {
  await sendTelegram("Test eventi", ["Notifica di prova per gli eventi."], "/events", "Apri gli eventi");
}

const typeLabels: Record<EventType, string> = { market: "Mercatino", gathering: "Raduno", other: "Altro" };

function singleLine(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 100);
}

// A shared chat has no viewer time zone: the alliance alerts are Italian, so the time is the Italian one.
function italianTime(iso: string) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  }).format(new Date(iso));
}

function placeLabel({ location }: AllianceEvent) {
  if (location.kind === "hub") return "Hub alleanza";
  return singleLine(location.name ?? "") || location.portal;
}

export async function notifyEventCreated(eventId: string) {
  try {
    if (!(await readEventNotificationSettings()).telegramEnabled) return;
    const event = (await readEvents()).find((entry) => entry.id === eventId);
    if (!event) return;
    const creator = (await readAccessData()).members.find((member) => member.publicId === event.creatorId);
    // The description and the messages stay in the site.
    await sendTelegram(
      "Nuovo evento",
      [
        `${typeLabels[event.type]}: ${singleLine(event.title)}`,
        `Quando: ${italianTime(event.startsAt)} (ora italiana)`,
        `Dove: ${placeLabel(event)}`,
        `Organizza: ${singleLine(creator?.nmsName || creator?.name || "") || "un membro"}`,
      ],
      eventDetailHref(event.id),
      "Vai all'evento",
    );
  } catch (error) {
    // The event is already saved; a failed alert must never surface to the caller.
    console.error("Event Telegram notification failed", error instanceof Error ? error.message : "Unknown error");
  }
}

// Schedules delivery after the response only when the channel is enabled, so ordinary requests never touch `after()`.
export async function scheduleEventNotification(eventId: string) {
  try {
    if (!(await readEventNotificationSettings()).telegramEnabled) return;
    after(() => notifyEventCreated(eventId));
  } catch (error) {
    console.error("Unable to schedule event notification", error instanceof Error ? error.message : "Unknown error");
  }
}
