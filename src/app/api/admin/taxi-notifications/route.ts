import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { readTaxiNotifications, saveTaxiNotificationSettings } from "@/lib/notifications/taxi-notifications-store";
import { isTaxiNotificationSettings } from "@/lib/notifications/taxi-notifications";
import { sendTaxiTest, taxiNotificationReadiness } from "@/lib/notifications/taxi-notification-delivery";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { adminRequired, apiError, badRequest, unauthorized } from "@/lib/utils/api-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize() {
  const member = await getCurrentMember();
  if (!member) return { error: unauthorized() };
  if (!hasRole(member, "admin")) return { error: adminRequired() };
  return { member };
}

function failure(error: unknown) {
  console.error("Taxi notification administration failed", error instanceof Error ? error.message : "Unknown error");
  return apiError("taxi_notifications.admin_error", 503);
}

export const GET = withRequestMemo(async function GET() {
  const auth = await authorize();
  if (auth.error) return auth.error;
  try {
    return NextResponse.json(
      { settings: (await readTaxiNotifications()).settings, readiness: taxiNotificationReadiness() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
});

export const PATCH = withRequestMemo(async function PATCH(request: Request) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const value: unknown = await request.json().catch(() => null);
  if (!isTaxiNotificationSettings(value)) return badRequest("taxi_notifications.invalid_settings");
  const readiness = taxiNotificationReadiness();
  if (
    ((value.discordEnabled || value.telegramEnabled || value.pushEnabled) && !readiness.links) ||
    (value.discordEnabled && !readiness.discord) ||
    (value.telegramEnabled && !readiness.telegram) ||
    (value.pushEnabled && !readiness.push)
  )
    return badRequest("taxi_notifications.configure_credentials");
  try {
    await saveTaxiNotificationSettings(value);
    return NextResponse.json({ settings: (await readTaxiNotifications()).settings, readiness });
  } catch (error) {
    return failure(error);
  }
});

export const POST = withRequestMemo(async function POST(request: Request) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const value: unknown = await request.json().catch(() => null);
  if (
    !value ||
    typeof value !== "object" ||
    !("channel" in value) ||
    (value.channel !== "discord" && value.channel !== "telegram" && value.channel !== "push")
  )
    return badRequest("taxi_notifications.invalid_channel");
  try {
    await sendTaxiTest(value.channel, auth.member.publicId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
});
