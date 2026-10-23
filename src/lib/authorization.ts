import { auth } from "@/auth";
import { getMissingAuthConfiguration } from "@/lib/local-auth";
import { registerMember, type AllianceMember, type MemberRole } from "@/lib/access-store";
import { notifyMemberRegistered, scheduleMemberNotification } from "@/lib/member-notification-delivery";

export async function getCurrentMember(
  options: Readonly<{ allowPending?: boolean; allowBlocked?: boolean }> = {},
): Promise<AllianceMember | null> {
  if (getMissingAuthConfiguration().some((key) => key !== "ALLIANCE_ADMIN_EMAIL")) return null;
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  const { member, awaitingApproval } = await registerMember({
    email,
    name: session.user?.name ?? email,
    image: session.user?.image ?? "",
  });
  if (awaitingApproval) await scheduleMemberNotification(() => notifyMemberRegistered(member.publicId));
  if (member.offline) return null;
  if (member.membershipStatus === "blocked" && !options.allowBlocked) return null;
  if (member.membershipStatus === "pending" && !options.allowPending) return null;
  // La vista semplice limita admin e moderatori alle funzioni dell'utente normale, anche lato server.
  return member.simpleView && member.role !== "user" ? { ...member, role: "user", displayRole: member.role } : member;
}

const roleLevel: Record<MemberRole, number> = { user: 0, moderator: 1, admin: 2 };

export function hasRole(member: AllianceMember | null, minimumRole: MemberRole) {
  return Boolean(member && roleLevel[member.role] >= roleLevel[minimumRole]);
}
