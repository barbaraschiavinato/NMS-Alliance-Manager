import { hasRole, isEmailAddress, type AllianceMember } from "@/lib/members/member-types";

// Owner rules shared by the member-owned records (farms, pets): regular users always own what they save,
// staff (effective role) may pick any approved member or leave the record unassigned (`ownerId: null`),
// and only staff can manage unassigned records.

export type OwnedItem = Readonly<{ ownerId: string | null; createdByMemberId?: string }>;

/** Translation keys returned when a requested owner is not allowed. */
export type OwnerErrorKeys = Readonly<{ cannotAssignAnother: string; mustBeApproved: string }>;

export type OwnerResolution = { ownerId: string | null } | { error: string; status: number };

export function canManageOwnedItem(member: AllianceMember, item: OwnedItem): boolean {
  return hasRole(member, "moderator") || (item.ownerId !== null && item.ownerId === member.publicId);
}

/**
 * Picks the owner to store. `requested` null clears the owner; omitted or empty values keep `fallbackOwnerId`
 * (the member on create, the current owner on update).
 */
export function resolveOwner(
  member: AllianceMember,
  members: readonly AllianceMember[],
  requested: unknown,
  fallbackOwnerId: string | null,
  errors: OwnerErrorKeys,
): OwnerResolution {
  const requestedId =
    requested === null ? null : typeof requested === "string" && requested.trim() ? requested.trim() : fallbackOwnerId;
  if (!hasRole(member, "moderator")) {
    return requestedId === member.publicId
      ? { ownerId: member.publicId }
      : { error: errors.cannotAssignAnother, status: 403 };
  }
  if (requestedId === null || requestedId === fallbackOwnerId) return { ownerId: requestedId };
  const owner = findApprovedOwner(members, requestedId);
  return owner ? { ownerId: owner.publicId } : { error: errors.mustBeApproved, status: 400 };
}

/** The owner shown on a card: only approved members count, so a former member reads as unassigned. */
export function findApprovedOwner(
  members: readonly AllianceMember[],
  ownerId: string | null,
): AllianceMember | undefined {
  if (ownerId === null) return undefined;
  return members.find((candidate) => candidate.publicId === ownerId && candidate.membershipStatus === "approved");
}

/** In-game name, then account name, never an email address. */
export function ownerDisplayName(owner: AllianceMember | undefined): string {
  return [owner?.nmsName, owner?.name].find((value) => value && !isEmailAddress(value)) || "";
}

/**
 * Moves ownership and authorship from one member to another (offline-profile linking).
 * Returns null when no item references `fromMemberId`, so the caller can skip the write.
 */
export function reassignOwnedItems<T extends OwnedItem>(
  items: readonly T[],
  fromMemberId: string,
  toMemberId: string,
): T[] | null {
  if (!items.some((item) => item.ownerId === fromMemberId || item.createdByMemberId === fromMemberId)) return null;
  return items.map((item) => ({
    ...item,
    ownerId: item.ownerId === fromMemberId ? toMemberId : item.ownerId,
    ...(item.createdByMemberId === fromMemberId ? { createdByMemberId: toMemberId } : {}),
  }));
}
