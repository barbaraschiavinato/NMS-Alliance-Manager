import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/authorization";
import {
  isPushSubscription,
  readTaxiNotifications,
  removeTaxiPushDevice,
  saveTaxiPushDevice,
  setTaxiPushPreference,
} from "@/lib/taxi-notifications-store";
import { taxiNotificationReadiness, taxiPushPublicKey } from "@/lib/taxi-notification-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  console.error("Taxi push configuration failed", error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json({ error: "Unable to configure taxi push notifications." }, { status: 503 });
}

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
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
}

export async function PATCH(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  const value: unknown = await request.json().catch(() => null);
  if (!value || typeof value !== "object" || !("enabled" in value) || typeof value.enabled !== "boolean")
    return NextResponse.json({ error: "Invalid taxi notification settings." }, { status: 400 });
  try {
    await setTaxiPushPreference(member.publicId, value.enabled);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  const value: unknown = await request.json().catch(() => null);
  if (!isPushSubscription(value))
    return NextResponse.json({ error: "Invalid browser push subscription." }, { status: 400 });
  try {
    if (!(await readTaxiNotifications()).settings.pushEnabled || !taxiNotificationReadiness().push)
      return NextResponse.json(
        { error: "Taxi push notifications are disabled by the administrator." },
        { status: 409 },
      );
    await saveTaxiPushDevice(member.publicId, value);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  const value: unknown = await request.json().catch(() => null);
  if (
    !value ||
    typeof value !== "object" ||
    !("endpoint" in value) ||
    typeof value.endpoint !== "string" ||
    !value.endpoint ||
    value.endpoint.length > 2048
  )
    return NextResponse.json({ error: "Invalid browser push subscription." }, { status: 400 });
  try {
    await removeTaxiPushDevice(value.endpoint, member.publicId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
