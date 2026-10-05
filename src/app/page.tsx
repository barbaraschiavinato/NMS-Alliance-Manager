import { MissionDashboard } from "@/components/mission-dashboard";
import { GoogleLogin } from "@/components/google-login";
import { auth } from "@/auth";
import { getCurrentMember } from "@/lib/authorization";
import { PendingApproval } from "@/components/pending-approval";

export const dynamic = "force-dynamic";

export default async function Home() {
  const missingConfiguration = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ALLIANCE_ADMIN_EMAIL"]
    .filter((key) => !process.env[key]);
  if (missingConfiguration.length > 0) return <GoogleLogin missingConfiguration={missingConfiguration} />;

  const session = await auth();
  if (!session?.user?.email) return <GoogleLogin />;

  const member = await getCurrentMember({ allowPending: true, allowBlocked: true });
  if (!member) return <GoogleLogin />;
  if (member.membershipStatus !== "approved") return <PendingApproval member={member} />;
  return <MissionDashboard currentMember={member} />;
}