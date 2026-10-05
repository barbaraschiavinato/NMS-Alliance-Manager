import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GoogleLogin } from "@/components/google-login";
import { MembersPage } from "@/components/members-page";
import { PendingApproval } from "@/components/pending-approval";
import { getCurrentMember } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";
import { readMissions } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const requiredConfiguration = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ALLIANCE_ADMIN_EMAIL"]
    .filter((key) => !process.env[key]);
  if (requiredConfiguration.length > 0) return <GoogleLogin missingConfiguration={requiredConfiguration} />;

  const session = await auth();
  if (!session?.user?.email) return <GoogleLogin />;

  const member = await getCurrentMember({ allowPending: true, allowBlocked: true });
  if (!member) return <GoogleLogin />;
  if (member.membershipStatus !== "approved") return <PendingApproval member={member} />;
  if (member.role !== "admin" && member.role !== "moderator") redirect("/");

  const [accessData, missions] = await Promise.all([readAccessData(), readMissions()]);
  return <MembersPage alliance={accessData.alliance} currentMember={member} missionCount={missions.length} />;
}