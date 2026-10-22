import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { readTaxiNotifications, saveTaxiNotificationSettings } from "@/lib/taxi-notifications-store";
import { isTaxiNotificationSettings } from "@/lib/taxi-notifications";
import { sendTaxiTest, taxiNotificationReadiness } from "@/lib/taxi-notification-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize() {
  const member = await getCurrentMember();
  if (!member) return { error: NextResponse.json({ error: "Accesso richiesto." }, { status: 401 }) };
  if (!hasRole(member, "admin"))
    return { error: NextResponse.json({ error: "Permesso admin richiesto." }, { status: 403 }) };
  return { member };
}

function failure(error: unknown) {
  console.error("Taxi notification administration failed", error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json(
    { error: "Unable to configure or send taxi notifications. Check the channel configuration and server logs." },
    { status: 503 },
  );
}

export async function GET() {
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
}

export async function PATCH(request: Request) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const value: unknown = await request.json().catch(() => null);
  if (!isTaxiNotificationSettings(value))
    return NextResponse.json({ error: "Invalid taxi notification settings." }, { status: 400 });
  const readiness = taxiNotificationReadiness();
  if (
    ((value.discordEnabled || value.telegramEnabled || value.pushEnabled) && !readiness.links) ||
    (value.discordEnabled && !readiness.discord) ||
    (value.telegramEnabled && !readiness.telegram) ||
    (value.pushEnabled && !readiness.push)
  )
    return NextResponse.json(
      { error: "Configure the environment credentials before enabling this channel." },
      { status: 400 },
    );
  try {
    await saveTaxiNotificationSettings(value);
    return NextResponse.json({ settings: (await readTaxiNotifications()).settings, readiness });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const value: unknown = await request.json().catch(() => null);
  if (
    !value ||
    typeof value !== "object" ||
    !("channel" in value) ||
    (value.channel !== "discord" && value.channel !== "telegram" && value.channel !== "push")
  )
    return NextResponse.json({ error: "Invalid notification channel." }, { status: 400 });
  try {
    await sendTaxiTest(value.channel, auth.member.publicId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
