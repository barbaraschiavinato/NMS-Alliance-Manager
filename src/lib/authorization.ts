import { auth } from "@/auth";
import { registerMember, type AllianceMember, type MemberRole } from "@/lib/access-store";

export async function getCurrentMember(options: Readonly<{ allowPending?: boolean; allowBlocked?: boolean }> = {}): Promise<AllianceMember | null> {
  if (!process.env.AUTH_SECRET || !process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) return null;
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  const { member } = await registerMember({
    email,
    name: session.user?.name ?? email,
    image: session.user?.image ?? "",
  });
  if (member.membershipStatus === "blocked" && !options.allowBlocked) return null;
  if (member.membershipStatus === "pending" && !options.allowPending) return null;
  return member;
}

const roleLevel: Record<MemberRole, number> = { user: 0, moderator: 1, admin: 2 };

export function hasRole(member: AllianceMember | null, minimumRole: MemberRole) {
  return Boolean(member && roleLevel[member.role] >= roleLevel[minimumRole]);
}