import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth/authorization";
import {
  isPushSubscription,
  readTaxiNotifications,
  removeTaxiPushDevice,
  saveTaxiPushDevice,
  setTaxiPushPreference,
} from "@/lib/notifications/taxi-notifications-store";
import { taxiNotificationReadiness, taxiPushPublicKey } from "@/lib/notifications/taxi-notification-delivery";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { apiError, badRequest, conflict, unauthorized } from "@/lib/utils/api-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  console.error("Taxi push configuration failed", error instanceof Error ? error.message : "Unknown error");
  return apiError("taxi_notifications.push_error", 503);
}

export const GET = withRequestMemo(async function GET() {
  const member = await getCurrentMember();
  if (!member) return unauthorized();
  try {
    const data = await readTaxiNotifications();
    const configured = taxiNotificationReadiness().push;
    return NextResponse.json(
      {
        enabled: !data.disabledMembers.includes(member.publicId),
        available: data.settings.pushEnabled && configured,
        publicKey: configured ? taxiPushPublicKey() : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
});

export const PATCH = withRequestMemo(async function PATCH(request: Request) {
  const member = await getCurrentMember();
  if (!member) return unauthorized();
  const value: unknown = await request.json().catch(() => null);
  if (!value || typeof value !== "object" || !("enabled" in value) || typeof value.enabled !== "boolean")
    return badRequest("taxi_notifications.invalid_settings");
  try {
    await setTaxiPushPreference(member.publicId, value.enabled);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
});

export const POST = withRequestMemo(async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return unauthorized();
  const value: unknown = await request.json().catch(() => null);
  if (!isPushSubscription(value)) return badRequest("taxi_notifications.invalid_subscription");
  try {
    if (!(await readTaxiNotifications()).settings.pushEnabled || !taxiNotificationReadiness().push)
      return conflict("taxi_notifications.admin_disabled");
    await saveTaxiPushDevice(member.publicId, value);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
});

export const DELETE = withRequestMemo(async function DELETE(request: Request) {
  const member = await getCurrentMember();
  if (!member) return unauthorized();
  const value: unknown = await request.json().catch(() => null);
  if (
    !value ||
    typeof value !== "object" ||
    !("endpoint" in value) ||
    typeof value.endpoint !== "string" ||
    !value.endpoint ||
    value.endpoint.length > 2048
  )
    return badRequest("taxi_notifications.invalid_subscription");
  try {
    await removeTaxiPushDevice(value.endpoint, member.publicId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
});
