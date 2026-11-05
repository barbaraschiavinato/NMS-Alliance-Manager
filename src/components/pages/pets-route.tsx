import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { LoginScreen } from "@/components/pages/login-screen";
import { PetsPage, type PetDetail } from "@/components/pages/pets-page";
import { PendingApproval } from "@/components/pages/pending-approval";
import { getMissingAuthConfiguration } from "@/lib/auth/local-auth";
import { getCurrentMember } from "@/lib/auth/authorization";
import { readAccessData } from "@/lib/members/access-store";
import { readMissions } from "@/lib/missions/store";
import { readPets } from "@/lib/pets/pets-store";
import { parseDetailOrigin } from "@/lib/navigation/detail-links";
import { loadPlanetDetail } from "@/lib/planets/planet-detail";
import { readVisibleStationPortals } from "@/lib/stations/visible-stations";

export async function renderPetsRoute({
  detailId,
  searchParams = Promise.resolve({}),
}: Readonly<{
  detailId?: string;
  searchParams?: Promise<{ from?: string | string[] }>;
}> = {}) {
  const accessData = await readAccessData();
  const allianceName = accessData.alliance.name;
  const allianceLogoUrl = accessData.alliance.logoUrl;
  const missingConfiguration = getMissingAuthConfiguration();
  if (missingConfiguration.length > 0) {
    return (
      <LoginScreen
        allianceLogoUrl={allianceLogoUrl}
        allianceName={allianceName}
        missingConfiguration={missingConfiguration}
      />
    );
  }
  const session = await auth();
  if (!session?.user?.email) return <LoginScreen allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;
  const member = await getCurrentMember({ allowPending: true, allowBlocked: true });
  if (!member) return <LoginScreen allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;
  if (member.membershipStatus !== "approved") return <PendingApproval member={member} />;

  const pet = detailId === undefined ? undefined : (await readPets()).find((entry) => entry.id === detailId);
  if (detailId !== undefined && !pet) notFound();
  const [missions, stations] = await Promise.all([readMissions(), readVisibleStationPortals(member)]);
  const isModerator = member.role === "admin" || member.role === "moderator";
  let detail: PetDetail | undefined;
  if (pet) {
    const params = await searchParams;
    detail = {
      id: pet.id,
      origin: parseDetailOrigin(params.from, "pets"),
      ...(await loadPlanetDetail({
        member,
        members: accessData.members,
        missions,
        stations,
        target: pet,
        origin: "pets",
      })),
    };
  }
  return (
    <PetsPage
      alliance={accessData.alliance}
      currentMember={member}
      detail={detail}
      missionCount={missions.length}
      stationCount={
        isModerator ? stations.length : stations.filter((station) => station.ownerId === member.publicId).length
      }
      offlineCount={isModerator ? accessData.members.filter((entry) => entry.offline).length : undefined}
      userCount={isModerator ? accessData.members.filter((entry) => !entry.offline).length : undefined}
    />
  );
}
