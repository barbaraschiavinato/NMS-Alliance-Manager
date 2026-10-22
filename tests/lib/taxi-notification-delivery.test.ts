import { beforeEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { makeMember, seedMembers, writeDataFile } from "../helpers/members";
import {
  notifyTaxi,
  sendTaxiTest,
  taxiNotificationReadiness,
  taxiPushPublicKey,
} from "@/lib/taxi-notification-delivery";
import {
  readTaxiNotifications,
  saveTaxiNotificationSettings,
  saveTaxiPushDevice,
  setTaxiPushPreference,
} from "@/lib/taxi-notifications-store";
import { defaultTaxiNotificationSettings } from "@/lib/taxi-notifications";
import * as notificationStore from "@/lib/taxi-notifications-store";
import { formatNmsFriendCode } from "@/lib/member-types";
import { galaxyLabel } from "@/lib/galaxies";
import { stationDetailHref } from "@/lib/detail-links";

const author = makeMember();
const recipient = makeMember();
const keys = webpush.generateVAPIDKeys();
const subscription = (id: string) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
  keys: { p256dh: keys.publicKey, auth: Buffer.alloc(16).toString("base64url") },
});

beforeEach(() => {
  seedMembers([author, recipient]);
  writeDataFile("stations-v2.json", []);
  writeDataFile("taxi-notifications.json", {
    settings: defaultTaxiNotificationSettings,
    disabledMembers: [],
    devices: [],
  });
  writeDataFile("private-messages.json", [
    {
      id: "ride",
      senderMemberId: author.publicId,
      subjectType: "taxi",
      subject: "Euclid",
      galaxy: 0,
      body: "Do not expose my private details",
      createdAt: new Date().toISOString(),
    },
  ]);
  vi.stubEnv("AUTH_URL", "http://localhost:3000/api/auth");
  vi.stubEnv("DISCORD_TAXI_WEBHOOK_URL", "https://discord.com/api/webhooks/123/secret");
  vi.stubEnv("TELEGRAM_TAXI_BOT_TOKEN", "123:secret");
  vi.stubEnv("VAPID_PUBLIC_KEY", keys.publicKey);
  vi.stubEnv("VAPID_PRIVATE_KEY", keys.privateKey);
  vi.stubEnv("VAPID_SUBJECT", "mailto:admin@example.com");
});

describe("taxi alert delivery", () => {
  it.each(["missing", "incomplete"] as const)(
    "keeps reply alerts deliverable with %s responder details",
    async (kind) => {
      seedMembers([
        { ...author, nmsName: "" },
        ...(kind === "missing" ? [] : [{ ...recipient, nmsName: "", nmsCode: "", discordName: "   " }]),
      ]);
      await saveTaxiNotificationSettings({
        ...defaultTaxiNotificationSettings,
        discordEnabled: true,
        telegramEnabled: true,
        telegramChatId: "-123",
      });
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(async () => new Response(JSON.stringify({ ok: true })));
      vi.stubGlobal("fetch", fetch);
      await notifyTaxi("ride", recipient.publicId, true);
      expect(fetch).toHaveBeenCalledTimes(2);
      for (const [, options] of fetch.mock.calls) {
        expect(String(options?.body)).not.toContain("Codice amico di chi risponde:");
        expect(String(options?.body)).not.toContain("Discord di chi risponde:");
      }
    },
  );
  it.each([false, true])(
    "shows Discord contacts after friend codes without pings or leaking them to other providers (reply=%s)",
    async (reply) => {
      seedMembers([
        { ...author, discordName: " @requester.discord " },
        { ...recipient, discordName: "responder#1234" },
      ]);
      await saveTaxiNotificationSettings({
        ...defaultTaxiNotificationSettings,
        discordEnabled: true,
        telegramEnabled: true,
        pushEnabled: true,
        telegramChatId: "-123",
      });
      await saveTaxiPushDevice(recipient.publicId, subscription("recipient"));
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(async () => new Response(JSON.stringify({ ok: true })));
      vi.stubGlobal("fetch", fetch);
      const push = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
      await notifyTaxi("ride", author.publicId, false);
      fetch.mockClear();
      await notifyTaxi("ride", reply ? recipient.publicId : author.publicId, reply);
      const bodies = fetch.mock.calls.map(([, options]) => JSON.parse(String(options?.body)));
      const discord = bodies.find((body) => body.content);
      expect(discord.content).toContain(
        `Codice amico del richiedente: ${formatNmsFriendCode(author.nmsCode)}\nDiscord del richiedente: @requester.discord`,
      );
      if (reply)
        expect(discord.content).toContain(
          `Codice amico di chi risponde: ${formatNmsFriendCode(recipient.nmsCode)}\nDiscord di chi risponde: responder#1234`,
        );
      else expect(discord.content).not.toContain("responder#1234");
      expect(discord.allowed_mentions).toEqual({ parse: [] });
      expect(bodies.find((body) => body.text).text).not.toContain("requester.discord");
      expect(bodies.find((body) => body.text).text).not.toContain("responder#1234");
      for (const [, payload] of push.mock.calls) expect(String(payload)).not.toContain("requester.discord");
    },
  );
  it("escapes responder details and keeps them above the original request without exposing them to push", async () => {
    seedMembers([author, { ...recipient, nmsName: 'Pilot <Alpha> & "Beta"', telegramName: "@Pilot_123" }]);
    await saveTaxiNotificationSettings({
      ...defaultTaxiNotificationSettings,
      discordEnabled: true,
      telegramEnabled: true,
      pushEnabled: true,
      telegramChatId: "-123",
    });
    await saveTaxiPushDevice(author.publicId, subscription("requester"));
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetch);
    const push = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    await notifyTaxi("ride", recipient.publicId, true);
    const bodies = fetch.mock.calls.map(([, options]) => JSON.parse(String(options?.body)));
    const telegram = bodies.find((body) => body.text).text;
    expect(telegram).toContain("Risponde: Pilot &lt;Alpha&gt; &amp; &quot;Beta&quot;");
    expect(telegram.indexOf("Codice amico di chi risponde:")).toBeLessThan(telegram.indexOf("Destinazione:"));
    expect(telegram).toContain(`Codice amico del richiedente: ${formatNmsFriendCode(author.nmsCode)}`);
    const payload = String(push.mock.calls[0][1]);
    expect(payload).not.toContain("Pilot");
    expect(payload).not.toContain(formatNmsFriendCode(recipient.nmsCode));
  });
  it.each(["Traveller_123", " @Traveller_123 "])(
    "mentions the original requester only on Telegram using %s",
    async (telegramName) => {
      seedMembers([
        { ...author, telegramName },
        { ...recipient, telegramName: "Responder_123" },
      ]);
      await saveTaxiNotificationSettings({
        ...defaultTaxiNotificationSettings,
        discordEnabled: true,
        telegramEnabled: true,
        pushEnabled: true,
        telegramChatId: "-123",
      });
      await saveTaxiPushDevice(author.publicId, subscription("requester"));
      await saveTaxiPushDevice(recipient.publicId, subscription("responder"));
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(async () => new Response(JSON.stringify({ ok: true })));
      vi.stubGlobal("fetch", fetch);
      const push = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
      for (const reply of [false, true]) {
        fetch.mockClear();
        await notifyTaxi("ride", reply ? recipient.publicId : author.publicId, reply);
        const bodies = fetch.mock.calls.map(([, options]) => JSON.parse(String(options?.body)));
        expect(bodies.find((body) => body.text).text).toContain(
          `Richiedente: ${author.nmsName}\nCodice amico del richiedente: ${formatNmsFriendCode(author.nmsCode)}\nTelegram del richiedente: @Traveller_123\n\nDestinazione:`,
        );
        if (reply) {
          expect(bodies.find((body) => body.text).text).toContain("Telegram di chi risponde: @Responder_123");
          expect(bodies.find((body) => body.text).text.indexOf("Risponde:")).toBeLessThan(
            bodies.find((body) => body.text).text.indexOf("Richiedente:"),
          );
          expect(bodies.find((body) => body.content).content).toContain(`Risponde: ${recipient.nmsName}`);
        } else {
          expect(bodies.find((body) => body.text).text).not.toContain("Responder_123");
        }
        expect(bodies.find((body) => body.content).content).not.toContain("Responder_123");
        expect(bodies.find((body) => body.content).content).not.toContain("@Traveller_123");
      }
      for (const [, payload] of push.mock.calls) expect(String(payload)).not.toContain("Traveller_123");
    },
  );
  it.each([
    undefined,
    "",
    "abc",
    "Nome Cognome",
    "<b>Traveller</b>",
    "@@Traveller",
    "https://t.me/Traveller",
    "a".repeat(33),
  ])("omits invalid or missing Telegram usernames: %s", async (telegramName) => {
    seedMembers([{ ...author, telegramName }, recipient]);
    await saveTaxiNotificationSettings({
      ...defaultTaxiNotificationSettings,
      telegramEnabled: true,
      telegramChatId: "-123",
    });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetch);
    await notifyTaxi("ride", author.publicId, false);
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(fetch.mock.calls[0][1].body).text).not.toContain("Telegram del richiedente:");
  });
  it.each(["hub", "station"] as const)(
    "links the %s meeting to its existing system station on shared channels only",
    async (meetingPoint) => {
      const station = { ownerId: author.publicId, portal: "1123456789AB", galaxy: 9, name: "Meeting station" };
      writeDataFile("stations-v2.json", [station]);
      writeDataFile("private-messages.json", [
        {
          id: "ride",
          senderMemberId: author.publicId,
          subjectType: "taxi",
          subject: "Euclid",
          body: "Ride",
          galaxy: 0,
          meetingPoint,
          meetingStation: { portal: "0123456789AB", galaxy: 9 },
          createdAt: new Date().toISOString(),
        },
      ]);
      await saveTaxiNotificationSettings({
        ...defaultTaxiNotificationSettings,
        discordEnabled: true,
        telegramEnabled: true,
        pushEnabled: true,
        telegramChatId: "-123",
      });
      await saveTaxiPushDevice(recipient.publicId, subscription("recipient"));
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(async () => new Response(JSON.stringify({ ok: true })));
      vi.stubGlobal("fetch", fetch);
      const push = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
      const url = `http://localhost:3000${stationDetailHref(station, "taxi")}`;
      for (const reply of [false, true]) {
        fetch.mockClear();
        await notifyTaxi("ride", author.publicId, reply);
        const bodies = fetch.mock.calls.map(([, options]) => JSON.parse(String(options?.body)));
        expect(bodies.find((body) => body.content).content).toContain(`[Scheda stazione del ritrovo](${url})`);
        expect(bodies.find((body) => body.text).text).toContain(`<a href="${url}">Scheda stazione del ritrovo</a>`);
      }
      for (const [, payload] of push.mock.calls) expect(String(payload)).not.toContain("/stations/");
      writeDataFile("stations-v2.json", [{ ...station, galaxy: 0 }]);
      fetch.mockClear();
      await notifyTaxi("ride", author.publicId, false);
      for (const [, options] of fetch.mock.calls)
        expect(String(options?.body)).not.toContain("Scheda stazione del ritrovo");
    },
  );
  it("places the detail invitation immediately before links and escapes Telegram HTML", async () => {
    writeDataFile("private-messages.json", [
      {
        id: "ride",
        senderMemberId: author.publicId,
        subjectType: "taxi",
        subject: "Euclid",
        body: "Ride",
        galaxy: 0,
        meetingPoint: "station",
        meetingStation: { portal: "0123456789AB", galaxy: 0, name: 'Base <Alpha> & "Beta"' },
        createdAt: new Date().toISOString(),
      },
    ]);
    await saveTaxiNotificationSettings({
      ...defaultTaxiNotificationSettings,
      discordEnabled: true,
      telegramEnabled: true,
      telegramChatId: "-123",
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetch);
    await notifyTaxi("ride", author.publicId, false);
    const bodies = fetch.mock.calls.map(([, options]) => JSON.parse(String(options?.body)));
    const discord = bodies.find((body) => body.content);
    const telegram = bodies.find((body) => body.text);
    expect(discord.content).toMatch(
      /Ritrovo: .+\n\nApri la richiesta per i dettagli e rispondere\.\nhttp:\/\/localhost:3000\/taxi\/ride$/,
    );
    expect(telegram.parse_mode).toBe("HTML");
    expect(telegram.text).toContain("Base &lt;Alpha&gt; &amp; &quot;Beta&quot;");
    expect(telegram.text).toMatch(
      /Apri la richiesta per i dettagli e rispondere\.\n<a href="http:\/\/localhost:3000\/taxi\/ride">Vai al dettaglio Taxi<\/a>$/,
    );
    expect(telegram.text.match(/Apri la richiesta per i dettagli e rispondere\./g)).toHaveLength(1);
  });
  it.each([
    { meetingPoint: "offline", expected: "Offline" },
    { meetingPoint: "arrange", expected: "Da concordare nelle risposte" },
    { expected: "Da concordare nelle risposte" },
    {
      meetingPoint: "hub",
      meetingStation: { portal: "0123456789AB", galaxy: 0 },
      expected: `Hub dell'alleanza · 0123456789AB · ${galaxyLabel(0)}`,
    },
    {
      meetingPoint: "station",
      meetingStation: { portal: "1123456789AB", galaxy: 9, name: "Home" },
      expected: `Home · 1123456789AB · ${galaxyLabel(9)}`,
    },
    { meetingStation: { portal: "0123456789AB", galaxy: 0 }, expected: `0123456789AB · ${galaxyLabel(0)}` },
  ])("includes the saved meeting point only in shared alerts: $expected", async ({ expected, ...meeting }) => {
    writeDataFile("private-messages.json", [
      {
        id: "ride",
        senderMemberId: author.publicId,
        subjectType: "taxi",
        subject: "Eissentam",
        body: "Ride",
        galaxy: 9,
        createdAt: new Date().toISOString(),
        ...meeting,
      },
    ]);
    await saveTaxiNotificationSettings({
      ...defaultTaxiNotificationSettings,
      discordEnabled: true,
      telegramEnabled: true,
      pushEnabled: true,
      telegramChatId: "-123",
    });
    await saveTaxiPushDevice(recipient.publicId, subscription("recipient"));
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetch);
    const push = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    for (const reply of [false, true]) {
      fetch.mockClear();
      await notifyTaxi("ride", author.publicId, reply);
      expect(fetch).toHaveBeenCalledTimes(2);
      for (const [, options] of fetch.mock.calls) {
        const body = JSON.parse(String(options?.body));
        expect(body.content ?? body.text).toContain(`Ritrovo: ${expected}`);
      }
    }
    for (const [, payload] of push.mock.calls) expect(String(payload)).not.toContain("Ritrovo:");
  });
  it.each([false, true])(
    "includes only the original requester's formatted friend code in shared alerts (reply=%s)",
    async (reply) => {
      await saveTaxiNotificationSettings({
        ...defaultTaxiNotificationSettings,
        discordEnabled: true,
        telegramEnabled: true,
        pushEnabled: true,
        telegramChatId: "-123",
      });
      await saveTaxiPushDevice(author.publicId, subscription("requester"));
      await saveTaxiPushDevice(recipient.publicId, subscription("responder"));
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(async () => new Response(JSON.stringify({ ok: true })));
      vi.stubGlobal("fetch", fetch);
      const push = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
      await notifyTaxi("ride", reply ? recipient.publicId : author.publicId, reply);
      const expected = `Codice amico del richiedente: ${formatNmsFriendCode(author.nmsCode)}`;
      expect(fetch).toHaveBeenCalledTimes(2);
      for (const [, options] of fetch.mock.calls) {
        expect(options?.body).toContain(expected);
        if (reply) expect(options?.body).toContain(formatNmsFriendCode(recipient.nmsCode));
        else expect(options?.body).not.toContain(formatNmsFriendCode(recipient.nmsCode));
      }
      expect(push).toHaveBeenCalledOnce();
      const payload = JSON.parse(push.mock.calls[0][1] as string);
      expect(Object.keys(payload).sort()).toEqual(["body", "path", "tag", "title"]);
      expect(JSON.stringify(payload)).not.toContain(formatNmsFriendCode(author.nmsCode));
      expect(JSON.stringify(payload)).not.toContain("Codice amico");
    },
  );
  it.each(["missing", "invalid"] as const)(
    "omits unavailable requester codes without blocking shared alerts (%s)",
    async (kind) => {
      seedMembers(kind === "missing" ? [recipient] : [{ ...author, nmsCode: "invalid" }, recipient]);
      await saveTaxiNotificationSettings({ ...defaultTaxiNotificationSettings, discordEnabled: true });
      const fetch = vi.fn().mockResolvedValue(new Response("{}"));
      vi.stubGlobal("fetch", fetch);
      await notifyTaxi("ride", recipient.publicId, true);
      expect(fetch).toHaveBeenCalledOnce();
      expect(fetch.mock.calls[0][1].body).not.toContain("Codice amico del richiedente");
    },
  );
  it("handles missing environment variables", () => {
    for (const key of [
      "AUTH_URL",
      "DISCORD_TAXI_WEBHOOK_URL",
      "TELEGRAM_TAXI_BOT_TOKEN",
      "VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY",
      "VAPID_SUBJECT",
    ])
      vi.stubEnv(key, undefined);
    expect(taxiNotificationReadiness()).toEqual({ discord: false, telegram: false, push: false, links: false });
  });
  it("skips archived threads and uses a safe summary for legacy requests without a subject", async () => {
    await saveTaxiNotificationSettings({ ...defaultTaxiNotificationSettings, discordEnabled: true });
    const request = {
      id: "ride",
      senderMemberId: author.publicId,
      subjectType: "taxi",
      body: "Legacy",
      createdAt: new Date().toISOString(),
    };
    writeDataFile("private-messages.json", [{ ...request, archived: true }]);
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await notifyTaxi("ride", author.publicId, false);
    expect(fetch).not.toHaveBeenCalled();
    writeDataFile("private-messages.json", [request]);
    await notifyTaxi("ride", author.publicId, false);
    expect(fetch.mock.calls[0][1].body).toContain("Destinazione: Taxi");
  });
  it("sanitizes unexpected failures and network errors for individual push devices", async () => {
    await saveTaxiNotificationSettings({ ...defaultTaxiNotificationSettings, pushEnabled: true });
    await saveTaxiPushDevice(recipient.publicId, subscription("network"));
    vi.spyOn(webpush, "sendNotification").mockRejectedValue(new Error("Sensitive endpoint"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await notifyTaxi("ride", author.publicId, false);
    expect(JSON.stringify(log.mock.calls)).not.toContain("Sensitive");
    vi.spyOn(notificationStore, "readTaxiNotifications").mockRejectedValue("unexpected");
    await notifyTaxi("ride", author.publicId, false);
    expect(log).toHaveBeenLastCalledWith("Unable to dispatch taxi notifications", "Unknown error");
  });
  it("reports readiness without exposing credentials", () => {
    expect(taxiNotificationReadiness()).toEqual({ discord: true, telegram: true, push: true, links: true });
    expect(taxiPushPublicKey()).toBe(keys.publicKey);
    vi.stubEnv("AUTH_URL", "https://example.com/api/auth");
    expect(taxiNotificationReadiness().links).toBe(true);
  });
  it.each([
    ["DISCORD_TAXI_WEBHOOK_URL", "", "discord"],
    ["DISCORD_TAXI_WEBHOOK_URL", "http://localhost/secret", "discord"],
    ["TELEGRAM_TAXI_BOT_TOKEN", "", "telegram"],
    ["VAPID_PUBLIC_KEY", "", "push"],
    ["VAPID_SUBJECT", "invalid", "push"],
    ["AUTH_URL", "", "links"],
    ["AUTH_URL", "http://example.com", "links"],
  ] as const)("rejects invalid configuration %s=%s", (key, value, channel) => {
    vi.stubEnv(key, value);
    expect(taxiNotificationReadiness()[channel]).toBe(false);
  });
  it("makes no provider calls while channels are disabled", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const push = vi.spyOn(webpush, "sendNotification");
    await notifyTaxi("ride", author.publicId, false);
    expect(fetch).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    await expect(sendTaxiTest("discord", author.publicId)).rejects.toThrow("disabled");
  });
  it("sends summaries with detail links to both shared channels, never full text or mentions", async () => {
    await saveTaxiNotificationSettings({
      ...defaultTaxiNotificationSettings,
      discordEnabled: true,
      telegramEnabled: true,
      telegramChatId: "-123",
    });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetch);
    await notifyTaxi("ride", author.publicId, false);
    expect(fetch).toHaveBeenCalledTimes(2);
    const bodies = fetch.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies).toContainEqual(expect.objectContaining({ allowed_mentions: { parse: [] } }));
    expect(JSON.stringify(bodies)).toContain("http://localhost:3000/taxi/ride");
    expect(JSON.stringify(bodies)).not.toContain("Do not expose");
    expect(bodies).toContainEqual(expect.objectContaining({ chat_id: "-123" }));
  });
  it("isolates channel failures and logs only sanitized errors", async () => {
    await saveTaxiNotificationSettings({
      ...defaultTaxiNotificationSettings,
      discordEnabled: true,
      telegramEnabled: true,
      telegramChatId: "-123",
    });
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("secret"))
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetch);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await notifyTaxi("ride", author.publicId, true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });
  it.each([429, 500])("surfaces HTTP %i without retries", async (status) => {
    await saveTaxiNotificationSettings({ ...defaultTaxiNotificationSettings, discordEnabled: true });
    const fetch = vi.fn().mockResolvedValue(new Response("", { status }));
    vi.stubGlobal("fetch", fetch);
    await expect(sendTaxiTest("discord", author.publicId)).rejects.toThrow(`HTTP ${status}`);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("requires Telegram confirmation", async () => {
    await saveTaxiNotificationSettings({
      ...defaultTaxiNotificationSettings,
      telegramEnabled: true,
      telegramChatId: "-123",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false }))));
    await expect(sendTaxiTest("telegram", author.publicId)).rejects.toThrow("not confirmed");
  });
  it("skips disabled replies and removed or archived requests", async () => {
    await saveTaxiNotificationSettings({
      ...defaultTaxiNotificationSettings,
      discordEnabled: true,
      repliesEnabled: false,
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await notifyTaxi("ride", author.publicId, true);
    await notifyTaxi("missing", author.publicId, false);
    writeDataFile("private-messages.json", []);
    await notifyTaxi("ride", author.publicId, false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("filters authors, unapproved/offline members and preferences while supporting multiple devices", async () => {
    const blocked = makeMember({ membershipStatus: "blocked" });
    const pending = makeMember({ membershipStatus: "pending" });
    const offline = makeMember({ offline: true });
    const optedOut = makeMember();
    seedMembers([author, recipient, blocked, pending, offline, optedOut]);
    await saveTaxiNotificationSettings({ ...defaultTaxiNotificationSettings, pushEnabled: true });
    for (const member of [author, recipient, blocked, pending, offline, optedOut])
      await saveTaxiPushDevice(member.publicId, subscription(member.publicId));
    await saveTaxiPushDevice(recipient.publicId, subscription("second"));
    await setTaxiPushPreference(optedOut.publicId, false);
    const send = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    await notifyTaxi("ride", author.publicId, true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([sub]) => sub.endpoint)).toEqual([
      subscription(recipient.publicId).endpoint,
      subscription("second").endpoint,
    ]);
    expect(JSON.parse(send.mock.calls[0][1] as string).title).toContain("Risposta");
  });
  it("removes expired subscriptions and reports other failures without stopping remaining devices", async () => {
    await saveTaxiNotificationSettings({ ...defaultTaxiNotificationSettings, pushEnabled: true });
    for (const id of ["expired", "failed", "ok"]) await saveTaxiPushDevice(recipient.publicId, subscription(id));
    const send = vi
      .spyOn(webpush, "sendNotification")
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await notifyTaxi("ride", author.publicId, false);
    expect(send).toHaveBeenCalledTimes(3);
    expect((await readTaxiNotifications()).devices).toHaveLength(2);
  });
  it("sends push tests only to the administrator's devices", async () => {
    await saveTaxiNotificationSettings({ ...defaultTaxiNotificationSettings, pushEnabled: true });
    await expect(sendTaxiTest("push", author.publicId)).rejects.toThrow("No enabled");
    await saveTaxiPushDevice(author.publicId, subscription("admin"));
    await saveTaxiPushDevice(recipient.publicId, subscription("recipient"));
    const send = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    await sendTaxiTest("push", author.publicId);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0].endpoint).toContain("admin");
    send.mockRejectedValue({ statusCode: 404 });
    await expect(sendTaxiTest("push", author.publicId)).rejects.toThrow("expired");
  });
  it("logs storage failures without rejecting a saved taxi operation", async () => {
    writeDataFile("taxi-notifications.json", {});
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notifyTaxi("ride", author.publicId, false)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });
});
