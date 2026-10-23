import { expect, it, vi } from "vitest";
import { after } from "next/server";
import webpush from "web-push";
import { POST } from "@/app/api/taxi-requests/route";
import { POST as postHelp } from "@/app/api/help-requests/route";
import { saveTaxiNotificationSettings, saveTaxiPushDevice } from "@/lib/notifications/taxi-notifications-store";
import { readHelpRequests } from "@/lib/messages/private-messages-store";
import { defaultTaxiNotificationSettings } from "@/lib/notifications/taxi-notifications";
import { makeMember, seedMembers, writeDataFile } from "../helpers/members";
import { signInAs } from "../helpers/auth";
import { jsonRequest } from "../helpers/http";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: vi.fn(),
}));

it("dispatches saved Taxi requests and replies end to end without affecting Help or failed saves", async () => {
  const author = makeMember();
  const responder = makeMember();
  seedMembers([author, responder]);
  writeDataFile("private-messages.json", []);
  const vapid = webpush.generateVAPIDKeys();
  vi.stubEnv("AUTH_URL", "http://localhost:3000/api/auth");
  vi.stubEnv("DISCORD_TAXI_WEBHOOK_URL", "https://discord.com/api/webhooks/123/test");
  vi.stubEnv("TELEGRAM_TAXI_BOT_TOKEN", "123:test");
  vi.stubEnv("VAPID_PUBLIC_KEY", vapid.publicKey);
  vi.stubEnv("VAPID_PRIVATE_KEY", vapid.privateKey);
  vi.stubEnv("VAPID_SUBJECT", "mailto:admin@example.com");
  await saveTaxiNotificationSettings({
    ...defaultTaxiNotificationSettings,
    discordEnabled: true,
    telegramEnabled: true,
    pushEnabled: true,
    telegramChatId: "-123",
  });
  for (const member of [author, responder])
    await saveTaxiPushDevice(member.publicId, {
      endpoint: `https://fcm.googleapis.com/fcm/send/${member.publicId}`,
      keys: { p256dh: vapid.publicKey, auth: Buffer.alloc(16).toString("base64url") },
    });
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal("fetch", fetch);
  const push = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
  signInAs(author);
  expect((await POST(jsonRequest("/api/taxi-requests", "POST", { message: "Ride", galaxy: 9 }))).status).toBe(201);
  const request = (await readHelpRequests("taxi"))[0];
  expect(fetch).not.toHaveBeenCalled();
  const dispatch = vi.mocked(after).mock.calls[0][0];
  if (typeof dispatch !== "function") throw new Error("Expected an after callback.");
  await dispatch();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(fetch.mock.calls.map((call) => call[1].body))).toContain(`/taxi/${request.id}`);
  expect(push).toHaveBeenCalledOnce();
  expect(push.mock.calls[0][0].endpoint).toContain(responder.publicId);

  fetch.mockClear();
  push.mockClear();
  signInAs(responder);
  expect(
    (await POST(jsonRequest("/api/taxi-requests", "POST", { message: "On my way", replyToId: request.id }))).status,
  ).toBe(201);
  const replyDispatch = vi.mocked(after).mock.calls[1][0];
  if (typeof replyDispatch !== "function") throw new Error("Expected a reply after callback.");
  await replyDispatch();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(push.mock.calls[0][0].endpoint).toContain(author.publicId);
  expect(JSON.parse(push.mock.calls[0][1] as string)).toMatchObject({
    path: `/taxi/${request.id}`,
    title: "Risposta taxi",
  });

  expect((await POST(jsonRequest("/api/taxi-requests", "POST", { message: "", galaxy: 0 }))).status).toBe(400);
  expect(
    (
      await postHelp(
        jsonRequest("/api/help-requests", "POST", {
          message: "Help",
          subject: "Planet",
          portal: "0123456789AB",
          galaxy: 0,
        }),
      )
    ).status,
  ).toBe(201);
  expect(after).toHaveBeenCalledTimes(2);
});
