import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import {
  readMemberNotificationSettings,
  saveMemberNotificationSettings,
} from "@/lib/notifications/member-notifications-store";
import { isMemberNotificationSettings } from "@/lib/notifications/member-notifications";
import {
  memberNotificationReadiness,
  sendMemberNotificationTest,
} from "@/lib/notifications/member-notification-delivery";

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
  console.error("Member notification administration failed", error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json(
    { error: "Unable to configure or send member notifications. Check the channel configuration and server logs." },
    { status: 503 },
  );
}

export async function GET() {
  const auth = await authorize();
  if (auth.error) return auth.error;
  try {
    return NextResponse.json(
      { settings: await readMemberNotificationSettings(), readiness: memberNotificationReadiness() },
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
  if (!isMemberNotificationSettings(value))
    return NextResponse.json({ error: "Invalid member notification settings." }, { status: 400 });
  const readiness = memberNotificationReadiness();
  if (value.telegramEnabled && (!readiness.telegram || !readiness.links))
    return NextResponse.json(
      { error: "Configure the environment credentials before enabling this channel." },
      { status: 400 },
    );
  try {
    await saveMemberNotificationSettings(value);
    return NextResponse.json({ settings: await readMemberNotificationSettings(), readiness });
  } catch (error) {
    return failure(error);
  }
}

export async function POST() {
  const auth = await authorize();
  if (auth.error) return auth.error;
  try {
    await sendMemberNotificationTest();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
