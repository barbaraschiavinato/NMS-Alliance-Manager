import { NextResponse } from "next/server";
import { allianceAdminEmail } from "@/lib/auth/alliance-admin";
import { getCurrentMember, hasRole } from "@/lib/auth/authorization";
import { linkOfflineMember } from "@/lib/members/offline-members";
import {
  updateMemberProfile,
  createOfflineMember,
  updateOfflineMember,
  isMemberProfileInput,
  deleteMember,
  readAccessData,
  memberRoles,
  updateMemberApproval,
  updateMemberRole,
} from "@/lib/members/access-store";
import { readMissions, writeMissions } from "@/lib/missions/store";
import { membershipStatuses, type AllianceMember, type MemberRole } from "@/lib/members/member-types";
import { isFixedLocalAccount } from "@/lib/auth/local-auth";
import {
  notifyMemberApprovedByEmail,
  notifyMemberRemoved,
  notifyMemberRoleChanged,
  notifyMemberStatusChanged,
  scheduleMemberNotification,
} from "@/lib/notifications/member-notification-delivery";
import { withRequestMemo } from "@/lib/storage/request-memo";
import { badRequest, forbidden, moderatorRequired, notFound, unauthorized } from "@/lib/utils/api-responses";

function actorOf(member: AllianceMember) {
  return { name: member.nmsName || member.name, telegramName: member.telegramName };
}

const profileConflictMessages = {
  name: "members.duplicate_in_game_name",
  code: "members.duplicate_friend_code",
} as const;
export const GET = withRequestMemo(async function GET() {
  const member = await getCurrentMember();
  if (!member) return unauthorized();
  if (!hasRole(member, "moderator")) return moderatorRequired();
  const protectedAdminEmail = allianceAdminEmail();
  return NextResponse.json(
    (await readAccessData()).members.map((profile) => {
      const visibleProfile = { ...profile };
      delete visibleProfile.pulseEffectsEnabled;
      return {
        ...visibleProfile,
        protectedAdmin: profile.email.trim().toLowerCase() === protectedAdminEmail,
      };
    }),
  );
});

export const PATCH = withRequestMemo(async function PATCH(request: Request) {
  const member = await getCurrentMember();
  if (!member) return unauthorized();
  if (!hasRole(member, "moderator")) return moderatorRequired();
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object") return badRequest("errors.invalid_role_data");
  const { email, role, membershipStatus } = input as Record<string, unknown>;
  if (typeof email !== "string") return badRequest("errors.invalid_email_address");

  if ((input as Record<string, unknown>).action === "profile") {
    if (isFixedLocalAccount(member.email)) {
      return forbidden("errors.fixed_test_account_profiles_cannot_be_edited");
    }
    if (!isMemberProfileInput(input)) return badRequest("errors.invalid_profile");
    const data = await readAccessData();
    const target = data.members.find((item) => item.email === email.trim().toLowerCase());
    if (!target || target.offline || (member.role === "moderator" && target.role !== "user")) {
      return notFound("errors.user_not_found_or_cannot_be_modified");
    }
    const profileInput = { ...input };
    delete profileInput.pulseEffectsEnabled;
    const updated = await updateMemberProfile(target.email, profileInput);
    if (!updated) return notFound("errors.user_not_found_or_cannot_be_modified");
    if (typeof updated === "string")
      return NextResponse.json({ error: profileConflictMessages[updated] }, { status: 409 });
    return NextResponse.json(updated);
  }

  if (membershipStatus !== undefined) {
    if (
      typeof membershipStatus !== "string" ||
      !membershipStatuses.includes(membershipStatus as (typeof membershipStatuses)[number])
    ) {
      return badRequest("errors.invalid_membership_status");
    }
    const previousStatus = (await readAccessData()).members.find(
      (item) => item.email === email.trim().toLowerCase(),
    )?.membershipStatus;
    const updated = await updateMemberApproval(
      email,
      member.email,
      membershipStatus as (typeof membershipStatuses)[number],
      member.role,
    );
    if (!updated || !previousStatus) return notFound("errors.user_not_found_or_cannot_be_modified");
    await scheduleMemberNotification(() =>
      notifyMemberStatusChanged(updated.publicId, previousStatus, updated.membershipStatus, actorOf(member)),
    );
    if (previousStatus === "pending" && updated.membershipStatus === "approved")
      await scheduleMemberNotification(() => notifyMemberApprovedByEmail(updated.publicId), "email");
    return NextResponse.json({ ok: true, membershipStatus: updated.membershipStatus });
  }

  if (!hasRole(member, "admin")) return forbidden("admin.only_an_administrator_can_change_roles");
  if (typeof role !== "string" || !memberRoles.includes(role as (typeof memberRoles)[number])) {
    return badRequest("errors.invalid_role");
  }
  const target = (await readAccessData()).members.find((item) => item.email === email.trim().toLowerCase());
  const updated = await updateMemberRole(email, role as (typeof memberRoles)[number]);
  if (!updated || !target) return notFound("errors.user_not_found_or_role_cannot_be_changed");
  await scheduleMemberNotification(() =>
    notifyMemberRoleChanged(target.publicId, target.role, role as MemberRole, actorOf(member)),
  );
  return NextResponse.json({ ok: true });
});

export const DELETE = withRequestMemo(async function DELETE(request: Request) {
  const member = await getCurrentMember();
  if (!member) return unauthorized();
  if (!hasRole(member, "moderator")) return moderatorRequired();
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || typeof (input as Record<string, unknown>).email !== "string") {
    return badRequest("errors.invalid_member_email");
  }
  const removedEmail = (input as { email: string }).email.trim().toLowerCase();
  const access = await readAccessData();
  const removedMember = access.members.find((candidate) => candidate.email === removedEmail);
  const adminEmail = allianceAdminEmail();
  const adminMember = adminEmail ? access.members.find((candidate) => candidate.email === adminEmail) : undefined;
  const removed = await deleteMember((input as { email: string }).email, member.role, member.email);
  if (!removed || !removedMember) return notFound("errors.member_not_found_or_cannot_be_removed_with_your_role");
  await scheduleMemberNotification(() =>
    notifyMemberRemoved(removedMember.nmsName || removedMember.name, actorOf(member)),
  );
  if (adminMember) {
    const missions = await readMissions();
    if (missions.some((mission) => mission.stationOwnerMemberId === removedMember.publicId)) {
      await writeMissions(
        missions.map((mission) =>
          mission.stationOwnerMemberId === removedMember.publicId
            ? {
                ...mission,
                stationOwnerMemberId: adminMember.publicId,
                stationOwnerName: adminMember.nmsName || adminMember.name,
              }
            : mission,
        ),
      );
    }
  }
  return NextResponse.json({ ok: true });
});
export const POST = withRequestMemo(async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return unauthorized();
  if (!hasRole(member, "moderator")) return moderatorRequired();
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object") return badRequest("errors.invalid_data");
  const { action } = input as Record<string, unknown>;

  if (action === "link") {
    const { offlineId, targetId } = input as Record<string, unknown>;
    if (
      typeof offlineId !== "string" ||
      typeof targetId !== "string" ||
      !(await linkOfflineMember(offlineId, targetId))
    ) {
      return badRequest("errors.unable_to_link_the_profile");
    }
    return NextResponse.json({ ok: true });
  }

  if (!isMemberProfileInput(input, true)) return badRequest("errors.invalid_profile");
  if (action === "update") {
    const { offlineId } = input as unknown as Record<string, unknown>;
    const updated = typeof offlineId === "string" ? await updateOfflineMember(offlineId, input) : null;
    if (!updated) return notFound("errors.offline_player_not_found");
    if (typeof updated === "string")
      return NextResponse.json({ error: profileConflictMessages[updated] }, { status: 409 });
    return NextResponse.json(updated);
  }
  const created = await createOfflineMember(input, member.email);
  if (typeof created === "string")
    return NextResponse.json({ error: profileConflictMessages[created] }, { status: 409 });
  return NextResponse.json(created, { status: 201 });
});
