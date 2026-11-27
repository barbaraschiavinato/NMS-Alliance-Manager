import { beforeEach, describe, expect, it, vi } from "vitest";
import { after } from "next/server";
import * as admin from "@/app/api/admin/event-notifications/route";
import {
  notifyEventCreated,
  scheduleEventNotification,
  sendEventNotificationTest,
} from "@/lib/notifications/event-notification-delivery";
import { defaultEventNotificationSettings } from "@/lib/notifications/event-notifications";
import { saveEventNotificationSettings } from "@/lib/notifications/event-notifications-store";
import { signInAs } from "../helpers/auth";
import { jsonRequest } from "../helpers/http";
import { seedMembers, writeDataFile } from "../helpers/members";
import { castMembers, makeCast, resetData, type Cast } from "./helpers/fixtures";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: vi.fn() }));

let cast: Cast;
const enabled = { telegramEnabled: true, telegramChatId: "-100123", telegramThreadId: "7" };
const url = "/api/admin/event-notifications";

beforeEach(() => {
  resetData();
  cast = makeCast();
  seedMembers(castMembers(cast));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.stubEnv("TELEGRAM_EVENTS_BOT_TOKEN", "123:test");
  vi.stubEnv("AUTH_URL", "https://alliance.example/api/auth");
});

function stubTelegram(response = new Response(JSON.stringify({ ok: true }))) {
  const fetchMock = vi.fn<typeof fetch>(async () => response.clone());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function seedEvent() {
  writeDataFile("events.json", [
    {
      id: "e1",
      type: "market",
      title: "Winter <market>",
      description: "Secret details",
      startsAt: "2026-12-05T20:00:00.000Z",
      location: { kind: "hub", portal: "0123456789AB", galaxy: 0 },
      creatorId: cast.user.publicId,
      createdAt: "2026-11-27T10:00:00.000Z",
    },
  ]);
}

describe("event notification administration", () => {
  it("is reserved to administrators", async () => {
    for (const member of [cast.moderator, cast.simpleAdmin]) {
      signInAs(member);
      expect((await admin.GET()).status).toBe(403);
      expect((await admin.POST()).status).toBe(403);
    }
  });

  it("starts disabled and saves valid settings only", async () => {
    signInAs(cast.admin);
    expect(await (await admin.GET()).json()).toEqual({
      settings: defaultEventNotificationSettings,
      readiness: { telegram: true, links: true },
    });
    expect((await admin.PATCH(jsonRequest(url, "PATCH", { ...enabled, telegramChatId: "" }))).status).toBe(400);
    vi.stubEnv("TELEGRAM_EVENTS_BOT_TOKEN", "");
    expect((await admin.PATCH(jsonRequest(url, "PATCH", enabled))).status).toBe(400);
    vi.stubEnv("TELEGRAM_EVENTS_BOT_TOKEN", "123:test");
    expect((await admin.PATCH(jsonRequest(url, "PATCH", enabled))).status).toBe(200);
  });
});

describe("new event alert", () => {
  it("sends nothing while the channel is disabled", async () => {
    const telegram = stubTelegram();
    seedEvent();
    await notifyEventCreated("e1");
    expect(telegram).not.toHaveBeenCalled();
  });

  it("announces the event with its link, escaped and without the description", async () => {
    const telegram = stubTelegram();
    seedEvent();
    await saveEventNotificationSettings(enabled);
    await notifyEventCreated("e1");
    const [target, init] = telegram.mock.calls[0];
    expect(target).toBe("https://api.telegram.org/bot123:test/sendMessage");
    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    expect(body).toMatchObject({ chat_id: "-100123", message_thread_id: 7 });
    expect(body.text).toContain("Mercatino: Winter &lt;market&gt;");
    expect(body.text).toContain("21:00 (ora italiana)");
    expect(body.text).toContain("https://alliance.example/events/e1?from=events");
    expect(body.text).not.toContain("Secret details");
  });

  it("swallows a provider failure", async () => {
    stubTelegram(new Response("no", { status: 500 }));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    seedEvent();
    await saveEventNotificationSettings(enabled);
    await expect(notifyEventCreated("e1")).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalled();
  });
});

describe("administration actions and failures", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(after).mockReset();
  });

  it("requires a signed-in member", async () => {
    signInAs(null);
    expect((await admin.GET()).status).toBe(401);
    expect((await admin.PATCH(jsonRequest(url, "PATCH", enabled))).status).toBe(401);
  });

  it("sends the test only on the enabled channel", async () => {
    const telegram = stubTelegram();
    signInAs(cast.admin);
    expect((await admin.POST()).status).toBe(503);
    expect((await admin.PATCH(jsonRequest(url, "PATCH", "{broken"))).status).toBe(400);
    await saveEventNotificationSettings({ ...enabled, telegramThreadId: "" });
    expect((await admin.POST()).status).toBe(200);
    const body = JSON.parse(String(telegram.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body.message_thread_id).toBeUndefined();
    vi.stubEnv("TELEGRAM_EVENTS_BOT_TOKEN", "wrong");
    await expect(sendEventNotificationTest()).rejects.toThrow("TELEGRAM_EVENTS_BOT_TOKEN");
    vi.stubEnv("AUTH_URL", "");
    expect((await (await admin.GET()).json()).readiness).toEqual({ telegram: false, links: false });
  });

  it("answers 503 for an unreadable settings document", async () => {
    signInAs(cast.admin);
    for (const stored of [{ settings: {} }, null]) {
      writeDataFile("event-notifications.json", stored);
      expect((await admin.GET()).status).toBe(503);
    }
    const store = await import("@/lib/notifications/event-notifications-store");
    vi.spyOn(store, "saveEventNotificationSettings").mockRejectedValue(new Error("down"));
    expect((await admin.PATCH(jsonRequest(url, "PATCH", enabled))).status).toBe(503);
  });

  it("schedules the alert only when enabled and never throws", async () => {
    await scheduleEventNotification("e1");
    expect(after).not.toHaveBeenCalled();
    await saveEventNotificationSettings(enabled);
    await scheduleEventNotification("e1");
    expect(after).toHaveBeenCalledTimes(1);
    const telegram = stubTelegram();
    await (vi.mocked(after).mock.calls[0][0] as () => Promise<void>)();
    expect(telegram).not.toHaveBeenCalled();
    writeDataFile("event-notifications.json", { settings: {} });
    await expect(scheduleEventNotification("e1")).resolves.toBeUndefined();
  });

  it("names the station or portal, and an unknown organiser generically", async () => {
    const telegram = stubTelegram();
    await saveEventNotificationSettings(enabled);
    const base = {
      type: "other",
      title: "Meet",
      startsAt: "2026-12-05T20:00:00.000Z",
      creatorId: "gone",
    };
    writeDataFile("events.json", [
      { ...base, id: "s", location: { kind: "station", portal: "0123456789AB", galaxy: 0, name: "Base" } },
      { ...base, id: "p", location: { kind: "portal", portal: "0123456789AB", galaxy: 0 } },
    ]);
    await notifyEventCreated("s");
    await notifyEventCreated("p");
    const [station, portal] = telegram.mock.calls.map((call) => String(call[1]?.body));
    expect(station).toContain("Dove: Base");
    expect(station).toContain("Organizza: un membro");
    expect(portal).toContain("Dove: 0123456789AB");
  });
});

describe("unexpected failures", () => {
  it("logs them without details", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = await import("@/lib/notifications/event-notifications-store");
    vi.spyOn(store, "readEventNotificationSettings").mockRejectedValue("down");
    await notifyEventCreated("e1");
    await scheduleEventNotification("e1");
    signInAs(cast.admin);
    expect((await admin.GET()).status).toBe(503);
    expect(errors).toHaveBeenCalledTimes(3);
    for (const call of errors.mock.calls) expect(call[1]).toBe("Unknown error");
  });
});
