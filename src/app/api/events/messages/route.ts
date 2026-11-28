import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { eventMessageMaxLength } from "@/lib/events/events";
import { eventViews } from "@/lib/events/event-views";
import { addEventMessage, readEvents, removeEventMessage } from "@/lib/events/events-store";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { apiError, badRequest, forbidden, notFound } from "@/lib/utils/api-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readBody(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  return {
    eventId: text(body?.eventId),
    messageId: text(body?.messageId),
    message: text(body?.message),
    replyToId: text(body?.replyToId),
  };
}

export const POST = withRequestMemo(async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return apiError("events.error_access_required", 401);
  const { eventId, message, replyToId } = await readBody(request);
  if (!message) return badRequest("profile.message_text_required");
  if (message.length > eventMessageMaxLength) return badRequest("profile.message_text_too_long");
  try {
    const event = (await readEvents()).find((entry) => entry.id === eventId);
    if (!event) return notFound("events.error_not_found");
    if (replyToId && !event.messages.some((entry) => entry.id === replyToId)) {
      return notFound("events.error_message_not_found");
    }
    if (!(await addEventMessage(eventId, member.publicId, message, replyToId || undefined))) {
      return notFound("events.error_not_found");
    }
    return NextResponse.json({ events: await eventViews(member, eventId) }, { status: 201 });
  } catch (error) {
    console.error("Unable to save event message", error);
    return apiError("events.error_unable_to_save", 503);
  }
});

export const DELETE = withRequestMemo(async function DELETE(request: Request) {
  const member = await getCurrentMember();
  if (!member) return apiError("events.error_access_required", 401);
  const { eventId, messageId } = await readBody(request);
  try {
    const event = (await readEvents()).find((entry) => entry.id === eventId);
    const existing = event?.messages.find((entry) => entry.id === messageId);
    if (!existing) return notFound("events.error_message_not_found");
    if (existing.senderMemberId !== member.publicId && !hasRole(member, "moderator")) {
      return forbidden("messages.delete_not_allowed");
    }
    await removeEventMessage(eventId, messageId);
    return NextResponse.json({ events: await eventViews(member, eventId) });
  } catch (error) {
    console.error("Unable to delete event message", error);
    return apiError("events.error_unable_to_remove", 503);
  }
});
