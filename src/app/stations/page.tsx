import { auth } from "@/auth";
import { GoogleLogin } from "@/components/google-login";
import { PendingApproval } from "@/components/pending-approval";
import { StationsPage } from "@/components/stations-page";
import { getCurrentMember } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";
import { readMissions } from "@/lib/store";
import { readAllStationPortals, readStationPortals } from "@/lib/stations-store";

export const dynamic = "force-dynamic";

export default async function StationsRoute({ searchParams }: Readonly<{
  searchParams: Promise<{
    search?: string | string[];
    portal?: string | string[];
    galaxy?: string | string[];
    ownerId?: string | string[];
  }>;
}>) {
  const accessData = await readAccessData();
  const allianceName = accessData.alliance.name;
  const allianceLogoUrl = accessData.alliance.logoUrl;
  const missingConfiguration = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ALLIANCE_ADMIN_EMAIL"]
    .filter((key) => !process.env[key]);
  if (missingConfiguration.length > 0) return <GoogleLogin allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} missingConfiguration={missingConfiguration} />;

  const session = await auth();
  if (!session?.user?.email) return <GoogleLogin allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;

  const member = await getCurrentMember({ allowPending: true, allowBlocked: true });
  if (!member) return <GoogleLogin allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;
  if (member.membershipStatus !== "approved") return <PendingApproval member={member} />;

  const [missions, stations] = await Promise.all([
    readMissions(),
    member.role === "admin" || member.role === "moderator"
      ? readAllStationPortals()
      : readStationPortals(member.publicId),
  ]);
  const params = await searchParams;
  const initialSearch = typeof params.search === "string" ? params.search.slice(0, 254) : "";
  const portal = typeof params.portal === "string" ? params.portal.toUpperCase() : "";
  const galaxy = typeof params.galaxy === "string" && /^\d+$/.test(params.galaxy) ? Number(params.galaxy) : -1;
  const ownerId = typeof params.ownerId === "string" ? params.ownerId : "";
  const initialStation = /^[0-9A-F]{12}$/.test(portal) && Number.isInteger(galaxy) && galaxy >= 0 && galaxy <= 255 && ownerId
    ? { portal, galaxy, ownerId }
    : null;
  return <StationsPage
    alliance={accessData.alliance}
    currentMember={member}
    initialSearch={initialSearch}
    initialStation={initialStation}
    missionCount={missions.length}
    sidebarStationCount={stations.length}
    sidebarOfflineCount={member.role === "admin" || member.role === "moderator" ? accessData.members.filter((item) => item.offline).length : undefined}
    sidebarUserCount={member.role === "admin" || member.role === "moderator" ? accessData.members.filter((item) => !item.offline).length : undefined}
  />;
}
