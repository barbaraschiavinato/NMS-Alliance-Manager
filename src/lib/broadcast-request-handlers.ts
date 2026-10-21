import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";
import { decodePortalAddress } from "@/lib/missions";
import { deleteHelpRequest, readHelpRequests, saveHelpReply, saveHelpRequest } from "@/lib/private-messages-store";
import type { BroadcastKind } from "@/lib/private-messages-store";
import { readAllStationPortals } from "@/lib/stations-store";
import { galaxyLabel } from "@/lib/galaxies";
import { isValidNmsFriendCode } from "@/lib/member-types";

export function createBroadcastRequestHandlers(kind: BroadcastKind) {
  const errorKey = (key: string) => `${kind}.${key}`;

  async function GET(request: Request) {
    const member = await getCurrentMember();
    if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });

    try {
      if (new URL(request.url).searchParams.has("count")) {
        const count = (await readHelpRequests(kind)).filter((entry) => !entry.replyToId).length;
        return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
      }
      const [requests, accessData] = await Promise.all([readHelpRequests(kind), readAccessData()]);
      const membersById = new Map(accessData.members.map((profile) => [profile.publicId, profile]));
      const toEntry = (entry: (typeof requests)[number]) => {
        const sender = entry.senderMemberId ? membersById.get(entry.senderMemberId) : undefined;
        return {
          id: entry.id,
          senderMemberId: entry.senderMemberId,
          subject: entry.subject,
          body: entry.body,
          portal: entry.portal,
          galaxy: entry.galaxy,
          meetingStation: entry.meetingStation,
          meetingPoint: entry.meetingPoint,
          missionCode: entry.missionCode,
          createdAt: entry.createdAt,
          senderName: sender?.nmsName || "Former member",
        };
      };
      const response = requests
        .filter((entry) => !entry.replyToId)
        .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map((entry) => ({
          ...toEntry(entry),
          replies: requests
            .filter((reply) => reply.replyToId === entry.id)
            .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
            .map(toEntry),
        }));
      return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error(`Unable to read ${kind} requests`, error);
      return NextResponse.json({ error: errorKey("error_unable_to_read") }, { status: 503 });
    }
  }

  async function POST(request: Request) {
    const member = await getCurrentMember();
    if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "profile.message_text_required" }, { status: 400 });
    }
    const payload = body as Record<string, unknown>;
    const message = typeof payload.message === "string" ? payload.message.trim() : "";
    const replyToId = typeof payload.replyToId === "string" ? payload.replyToId.trim() : "";
    if (replyToId) {
      if (!message) return NextResponse.json({ error: "profile.message_text_required" }, { status: 400 });
      if (message.length > 2000) return NextResponse.json({ error: "profile.message_text_too_long" }, { status: 400 });
      try {
        const saved = await saveHelpReply(member.publicId, message, replyToId, kind);
        if (!saved) return NextResponse.json({ error: errorKey("request_not_found") }, { status: 404 });
        return NextResponse.json({ ok: true }, { status: 201 });
      } catch (error) {
        console.error(`Unable to save ${kind} reply`, error);
        return NextResponse.json({ error: errorKey("request_unable_to_save") }, { status: 503 });
      }
    }
    if (kind === "taxi" && !isValidNmsFriendCode(member.nmsCode)) {
      return NextResponse.json({ error: "taxi.friend_code_required" }, { status: 403 });
    }
    const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
    const portal = typeof payload.portal === "string" ? payload.portal.toUpperCase() : "";
    const galaxy = payload.galaxy;
    if (!message) return NextResponse.json({ error: "profile.message_text_required" }, { status: 400 });
    if (message.length > 2000) return NextResponse.json({ error: "profile.message_text_too_long" }, { status: 400 });
    if (
      (kind === "help" && (!subject || subject.length > 160)) ||
      typeof galaxy !== "number" ||
      !Number.isInteger(galaxy) ||
      galaxy < 0 ||
      galaxy > 255
    ) {
      return NextResponse.json({ error: errorKey("request_invalid") }, { status: 400 });
    }
    if (kind === "taxi") {
      if (payload.stationId !== undefined && typeof payload.stationId !== "string") {
        return NextResponse.json({ error: errorKey("request_invalid") }, { status: 400 });
      }
      try {
        const stationId = typeof payload.stationId === "string" ? payload.stationId.trim() : "";
        const meetingPoint =
          payload.meetingPoint === undefined ? (stationId ? "station" : "arrange") : payload.meetingPoint;
        if (
          (meetingPoint !== "offline" &&
            meetingPoint !== "arrange" &&
            meetingPoint !== "hub" &&
            meetingPoint !== "station") ||
          (meetingPoint === "station" ? !stationId : Boolean(stationId))
        ) {
          return NextResponse.json({ error: errorKey("request_invalid") }, { status: 400 });
        }
        const station = stationId
          ? (await readAllStationPortals()).find(
              (entry) => `${entry.ownerId}:${entry.portal}:${entry.galaxy}` === stationId,
            )
          : undefined;
        if (stationId && !station) return NextResponse.json({ error: errorKey("station_not_found") }, { status: 400 });
        const hub = meetingPoint === "hub" ? (await readAccessData()).alliance : undefined;
        if (hub && !hub.portalCode) {
          return NextResponse.json({ error: errorKey("hub_unavailable") }, { status: 400 });
        }
        await saveHelpRequest(member.publicId, message, {
          subjectType: "taxi",
          subject: galaxyLabel(galaxy),
          galaxy,
          meetingPoint,
          ...(hub ? { meetingStation: { portal: hub.portalCode, galaxy: hub.galaxy } } : {}),
          ...(station
            ? {
                meetingStation: {
                  portal: station.portal,
                  galaxy: station.galaxy,
                  ...(station.name ? { name: station.name } : {}),
                },
              }
            : {}),
        });
        return NextResponse.json({ ok: true }, { status: 201 });
      } catch (error) {
        console.error("Unable to save taxi request", error);
        return NextResponse.json({ error: errorKey("request_unable_to_save") }, { status: 503 });
      }
    }
    const decoded = decodePortalAddress(portal);
    if (!decoded || decoded.errors.length > 0) {
      return NextResponse.json({ error: "help.request_invalid" }, { status: 400 });
    }

    try {
      await saveHelpRequest(member.publicId, message, { subject, portal, galaxy });
      return NextResponse.json({ ok: true }, { status: 201 });
    } catch (error) {
      console.error("Unable to save help request", error);
      return NextResponse.json({ error: "help.request_unable_to_save" }, { status: 503 });
    }
  }

  async function DELETE(request: Request) {
    const member = await getCurrentMember();
    if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });

    const body: unknown = await request.json().catch(() => null);
    const id = body && typeof body === "object" && "id" in body && typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: errorKey("request_invalid") }, { status: 400 });

    try {
      const existing = (await readHelpRequests(kind)).find((entry) => entry.id === id);
      if (!existing) return NextResponse.json({ error: errorKey("request_not_found") }, { status: 404 });
      if (existing.senderMemberId !== member.publicId && !hasRole(member, "moderator")) {
        return NextResponse.json({ error: "messages.delete_not_allowed" }, { status: 403 });
      }
      await deleteHelpRequest(id, kind);
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error(`Unable to delete ${kind} request`, error);
      return NextResponse.json({ error: errorKey("request_unable_to_delete") }, { status: 503 });
    }
  }
  return { GET, POST, DELETE };
}
