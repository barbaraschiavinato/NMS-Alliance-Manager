import { auth } from "@/auth";
import { GoogleLogin } from "@/components/pages/google-login";
import { LeaderboardPage, type LeaderboardBoard } from "@/components/pages/leaderboard-page";
import { PendingApproval } from "@/components/pages/pending-approval";
import { getCurrentMember } from "@/lib/authorization";
import { readAccessData } from "@/lib/access-store";
import { readMissions } from "@/lib/store";
import { coveredSpecialties } from "@/lib/missions";
import { missionSystemStatuses, missionSystemStatusRoles } from "@/lib/planet-system-status";
import { readPlanetSystemStatuses } from "@/lib/planet-system-status-store";
import { readAlmanacCache } from "@/lib/almanac-store";
import { getSystemPlanetAddresses } from "@/lib/planet-addresses";
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
  const allStations = await readAllStationPortals();
  for (const station of allStations) {
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
  const creditedTasks = new Set<string>();
  const addTask = (task: string, memberId: string) => {
    const counts = tasksByMember.get(task) ?? new Map<string, number>();
    counts.set(memberId, (counts.get(memberId) ?? 0) + 1);
    tasksByMember.set(task, counts);
  };
  for (const mission of missions) {
    const assigneeId = mission.assignedMemberId;
    const assignee = accessData.members.find((candidate) => candidate.publicId === assigneeId);
    if (!assigneeId || !assignee) continue;
    const statuses = planetStatuses[`${mission.galaxy}:${mission.systemAddress.toUpperCase()}`] ?? [];
    for (const task of statuses) {
      if (task === "data_error") continue;
      if (!coveredSpecialties(mission.targetSpecialty).includes(missionSystemStatusRoles[task])) continue;
      const creditKey = `${mission.galaxy}:${mission.systemAddress.toUpperCase()}:${task}`;
      if (!creditedTasks.has(creditKey)) addTask(task, assigneeId);
      creditedTasks.add(creditKey);
    }
  }
  // Senza una missione che copra il task, il merito va allo scopritore della stazione.
  for (const station of allStations) {
    for (const task of planetStatuses[`${station.galaxy}:${station.portal.toUpperCase()}`] ?? []) {
      if (task === "data_error" || creditedTasks.has(`${station.galaxy}:${station.portal.toUpperCase()}:${task}`)) continue;
      addTask(task, station.ownerId);
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
  const approvedMembers = accessData.members.filter((candidate) => candidate.membershipStatus === "approved");
  const completedTasks = Object.values(planetStatuses).reduce((total, statuses) => total + statuses.filter((task) => task !== "data_error").length, 0);
  // Pianeti dei sistemi dell'alleanza già presenti nella cache dell'almanacco, senza chiamate di rete.
  const systems = new Map<string, { portal: string; galaxy: number }>();
  for (const item of [...missions.map((mission) => ({ portal: mission.systemAddress, galaxy: mission.galaxy })), ...allStations]) {
    systems.set(`${item.portal.slice(1).toUpperCase()}:${item.galaxy}`, { portal: item.portal, galaxy: item.galaxy });
  }
  const almanacCache = await readAlmanacCache();
  const planetCounts = await Promise.all([...systems.values()].map(async (system) => {
    try {
      return (await getSystemPlanetAddresses(system.portal, system.galaxy))
        .filter((planet) => almanacCache(planet.portal, system.galaxy)).length;
    } catch {
      return 0;
    }
  }));
  const planetCount = planetCounts.reduce((total, count) => total + count, 0);
  const boards: LeaderboardBoard[] = [
    {
      id: "alliance_stats",
      title: "leaderboard.board_alliance",
      empty: "",
      entries: [],
      stats: [
        { label: "leaderboard.stat_stations", value: allStations.length },
        { label: "leaderboard.stat_missions", value: missions.length },
        { label: "leaderboard.stat_missions_completed", value: missions.filter((mission) => mission.status === "completed").length },
        { label: "leaderboard.stat_tasks", value: completedTasks },
        { label: "leaderboard.stat_planets", value: planetCount },
        { label: "leaderboard.stat_members", value: approvedMembers.filter((candidate) => !candidate.offline).length },
      ],
    },
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
