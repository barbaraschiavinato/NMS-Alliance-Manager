import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { isParticipationStatus, isPastEvent } from "@/lib/events/events";
import { eventViews } from "@/lib/events/event-views";
import { readEvents, setParticipation } from "@/lib/events/events-store";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { apiError, badRequest, conflict, forbidden, notFound } from "@/lib/utils/api-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `status` null withdraws the answer; `memberId` (staff only) removes another member's answer.
export const PUT = withRequestMemo(async function PUT(request: Request) {
  const member = await getCurrentMember();
  if (!member) return apiError("events.error_access_required", 401);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  const status = body?.status;
  const memberId = typeof body?.memberId === "string" && body.memberId ? body.memberId : member.publicId;
  if (status !== null && !isParticipationStatus(status)) return badRequest("events.error_invalid_participation");
  if (memberId !== member.publicId && (status !== null || !hasRole(member, "moderator"))) {
    return forbidden("events.error_cannot_change_participation");
  }
  try {
    const event = (await readEvents()).find((entry) => entry.id === eventId);
    if (!event) return notFound("events.error_not_found");
    if (isPastEvent(event, Date.now())) return conflict("events.error_past_read_only");
    if (!(await setParticipation(eventId, memberId, status))) return notFound("events.error_not_found");
    return NextResponse.json({ events: await eventViews(member, eventId) });
  } catch (error) {
    console.error("Unable to save event participation", error);
    return apiError("events.error_unable_to_save", 503);
  }
});
