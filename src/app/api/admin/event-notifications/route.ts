import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { isEventNotificationSettings } from "@/lib/notifications/event-notifications";
import { eventNotificationReadiness, sendEventNotificationTest } from "@/lib/notifications/event-notification-delivery";
import {
  readEventNotificationSettings,
  saveEventNotificationSettings,
} from "@/lib/notifications/event-notifications-store";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { adminRequired, apiError, badRequest, unauthorized } from "@/lib/utils/api-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorizationError() {
  const member = await getCurrentMember();
  if (!member) return unauthorized();
  return hasRole(member, "admin") ? null : adminRequired();
}

function failure(error: unknown) {
  console.error("Event notification administration failed", error instanceof Error ? error.message : "Unknown error");
  return apiError("event_notifications.admin_error", 503);
}

export const GET = withRequestMemo(async function GET() {
  const denied = await authorizationError();
  if (denied) return denied;
  try {
    return NextResponse.json(
      { settings: await readEventNotificationSettings(), readiness: eventNotificationReadiness() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
});

export const PATCH = withRequestMemo(async function PATCH(request: Request) {
  const denied = await authorizationError();
  if (denied) return denied;
  const value: unknown = await request.json().catch(() => null);
  if (!isEventNotificationSettings(value)) return badRequest("event_notifications.invalid_settings");
  const readiness = eventNotificationReadiness();
  if (value.telegramEnabled && (!readiness.telegram || !readiness.links))
    return badRequest("taxi_notifications.configure_credentials");
  try {
    await saveEventNotificationSettings(value);
    return NextResponse.json({ settings: await readEventNotificationSettings(), readiness });
  } catch (error) {
    return failure(error);
  }
});

export const POST = withRequestMemo(async function POST() {
  const denied = await authorizationError();
  if (denied) return denied;
  try {
    await sendEventNotificationTest();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
});
