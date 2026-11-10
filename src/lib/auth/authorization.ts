import { auth } from "@/auth";
import { getMissingAuthConfiguration } from "@/lib/auth/local-auth";
import { registerMember, type AllianceMember } from "@/lib/members/access-store";
import { notifyMemberRegistered, scheduleMemberNotification } from "@/lib/notifications/member-notification-delivery";

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

// Re-exported so existing callers keep importing it from here; the check itself is pure.
export { hasRole } from "@/lib/members/member-types";
