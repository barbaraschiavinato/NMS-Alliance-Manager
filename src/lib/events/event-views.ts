import { hasRole, type AllianceMember } from "@/lib/members/member-types";
import { readAccessData } from "@/lib/members/access-store";
import { findApprovedOwner, ownerDisplayName } from "@/lib/members/owned-items";
import { readVisibleStationPortals } from "@/lib/stations/visible-stations";
import { isSameSystem, stationDetailHref } from "@/lib/navigation/detail-links";
import { readEvents } from "@/lib/events/events-store";
import type { AllianceEvent, EventLocation, ParticipationStatus } from "@/lib/events/events";

export type EventParticipantView = Readonly<{ memberId: string; name: string; status: ParticipationStatus }>;
export type EventMessageView = Readonly<{
  id: string;
  replyToId?: string;
  senderMemberId: string;
  senderName: string;
  body: string;
  createdAt: string;
  canDelete: boolean;
}>;

export type EventView = Pick<
  AllianceEvent,
  "id" | "type" | "title" | "description" | "startsAt" | "endsAt" | "createdAt"
> &
  Readonly<{
    location: EventLocation;
    imageUrl?: string;
    stationHref?: string;
    creatorId: string;
    creatorName: string;
    creatorMemberId?: string;
    canManage: boolean;
    myStatus?: ParticipationStatus;
    participants: readonly EventParticipantView[];
    messages: readonly EventMessageView[];
  }>;

export function canManageEvent(member: AllianceMember, event: AllianceEvent): boolean {
  return hasRole(member, "moderator") || event.creatorId === member.publicId;
}

/** Events as the member sees them; former (no longer approved) members are left out of the participants. */
export async function eventViews(member: AllianceMember, detailId?: string): Promise<EventView[]> {
  const [stored, access] = await Promise.all([readEvents(), readAccessData()]);
  const events = detailId === undefined ? stored : stored.filter((event) => event.id === detailId);
  const stations = events.length > 0 ? await readVisibleStationPortals(member) : [];
  const isStaff = hasRole(member, "moderator");
  return events.map(({ imagePath, participants, messages, location, ...event }) => {
    const creator = findApprovedOwner(access.members, event.creatorId);
    const station = stations.find((entry) => isSameSystem(entry, location));
    const attending = participants.flatMap((participant) => {
      const profile = findApprovedOwner(access.members, participant.memberId);
      return profile ? [{ ...participant, name: ownerDisplayName(profile) }] : [];
    });
    const myStatus = participants.find((participant) => participant.memberId === member.publicId)?.status;
    return {
      id: event.id,
      type: event.type,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      ...(event.endsAt ? { endsAt: event.endsAt } : {}),
      createdAt: event.createdAt,
      location,
      ...(imagePath ? { imageUrl: `/api/events/image?path=${encodeURIComponent(imagePath)}` } : {}),
      ...(station ? { stationHref: stationDetailHref(station, "events") } : {}),
      creatorId: event.creatorId,
      creatorName: ownerDisplayName(creator),
      ...(creator ? { creatorMemberId: creator.publicId } : {}),
      canManage: isStaff || event.creatorId === member.publicId,
      ...(myStatus ? { myStatus } : {}),
      // "Going" before "maybe", otherwise in the order of the answers.
      participants: attending.sort((left, right) => left.status.localeCompare(right.status)),
      messages: messages.map((message) => ({
        ...message,
        senderName: ownerDisplayName(findApprovedOwner(access.members, message.senderMemberId)),
        canDelete: isStaff || message.senderMemberId === member.publicId,
      })),
    };
  });
}
