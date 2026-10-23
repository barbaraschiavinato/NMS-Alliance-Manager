import webpush from "web-push";
import { readAccessData } from "@/lib/access-store";
import { readHelpRequests } from "@/lib/private-messages-store";
import { readTaxiNotifications, removeTaxiPushDevice } from "@/lib/taxi-notifications-store";
import type { TaxiNotificationChannel } from "@/lib/taxi-notifications";
import { stationDetailHref, taxiDetailHref } from "@/lib/detail-links";
import { readAllStationPortals } from "@/lib/stations-store";
import { portalSearchMatches } from "@/lib/missions";
import { formatNmsFriendCode, isValidNmsFriendCode } from "@/lib/member-types";
import { galaxyLabel } from "@/lib/galaxies";
import { translate } from "@/lib/translations";
import { appOrigin, escapeTelegramHtml, postJson } from "@/lib/notification-transport";

function vapidDetails() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject)
    throw new Error("Configure VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT.");
  if (!/^(mailto:|https:\/\/)/.test(subject)) throw new Error("Invalid VAPID contact.");
  // Validate configuration without mutating the library's global defaults.
  webpush.generateRequestDetails(
    {
      endpoint: "https://fcm.googleapis.com/fcm/send/configuration-check",
      keys: { p256dh: publicKey, auth: Buffer.alloc(16).toString("base64url") },
    },
    undefined,
    { vapidDetails: { publicKey, privateKey, subject } },
  );
  return { publicKey, privateKey, subject };
}

function discordUrl() {
  let url: URL;
  try {
    url = new URL(process.env.DISCORD_TAXI_WEBHOOK_URL ?? "");
  } catch {
    throw new Error("Configure DISCORD_TAXI_WEBHOOK_URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "discord.com" ||
    url.port ||
    url.username ||
    url.password ||
    !/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname)
  )
    throw new Error("Invalid Discord taxi webhook.");
  url.search = "";
  url.hash = "";
  url.searchParams.set("wait", "true");
  return url;
}

function telegramToken() {
  const token = process.env.TELEGRAM_TAXI_BOT_TOKEN?.trim();
  if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error("Configure TELEGRAM_TAXI_BOT_TOKEN.");
  return token;
}

export function taxiNotificationReadiness() {
  function ready(validate: () => unknown) {
    try {
      validate();
      return true;
    } catch {
      return false;
    }
  }
  return {
    discord: ready(discordUrl),
    telegram: ready(telegramToken),
    push: ready(vapidDetails),
    links: ready(appOrigin),
  };
}

export function taxiPushPublicKey() {
  return vapidDetails().publicKey;
}

type Alert = { title: string; body: string; path: string; tag: string };
type ContactDetails = { body: string; telegram?: string; discord?: string };

function discordContact(value?: string) {
  return value?.replace(/\s+/g, " ").trim().slice(0, 40);
}

function telegramUsername(value?: string) {
  const username = value?.trim().replace(/^@/, "");
  return username && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ? username : undefined;
}

async function sendChannel(
  channel: TaxiNotificationChannel,
  alert: Alert,
  excludeMemberId?: string,
  onlyMemberId?: string,
  sharedBody?: string,
  meetingPath?: string,
  requester?: ContactDetails,
  responder?: ContactDetails,
) {
  const data = await readTaxiNotifications();
  if (!data.settings[`${channel}Enabled`]) throw new Error("This notification channel is disabled.");
  const url = new URL(alert.path, appOrigin()).href;
  const meetingUrl = meetingPath ? new URL(meetingPath, appOrigin()).href : undefined;
  if (channel === "discord") {
    await postJson(
      discordUrl(),
      {
        content: `${alert.title}${responder ? `\n${responder.body}${responder.discord ? `\nDiscord di chi risponde: ${responder.discord}` : ""}\n` : ""}${requester ? `\n${requester.body}${requester.discord ? `\nDiscord del richiedente: ${requester.discord}` : ""}\n` : ""}\n${sharedBody ?? alert.body}${meetingUrl ? `\n[Scheda stazione del ritrovo](${meetingUrl})` : ""}\n\nApri la richiesta per i dettagli e rispondere.\n${url}`,
        allowed_mentions: { parse: [] },
      },
      "Discord",
    );
  } else if (channel === "telegram") {
    await postJson(
      `https://api.telegram.org/bot${telegramToken()}/sendMessage`,
      {
        chat_id: data.settings.telegramChatId,
        ...(data.settings.telegramThreadId ? { message_thread_id: Number(data.settings.telegramThreadId) } : {}),
        text: `<b>${escapeTelegramHtml(alert.title)}</b>${responder ? `\n${escapeTelegramHtml(responder.body)}${responder.telegram ? `\nTelegram di chi risponde: @${responder.telegram}` : ""}\n` : ""}${requester ? `\n${escapeTelegramHtml(requester.body)}${requester.telegram ? `\nTelegram del richiedente: @${requester.telegram}` : ""}\n` : ""}\n${escapeTelegramHtml(sharedBody ?? alert.body)}${meetingUrl ? `\n<a href="${escapeTelegramHtml(meetingUrl)}">Scheda stazione del ritrovo</a>` : ""}\n\nApri la richiesta per i dettagli e rispondere.\n<a href="${escapeTelegramHtml(url)}">Vai al dettaglio Taxi</a>`,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      },
      "Telegram",
    );
  } else {
    const vapid = vapidDetails();
    const { members } = await readAccessData();
    const eligible = new Set(
      members
        .filter(
          (member) =>
            member.membershipStatus === "approved" &&
            !member.offline &&
            member.publicId !== excludeMemberId &&
            (!onlyMemberId || member.publicId === onlyMemberId) &&
            !data.disabledMembers.includes(member.publicId),
        )
        .map((member) => member.publicId),
    );
    const devices = data.devices.filter((device) => eligible.has(device.memberId));
    if (onlyMemberId && !devices.length) throw new Error("No enabled push devices for this member.");
    let failures = 0;
    let delivered = 0;
    const expired: typeof devices = [];
    // Bounded batches avoid opening unbounded connections on a serverless function.
    for (let index = 0; index < devices.length; index += 5) {
      await Promise.all(
        devices.slice(index, index + 5).map(async (device) => {
          try {
            await webpush.sendNotification(device.subscription, JSON.stringify(alert), {
              vapidDetails: vapid,
              TTL: 3600,
              timeout: 10000,
            });
            delivered++;
          } catch (error) {
            const status = error && typeof error === "object" && "statusCode" in error ? error.statusCode : undefined;
            if (status === 404 || status === 410) {
              expired.push(device);
            } else {
              failures++;
              console.error("Taxi push delivery failed", { status: typeof status === "number" ? status : "network" });
            }
          }
        }),
      );
    }
    for (const device of expired) await removeTaxiPushDevice(device.subscription.endpoint, device.memberId);
    if (failures) throw new Error("Some push notifications could not be delivered.");
    if (onlyMemberId && !delivered) throw new Error("Your push subscriptions expired. Reconnect this browser.");
  }
}

export async function sendTaxiTest(channel: TaxiNotificationChannel, memberId: string) {
  await sendChannel(
    channel,
    {
      title: "Test Taxi",
      body: "Notifica di prova del servizio taxi.",
      path: "/taxi",
      tag: "taxi-test",
    },
    undefined,
    memberId,
  );
}

export async function notifyTaxi(requestId: string, authorId: string, reply: boolean) {
  try {
    const data = await readTaxiNotifications();
    if (reply && !data.settings.repliesEnabled) return;
    const request = (await readHelpRequests("taxi")).find((entry) => entry.id === requestId && !entry.replyToId);
    if (!request || request.archived) return;
    const alert: Alert = {
      title: reply ? "Risposta taxi" : "Nuova richiesta taxi",
      body: `Destinazione: ${request.subject ?? "Taxi"}. Apri la richiesta per i dettagli e rispondere.`,
      path: taxiDetailHref(requestId),
      tag: `taxi-${requestId}`,
    };
    let sharedBody = `Destinazione: ${request.subject ?? "Taxi"}.`;
    let meetingPath: string | undefined;
    let requesterDetails: ContactDetails | undefined;
    let responder: ContactDetails | undefined;
    if (data.settings.discordEnabled || data.settings.telegramEnabled) {
      const station = request.meetingStation;
      if (station) {
        const linkedStation = (await readAllStationPortals()).find(
          (entry) => entry.galaxy === station.galaxy && portalSearchMatches(entry.portal, station.portal),
        );
        if (linkedStation) meetingPath = stationDetailHref(linkedStation, "taxi");
      }
      const meeting = station
        ? [
            request.meetingPoint === "hub"
              ? translate("it", "taxi.alliance_hub")
              : station.name?.replace(/\s+/g, " ").trim().slice(0, 100),
            station.portal,
            galaxyLabel(station.galaxy),
          ]
            .filter(Boolean)
            .join(" · ")
        : translate("it", request.meetingPoint === "offline" ? "taxi.offline" : "taxi.no_meeting_station");
      sharedBody += `\nRitrovo: ${meeting}`;
      const { members } = await readAccessData();
      const requester = members.find((member) => member.publicId === request.senderMemberId);
      if (requester) {
        requesterDetails = {
          body: `Richiedente: ${requester.nmsName.replace(/\s+/g, " ").trim() || translate("it", "Former member")}`,
          telegram: telegramUsername(requester.telegramName),
          discord: discordContact(requester.discordName),
        };
        if (isValidNmsFriendCode(requester.nmsCode)) {
          requesterDetails.body += `\nCodice amico del richiedente: ${formatNmsFriendCode(requester.nmsCode)}`;
        }
      }
      if (reply) {
        const member = members.find((entry) => entry.publicId === authorId);
        if (member) {
          responder = {
            body: `Risponde: ${member.nmsName.replace(/\s+/g, " ").trim() || translate("it", "Former member")}`,
            telegram: telegramUsername(member.telegramName),
            discord: discordContact(member.discordName),
          };
          if (isValidNmsFriendCode(member.nmsCode)) {
            responder.body += `\nCodice amico di chi risponde: ${formatNmsFriendCode(member.nmsCode)}`;
          }
        }
      }
    }
    await Promise.all(
      (["discord", "telegram", "push"] as const).map(async (channel) => {
        if (!data.settings[`${channel}Enabled`]) return;
        try {
          await sendChannel(channel, alert, authorId, undefined, sharedBody, meetingPath, requesterDetails, responder);
        } catch (error) {
          console.error(
            `Taxi ${channel} notification failed`,
            error instanceof Error ? error.message : "Unknown error",
          );
        }
      }),
    );
  } catch (error) {
    console.error("Unable to dispatch taxi notifications", error instanceof Error ? error.message : "Unknown error");
  }
}
