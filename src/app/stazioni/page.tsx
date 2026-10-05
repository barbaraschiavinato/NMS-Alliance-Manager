import { auth } from "@/auth";
import { GoogleLogin } from "@/components/google-login";
import { PendingApproval } from "@/components/pending-approval";
import { StationsPage } from "@/components/stations-page";
import { getCurrentMember } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";
import { readMissions } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function StationsRoute() {
  const missingConfiguration = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ALLIANCE_ADMIN_EMAIL"]
    .filter((key) => !process.env[key]);
  if (missingConfiguration.length > 0) return <GoogleLogin missingConfiguration={missingConfiguration} />;

  const session = await auth();
  if (!session?.user?.email) return <GoogleLogin />;

  const member = await getCurrentMember({ allowPending: true, allowBlocked: true });
  if (!member) return <GoogleLogin />;
  if (member.membershipStatus !== "approved") return <PendingApproval member={member} />;

  const [accessData, missions] = await Promise.all([readAccessData(), readMissions()]);
  return <StationsPage alliance={accessData.alliance} currentMember={member} missionCount={missions.length} />;
}