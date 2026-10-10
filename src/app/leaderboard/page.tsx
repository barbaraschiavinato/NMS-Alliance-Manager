import { auth } from "@/auth";
import { GoogleLogin } from "@/components/google-login";
import { LeaderboardPage, type LeaderboardBoard } from "@/components/leaderboard-page";
import { PendingApproval } from "@/components/pending-approval";
import { getCurrentMember } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";
import { readMissions } from "@/lib/store";
import { coveredSpecialties } from "@/lib/missions";
import { missionSystemStatuses, missionSystemStatusRoles } from "@/lib/planet-system-status";
import { readPlanetSystemStatuses } from "@/lib/planet-system-status-store";
import { readAllStationPortals, readStationPortals } from "@/lib/stations-store";

export const dynamic = "force-dynamic";

export default async function LeaderboardRoute() {
  const accessData = await readAccessData();
  const allianceName = accessData.alliance.name;
  const allianceLogoUrl = accessData.alliance.logoUrl;
  const missingConfiguration = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ALLIANCE_ADMIN_EMAIL"]
    .filter((key) => !process.env[key]);
  if (missingConfiguration.length > 0) {
    return <GoogleLogin allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} missingConfiguration={missingConfiguration} />;
  }

  const session = await auth();
  if (!session?.user?.email) return <GoogleLogin allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;

  const member = await getCurrentMember({ allowPending: true, allowBlocked: true });
  if (!member) return <GoogleLogin allianceLogoUrl={allianceLogoUrl} allianceName={allianceName} />;
  if (member.membershipStatus !== "approved") return <PendingApproval member={member} />;

  const isModerator = member.role === "admin" || member.role === "moderator";
  const [missions, stations] = await Promise.all([
    readMissions(),
    isModerator ? readAllStationPortals() : readStationPortals(member.publicId),
  ]);
  const stationsByMember = new Map<string, number>();
  for (const station of await readAllStationPortals()) {
    stationsByMember.set(station.ownerId, (stationsByMember.get(station.ownerId) ?? 0) + 1);
  }
  const missionsByMember = new Map<string, number>();
  for (const mission of missions) {
    if (mission.status !== "completed" || !mission.assignedMemberId) continue;
    missionsByMember.set(mission.assignedMemberId, (missionsByMember.get(mission.assignedMemberId) ?? 0) + 1);
  }
  // Lo stato dei task non registra chi lo ha spuntato: il merito va all'assegnatario della missione del ruolo su quel pianeta.
  const planetStatuses = await readPlanetSystemStatuses();
  const tasksByMember = new Map<string, Map<string, number>>();
  for (const mission of missions) {
    const assigneeId = mission.assignedMemberId;
    const assignee = accessData.members.find((candidate) => candidate.publicId === assigneeId);
    if (!assigneeId || !assignee) continue;
    const statuses = planetStatuses[`${mission.galaxy}:${mission.systemAddress.toUpperCase()}`] ?? [];
    for (const task of statuses) {
      if (task === "data_error") continue;
      if (!coveredSpecialties(mission.targetSpecialty).includes(missionSystemStatusRoles[task])) continue;
      const counts = tasksByMember.get(task) ?? new Map<string, number>();
      counts.set(assigneeId, (counts.get(assigneeId) ?? 0) + 1);
      tasksByMember.set(task, counts);
    }
  }
  const buildEntries = (counts: ReadonlyMap<string, number>) => accessData.members
    .filter((candidate) => candidate.membershipStatus === "approved" && counts.has(candidate.publicId))
    .map((candidate) => ({
      publicId: candidate.publicId,
      name: candidate.nmsName || candidate.name,
      image: candidate.image,
      specialty: candidate.specialty,
      count: counts.get(candidate.publicId) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const boards: LeaderboardBoard[] = [
    { id: "stations", title: "leaderboard.board_stations", empty: "leaderboard.empty_stations", entries: buildEntries(stationsByMember) },
    { id: "missions", title: "leaderboard.board_missions", empty: "leaderboard.empty_missions", entries: buildEntries(missionsByMember) },
    ...(["ranger", "explorer", "builder"] as const).map((role) => ({
      id: `${role}_tasks`,
      title: `common.${role}`,
      empty: "leaderboard.empty_task",
      role,
      entries: [],
      sections: missionSystemStatuses.filter((task) => task !== "data_error" && missionSystemStatusRoles[task] === role).map((task) => ({
        id: task,
        title: task === "mapped" ? "leaderboard.task_mapped" : `system.${task}`,
        entries: buildEntries(tasksByMember.get(task) ?? new Map<string, number>()),
      })),
    })),
  ];

  return <LeaderboardPage
    alliance={accessData.alliance}
    currentMember={member}
    boards={boards}
    missionCount={missions.length}
    stationCount={stations.length}
    offlineCount={isModerator ? accessData.members.filter((item) => item.offline).length : undefined}
    userCount={isModerator ? accessData.members.filter((item) => !item.offline).length : undefined}
  />;
}
