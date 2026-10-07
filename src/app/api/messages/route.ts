import { NextResponse } from "next/server";
import { getCurrentMember, hasRole } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";
import { readAlmanacResponse } from "@/lib/almanac-store";
import { decodePortalAddress } from "@/lib/missions";
import { deletePrivateMessageBranch, readPrivateMessages, savePrivateMessage } from "@/lib/private-messages-store";
import { readStationPortals } from "@/lib/stations-store";
import { readMissions } from "@/lib/store";
import { isEmailAddress } from "@/lib/member-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  if (params.has("recipientId")) return getPlanetSubject(params);

  try {
    const [messages, accessData] = await Promise.all([readPrivateMessages(), readAccessData()]);
    const isModerator = hasRole(member, "moderator");
    const visibleMessages = messages.filter((message) =>
      isModerator ||
      message.senderEmail.toLowerCase() === member.email.toLowerCase() ||
      message.recipientEmail.toLowerCase() === member.email.toLowerCase(),
    );
    const membersByEmail = new Map(accessData.members.map((profile) => [profile.email.toLowerCase(), profile]));
    const responseMessages = visibleMessages
      .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(({ senderEmail, recipientEmail, ...message }) => {
        const sender = membersByEmail.get(senderEmail.toLowerCase());
        const recipient = membersByEmail.get(recipientEmail.toLowerCase());
        return {
          ...message,
          senderMemberId: sender?.publicId,
          recipientMemberId: recipient?.publicId,
          senderName: [sender?.nmsName, sender?.name].find((name) => name && !isEmailAddress(name)) || "Former member",
          recipientName: [recipient?.nmsName, recipient?.name].find((name) => name && !isEmailAddress(name)) || "Former member",
        };
      });
    return NextResponse.json(responseMessages, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to read private messages", error);
    return NextResponse.json({ error: "profile.message_unable_to_read" }, { status: 503 });
  }
}

async function resolvePlanetSubject(recipientEmail: string, portal: string, galaxy: number, planetNumber: number) {
  const stations = await readStationPortals(recipientEmail);
  const station = stations.find((entry) => entry.portal === portal && entry.galaxy === galaxy);
  if (!station) return null;

  const almanac = await readAlmanacResponse(portal, galaxy);
  const lines = almanac?.lines && typeof almanac.lines === "object" ? almanac.lines as Record<string, unknown> : null;
  const headline = lines?.headline && typeof lines.headline === "object" ? lines.headline as Record<string, unknown> : null;
  return station.name?.trim() || (typeof headline?.word === "string" ? headline.word.trim() : "") || `Planet ${planetNumber}`;
}

async function getPlanetSubject(params: URLSearchParams) {
  const recipientId = (params.get("recipientId") ?? "").trim();
  const portal = (params.get("portal") ?? "").toUpperCase();
  const galaxyValue = params.get("galaxy") ?? "";
  const galaxy = Number(galaxyValue);
  const decoded = decodePortalAddress(portal);
  if (
    !recipientId ||
    !decoded ||
    decoded.errors.length > 0 ||
    !/^\d+$/.test(galaxyValue) ||
    !Number.isInteger(galaxy) ||
    galaxy < 0 ||
    galaxy > 255
  ) {
    return NextResponse.json({ error: "profile.message_context_invalid" }, { status: 400 });
  }

  try {
    const recipient = (await readAccessData()).members.find((candidate) =>
      candidate.publicId === recipientId && candidate.membershipStatus === "approved",
    );
    if (!recipient) return NextResponse.json({ error: "profile.message_recipient_not_found" }, { status: 404 });

    const subject = await resolvePlanetSubject(recipient.email, portal, galaxy, decoded.planet);
    if (!subject) return NextResponse.json({ error: "profile.message_context_invalid" }, { status: 404 });
    return NextResponse.json({ subject }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to resolve message planet subject", error);
    return NextResponse.json({ error: "profile.message_unable_to_save" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "profile.message_text_required" }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const replyToId = typeof payload.replyToId === "string" ? payload.replyToId.trim() : "";
  const context = payload.context && typeof payload.context === "object" && !Array.isArray(payload.context)
    ? payload.context as Record<string, unknown>
    : null;
  if (!message) {
    return NextResponse.json({ error: "profile.message_text_required" }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "profile.message_text_too_long" }, { status: 400 });
  }

  try {
    if (replyToId) {
      const messages = await readPrivateMessages();
      const original = messages.find((entry) => entry.id === replyToId);
      if (!original) return NextResponse.json({ error: "messages.reply_original_not_found" }, { status: 404 });

      const memberEmail = member.email.toLowerCase();
      const senderEmail = original.senderEmail.toLowerCase();
      const originalRecipientEmail = original.recipientEmail.toLowerCase();
      const recipientEmail = memberEmail === senderEmail
        ? originalRecipientEmail
        : memberEmail === originalRecipientEmail
          ? senderEmail
          : "";
      if (!recipientEmail) return NextResponse.json({ error: "messages.reply_not_allowed" }, { status: 403 });

      const recipient = (await readAccessData()).members.find((candidate) =>
        candidate.email.toLowerCase() === recipientEmail && candidate.membershipStatus === "approved",
      );
      if (!recipient) return NextResponse.json({ error: "profile.message_recipient_not_found" }, { status: 404 });

      let replyContext:
        | { subjectType: "planet"; subject: string; portal: string; galaxy: number; planetNumber: number }
        | { subjectType: "mission"; subject: string; missionCode: string };
      if (
        original.subjectType === "planet" &&
        typeof original.subject === "string" &&
        typeof original.portal === "string" &&
        typeof original.galaxy === "number" &&
        typeof original.planetNumber === "number"
      ) {
        replyContext = {
          subjectType: "planet",
          subject: original.subject,
          portal: original.portal,
          galaxy: original.galaxy,
          planetNumber: original.planetNumber,
        };
      } else if (
        original.subjectType === "mission" &&
        typeof original.subject === "string" &&
        typeof original.missionCode === "string"
      ) {
        replyContext = {
          subjectType: "mission",
          subject: original.subject,
          missionCode: original.missionCode,
        };
      } else {
        return NextResponse.json({ error: "messages.reply_context_missing" }, { status: 400 });
      }

      await savePrivateMessage(member.email, recipient.email, message, replyContext, {
        threadId: original.threadId ?? original.id,
        replyToId: original.id,
      });
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    const recipientId = typeof payload.recipientId === "string" ? payload.recipientId.trim() : "";
    if (!recipientId) {
      return NextResponse.json({ error: "profile.message_recipient_not_found" }, { status: 400 });
    }
    const recipient = (await readAccessData()).members.find((candidate) =>
      candidate.publicId === recipientId && candidate.membershipStatus === "approved",
    );
    if (!recipient) {
      return NextResponse.json({ error: "profile.message_recipient_not_found" }, { status: 404 });
    }
    let messageContext:
      | { subjectType: "planet"; subject: string; portal: string; galaxy: number; planetNumber: number }
      | { subjectType: "mission"; subject: string; missionCode: string };
    if (
      context?.type === "planet" &&
      typeof context.portal === "string" &&
      typeof context.galaxy === "number" &&
      Number.isInteger(context.galaxy) &&
      context.galaxy >= 0 &&
      context.galaxy <= 255
    ) {
      const portal = context.portal.toUpperCase();
      const decoded = decodePortalAddress(portal);
      if (!decoded || decoded.errors.length > 0) {
        return NextResponse.json({ error: "profile.message_context_invalid" }, { status: 400 });
      }
      const planetName = await resolvePlanetSubject(recipient.email, portal, context.galaxy, decoded.planet);
      if (!planetName) return NextResponse.json({ error: "profile.message_context_invalid" }, { status: 400 });
      messageContext = {
        subjectType: "planet",
        subject: planetName,
        portal,
        galaxy: context.galaxy,
        planetNumber: decoded.planet,
      };
    } else if (context?.type === "mission" && typeof context.missionCode === "string" && context.missionCode.trim()) {
      const mission = (await readMissions()).find((candidate) => candidate.id === context.missionCode);
      const recipientNames = [recipient.nmsName, recipient.name]
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean);
      const isAssignee = mission?.assignedEmail
        ? mission.assignedEmail.toLowerCase() === recipient.email.toLowerCase()
        : recipientNames.includes(mission?.assignedTo.trim().toLowerCase() ?? "");
      if (!mission || !isAssignee) {
        return NextResponse.json({ error: "profile.message_context_invalid" }, { status: 400 });
      }
      messageContext = { subjectType: "mission", subject: mission.title, missionCode: mission.id };
    } else {
      return NextResponse.json({ error: "profile.message_context_required" }, { status: 400 });
    }
    await savePrivateMessage(member.email, recipient.email, message, messageContext);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Unable to save private message", error);
    return NextResponse.json({ error: "profile.message_unable_to_save" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const messageId = body && typeof body === "object" && !Array.isArray(body) && "messageId" in body && typeof body.messageId === "string"
    ? body.messageId.trim()
    : "";
  if (!messageId) return NextResponse.json({ error: "messages.message_not_found" }, { status: 400 });

  try {
    const messages = await readPrivateMessages();
    const message = messages.find((entry) => entry.id === messageId);
    if (!message) return NextResponse.json({ error: "messages.message_not_found" }, { status: 404 });

    const memberEmail = member.email.toLowerCase();
    const isParticipant = memberEmail === message.senderEmail.toLowerCase() ||
      memberEmail === message.recipientEmail.toLowerCase();
    if (!isParticipant && !hasRole(member, "moderator")) {
      return NextResponse.json({ error: "messages.delete_not_allowed" }, { status: 403 });
    }

    const deletedCount = await deletePrivateMessageBranch(messageId);
    if (!deletedCount) return NextResponse.json({ error: "messages.message_not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, deletedCount });
  } catch (error) {
    console.error("Unable to delete private message", error);
    return NextResponse.json({ error: "messages.error_unable_to_delete" }, { status: 503 });
  }
}
