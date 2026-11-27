import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/auth/authorization";
import { readAccessData, type AllianceMember } from "@/lib/members/access-store";
import { parseEventCoordinates, parseEventInput, type EventLocation } from "@/lib/events/events";
import { canManageEvent, eventViews } from "@/lib/events/event-views";
import { addEvent, readEvents, removeEvent, updateEvent } from "@/lib/events/events-store";
import { scheduleEventNotification } from "@/lib/notifications/event-notification-delivery";
import { petImageTypes } from "@/lib/pets/pets";
import { readVisibleStationPortals } from "@/lib/stations/visible-stations";
import { stationId } from "@/lib/navigation/detail-links";
import { deleteImage, storeImage } from "@/lib/storage/image-storage";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { imageUploadMaxBytes } from "@/lib/utils/limits";
import { apiError, badRequest, forbidden, notFound } from "@/lib/utils/api-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = Record<string, unknown>;

function asPayload(value: unknown): Payload {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Payload) : {};
}

// Create and update requests are multipart (JSON `payload` plus an optional `image`); deletes are plain JSON.
async function readSubmission(request: Request): Promise<{ payload: Payload; image: File | null }> {
  if (!(request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    return { payload: asPayload(await request.json().catch(() => null)), image: null };
  }
  const form = await request.formData().catch(() => null);
  const rawPayload = form?.get("payload");
  let payload: Payload = {};
  try {
    payload = typeof rawPayload === "string" ? asPayload(JSON.parse(rawPayload)) : {};
  } catch {
    payload = {};
  }
  const image = form?.get("image");
  return { payload, image: image instanceof File && image.size > 0 ? image : null };
}

function isValidImage(file: File) {
  return (petImageTypes as readonly string[]).includes(file.type) && file.size <= imageUploadMaxBytes;
}

function imagePathFor(file: File) {
  return `alliance-manager/events/${crypto.randomUUID()}.${file.type.split("/")[1].replace("jpeg", "jpg")}`;
}

async function deleteImageQuietly(pathname: string | undefined) {
  if (!pathname) return;
  try {
    await deleteImage(pathname);
  } catch (error) {
    console.error("Unable to delete event image", error);
  }
}

// Coordinates are resolved on the server and saved with the event. `keep` leaves the stored location untouched.
async function resolveLocation(
  member: AllianceMember,
  payload: Payload,
  current?: EventLocation,
): Promise<{ location: EventLocation } | { error: string }> {
  if (payload.locationKind === "keep" && current) return { location: current };
  if (payload.locationKind === "hub") {
    const { alliance } = await readAccessData();
    const hub = parseEventCoordinates(alliance.portalCode, alliance.galaxy);
    return hub ? { location: { kind: "hub", ...hub } } : { error: "events.error_hub_unavailable" };
  }
  if (payload.locationKind === "station") {
    const station = (await readVisibleStationPortals(member)).find((entry) => stationId(entry) === payload.stationId);
    if (!station) return { error: "events.error_station_not_found" };
    const coordinates = parseEventCoordinates(station.portal, station.galaxy);
    return coordinates
      ? { location: { kind: "station", ...coordinates, ...(station.name ? { name: station.name } : {}) } }
      : { error: "events.error_invalid_location" };
  }
  if (payload.locationKind === "portal") {
    const coordinates = parseEventCoordinates(payload.portal, payload.galaxy);
    if (coordinates) return { location: { kind: "portal", ...coordinates } };
  }
  return { error: "events.error_invalid_location" };
}

export const GET = withRequestMemo(async function GET(request?: Request) {
  const member = await getCurrentMember();
  if (!member) return apiError("events.error_access_required", 401);
  const detailId = request ? new URL(request.url).searchParams.get("detailEvent") : null;
  try {
    const events = await eventViews(member, detailId ?? undefined);
    if (detailId !== null && events.length === 0) return notFound("events.error_not_found");
    return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to read events", error);
    return apiError("events.error_unable_to_read", 503);
  }
});

export const POST = withRequestMemo(async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return apiError("events.error_access_required", 401);
  const { payload, image } = await readSubmission(request);
  const parsed = parseEventInput(payload);
  if ("error" in parsed) return badRequest(parsed.error);
  if (image && !isValidImage(image)) return badRequest("events.error_image_invalid");
  let imagePath: string | undefined;
  try {
    const resolved = await resolveLocation(member, payload);
    if ("error" in resolved) return badRequest(resolved.error);
    if (image) {
      imagePath = imagePathFor(image);
      await storeImage(imagePath, image);
    }
    const event = await addEvent(parsed.input, resolved.location, member.publicId, imagePath);
    await scheduleEventNotification(event.id);
    return NextResponse.json({ id: event.id, events: await eventViews(member) }, { status: 201 });
  } catch (error) {
    console.error("Unable to save event", error);
    await deleteImageQuietly(imagePath);
    return apiError("events.error_unable_to_save", 503);
  }
});

export const PATCH = withRequestMemo(async function PATCH(request: Request) {
  const member = await getCurrentMember();
  if (!member) return apiError("events.error_access_required", 401);
  const { payload, image } = await readSubmission(request);
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!id) return notFound("events.error_not_found");
  const parsed = parseEventInput(payload);
  if ("error" in parsed) return badRequest(parsed.error);
  if (image && !isValidImage(image)) return badRequest("events.error_image_invalid");
  let newImagePath: string | undefined;
  try {
    const current = (await readEvents()).find((event) => event.id === id);
    if (!current) return notFound("events.error_not_found");
    if (!canManageEvent(member, current)) return forbidden("events.error_cannot_edit");
    const resolved = await resolveLocation(member, payload, current.location);
    if ("error" in resolved) return badRequest(resolved.error);
    if (image) {
      newImagePath = imagePathFor(image);
      await storeImage(newImagePath, image);
    }
    const event = await updateEvent(
      id,
      parsed.input,
      resolved.location,
      newImagePath ?? (payload.removeImage === true ? null : undefined),
    );
    if (!event) {
      await deleteImageQuietly(newImagePath);
      return notFound("events.error_not_found");
    }
    if (event.imagePath !== current.imagePath) await deleteImageQuietly(current.imagePath);
    return NextResponse.json({ id, events: await eventViews(member) });
  } catch (error) {
    console.error("Unable to update event", error);
    await deleteImageQuietly(newImagePath);
    return apiError("events.error_unable_to_save", 503);
  }
});

export const DELETE = withRequestMemo(async function DELETE(request: Request) {
  const member = await getCurrentMember();
  if (!member) return apiError("events.error_access_required", 401);
  const { payload } = await readSubmission(request);
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  try {
    const current = (await readEvents()).find((event) => event.id === id);
    if (!current) return notFound("events.error_not_found");
    if (!canManageEvent(member, current)) return forbidden("events.error_cannot_remove");
    await removeEvent(id);
    await deleteImageQuietly(current.imagePath);
    return NextResponse.json({ events: await eventViews(member) });
  } catch (error) {
    console.error("Unable to remove event", error);
    return apiError("events.error_unable_to_remove", 503);
  }
});
