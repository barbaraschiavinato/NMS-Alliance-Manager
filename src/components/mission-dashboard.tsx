"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import {
  AllianceSidebar,
  DashboardTopbar,
  MissionHero,
  MissionMetrics,
} from "@/components/dashboard-chrome";
import { MissionForm, type StationOwnerOption } from "@/components/mission-form";
import { MissionTable, type MissionFilter } from "@/components/mission-table";
import { canViewMission, type Mission, type MissionInput } from "@/lib/missions";
import type { AllianceMember, AllianceSettings } from "@/lib/access-store";
import { AdminPanel } from "@/components/admin-panel";
import { MemberProfilePanel } from "@/components/member-profile-panel";
import { PlanetCard } from "@/components/planet-card";
import { isValidNmsFriendCode } from "@/lib/member-types";
import { planetSystemStatusKey, type MissionSystemStatus, type PlanetSystemStatuses } from "@/lib/planet-system-status";
import { useLocale } from "@/components/locale-provider";

const missionTypeLabels: Record<Mission["targetSpecialty"], string> = {
  all: "Tutti",
  builder: "Costruttori",
  ranger: "Ranger",
  explorer: "Esploratori",
  other: "Altro",
};

export function MissionDashboard({ currentMember, alliance: initialAlliance, initialSearch = "", sidebarStationCount, sidebarUserCount }: Readonly<{
  currentMember: AllianceMember;
  alliance: AllianceSettings;
  initialSearch?: string;
  sidebarStationCount: number;
  sidebarUserCount?: number;
}>) {
  const { t } = useLocale();
  const [member, setMember] = useState(currentMember);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loadingMissions, setLoadingMissions] = useState(true);
  const [planetStatuses, setPlanetStatuses] = useState<PlanetSystemStatuses>({});
  const [filter, setFilter] = useState<MissionFilter>("all");
  const [search, setSearch] = useState(initialSearch);
  const [dialogMission, setDialogMission] = useState<Mission | null>(null);
  const [planetMission, setPlanetMission] = useState<Mission | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [members, setMembers] = useState<AllianceMember[]>([]);
  const [stationOwners, setStationOwners] = useState<StationOwnerOption[]>([]);
  const [alliance, setAlliance] = useState(initialAlliance);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const canManage = member.role === "moderator" || member.role === "admin";
  const profileComplete = Boolean(member.nmsName.trim() && isValidNmsFriendCode(member.nmsCode) && member.platforms.length > 0 && member.specialty);

  useEffect(() => {
    fetch("/api/missions", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load missions.");
        setMissions(await response.json() as Mission[]);
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Unable to load missions."))
      .finally(() => setLoadingMissions(false));
    fetch("/api/planet-status", { cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error("Unable to read planet status.");
        if (!body || typeof body !== "object" || !("planets" in body) || !body.planets || typeof body.planets !== "object") {
          throw new Error("Invalid planet status data.");
        }
        setPlanetStatuses(body.planets as PlanetSystemStatuses);
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Unable to read planet status."));
    if (canManage) {
      fetch("/api/members", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Unable to load members.");
          setMembers(await response.json() as AllianceMember[]);
        })
        .catch(() => setMembers([]));
      fetch("/api/stations", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Unable to load station owners.");
          const body: unknown = await response.json();
          if (!body || typeof body !== "object" || !("stations" in body) || !Array.isArray(body.stations)) {
            throw new Error("Unable to load station owners.");
          }
          const options = body.stations.flatMap((value): StationOwnerOption[] => {
            if (!value || typeof value !== "object") return [];
            const station = value as Record<string, unknown>;
            return typeof station.portal === "string" &&
              typeof station.galaxy === "number" &&
              typeof station.ownerId === "string" &&
              typeof station.ownerName === "string"
              ? [{ portal: station.portal, galaxy: station.galaxy, ownerId: station.ownerId, ownerName: station.ownerName }]
              : [];
          });
          setStationOwners(options);
        })
        .catch(() => setStationOwners([]));
    }
  }, [canManage]);

  const availableMissions = canManage ? missions : missions.filter((mission) => canViewMission(mission, member));

  const counts = useMemo(() => {
    const waitingMissions = availableMissions.filter((mission) => mission.status === "pending");
    const isAssigned = (mission: Mission) => Boolean(mission.assignedMemberId || mission.assignedEmail || mission.assignedTo.trim());
    return {
      all: availableMissions.length,
      in_progress: availableMissions.filter((mission) => mission.status === "in_progress").length,
      pending: waitingMissions.length,
      pending_assigned: waitingMissions.filter(isAssigned).length,
      pending_unassigned: waitingMissions.filter((mission) => !isAssigned(mission)).length,
      completed: availableMissions.filter((mission) => mission.status === "completed").length,
    };
  }, [availableMissions]);

  const visibleMissions = useMemo(() => availableMissions
    .filter((mission) => {
      if (filter === "all") return true;
      const isAssigned = Boolean(mission.assignedMemberId || mission.assignedEmail || mission.assignedTo.trim());
      if (filter === "pending_assigned") return mission.status === "pending" && isAssigned;
      if (filter === "pending_unassigned") return mission.status === "pending" && !isAssigned;
      return mission.status === filter;
    })
    .filter((mission) => {
      const searchText = search.trim().toLowerCase();
      if (!searchText) return true;

      const searchableText = [
        mission.id,
        mission.title,
        mission.notes,
        mission.system,
        mission.assignedTo,
        mission.assignedEmail,
        mission.stationOwnerName,
        mission.createdByName,
        mission.createdByEmail,
        missionTypeLabels[mission.targetSpecialty],
      ].filter(Boolean).join(" ").toLowerCase();
      const textMatches = searchableText.includes(searchText);
      const normalizedSearch = search.replace(/[\s-]/g, "").toUpperCase();
      const normalizedAddress = mission.systemAddress.replace(/[\s-]/g, "").toUpperCase();
      return textMatches || normalizedAddress.includes(normalizedSearch);
    })
    , [availableMissions, filter, search]);

  async function saveMission(input: MissionInput) {
    const editing = dialogMission;
    const response = await fetch(editing ? `/api/missions/${editing.id}` : "/api/missions", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to save the mission.");
    if (editing) {
      const saved = body as Mission;
      setMissions((current) => current.map((mission) => mission.id === saved.id ? saved : mission));
      setNotice("Mission updated.");
      return;
    }

    const created = body as Mission[];
    setMissions((current) => [...created, ...current]);
    setNotice(created.length === 3
      ? "Created 3 missions: one each for Builders, Rangers, and Explorers."
      : "Mission added to the log.");
  }

  async function deleteMission(id: string) {
    const response = await fetch(`/api/missions/${id}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Deletion failed.");
    setMissions((current) => current.filter((mission) => mission.id !== id));
    setNotice("Mission deleted.");
  }

  async function claimMission(mission: Mission) {
    const response = await fetch(`/api/missions/${mission.id}/claim`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to claim the mission.");
    const claimed = body as Mission;
    setMissions((current) => current.map((item) => item.id === claimed.id ? claimed : item));
    setNotice("Mission claimed.");
  }

  async function completeMission(mission: Mission) {
    const response = await fetch(`/api/missions/${mission.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed", progress: 100 }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to complete the mission.");
    setMissions((current) => current.map((item) => item.id === mission.id ? body as Mission : item));
    setNotice("Mission completed.");
  }

  async function updateMissionProgress(mission: Mission, progress: number) {
    const status = progress === 100 ? "completed" : "in_progress";
    const response = await fetch(`/api/missions/${mission.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, progress }),
    });
    const body: unknown = await response.json();
    if (!response.ok || !body || typeof body !== "object" || !("id" in body) || body.id !== mission.id) {
      const message = body && typeof body === "object" && "error" in body ? body.error : null;
      throw new Error(typeof message === "string" ? message : t("errors.update_failed"));
    }
    setMissions((current) => current.map((item) => item.id === mission.id ? body as Mission : item));
  }

  async function togglePlanetSystemStatus(mission: Mission, status: MissionSystemStatus, checked: boolean) {
    const key = planetSystemStatusKey(mission.systemAddress, mission.galaxy);
    const currentStatuses = planetStatuses[key] ?? [];
    const nextStatuses = checked
      ? [...currentStatuses, status]
      : currentStatuses.filter((selected) => selected !== status);
    const response = await fetch("/api/planet-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portal: mission.systemAddress, galaxy: mission.galaxy, systemStatuses: nextStatuses }),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body ? body.error : null;
      throw new Error(typeof message === "string" ? message : "Unable to update planet status.");
    }
    const savedStatuses = body && typeof body === "object" && "systemStatuses" in body ? body.systemStatuses : null;
    if (!Array.isArray(savedStatuses)) throw new Error("Invalid planet status response.");
    setPlanetStatuses((current) => ({ ...current, [key]: savedStatuses }));
  }

  function openMission(mission: Mission | null) {
    setDialogMission(mission);
    setDialogOpen(true);
  }

  return (
    <main className="app-shell">
      <AllianceSidebar activeSection="missioni" currentMember={member} missionCount={missions.length} settings={alliance} stationCount={sidebarStationCount} userCount={sidebarUserCount} />
      <section className="main-panel" id="missioni">
        <DashboardTopbar currentMember={member} onAdminOpen={() => setAdminOpen(true)} onProfileOpen={() => setProfileOpen(true)} settings={alliance} />
        <MissionHero onCreate={() => openMission(null)} settings={alliance} showCreate={canManage} />
        <MissionMetrics counts={counts} missions={availableMissions} />
        <div className="content-wrap">
          {!profileComplete && <section className="profile-required-banner"><span><strong>{t("profile.complete_your_nms_profile")}</strong><small>{t("profile.enter_your_in_game_name_friend_code_platforms_and_specialty_to_claim_or_be_assigned_missions")}</small></span><button className="claim-button" onClick={() => setProfileOpen(true)} type="button">{t("profile.complete_profile")}</button></section>}
          <MissionTable
            counts={counts}
            filter={filter}
            missions={visibleMissions}
            currentMember={member}
            canManage={canManage}
            members={members}
            defaultView={alliance.defaultTableView}
            planetStatuses={planetStatuses}
            onClaim={(mission) => void claimMission(mission).catch((error: unknown) => setNotice(error instanceof Error ? error.message : t("errors.request_failed")))}
            onComplete={(mission) => void completeMission(mission).catch((error: unknown) => setNotice(error instanceof Error ? error.message : t("errors.request_failed")))}
            onUpdateProgress={async (mission, progress) => {
              try {
                await updateMissionProgress(mission, progress);
              } catch (error: unknown) {
                setNotice(error instanceof Error ? error.message : t("errors.request_failed"));
                throw error;
              }
            }}
            onToggleSystemStatus={(mission, status, checked) => void togglePlanetSystemStatus(mission, status, checked).catch((error: unknown) => setNotice(error instanceof Error ? error.message : t("errors.request_failed")))}
            onEdit={(mission) => openMission(mission)}
            onDeleteMission={(mission) => {
              if (!window.confirm(t("common.delete_title", { title: mission.title }))) return;
              void deleteMission(mission.id).catch((error: unknown) => setNotice(error instanceof Error ? error.message : t("errors.deletion_failed")));
            }}
            onOpenPlanet={setPlanetMission}
            onFilterChange={setFilter}
            onSearchChange={setSearch}
            search={search}
            searchInput={searchInput}
            loading={loadingMissions}
          />
        </div>
      </section>
      {notice && <output className="toast" aria-live="polite"><Check size={15} />{t(notice)}<button aria-label={t("common.close_notification")} onClick={() => setNotice("")} type="button"><X size={14} /></button></output>}
      {dialogOpen && <MissionForm
        members={members}
        mission={dialogMission}
        onClose={() => setDialogOpen(false)}
        onDelete={deleteMission}
        onSave={saveMission}
        onSystemStatusesSaved={(portal, galaxy, statuses) => setPlanetStatuses((current) => ({
          ...current,
          [planetSystemStatusKey(portal, galaxy)]: statuses,
        }))}
        stationOwners={stationOwners}
      />}
      {planetMission && <PlanetCard
        contextLabel={planetMission.system}
        missionDescription={planetMission.description}
        galaxy={planetMission.galaxy}
        key={planetMission.id}
        onClose={() => setPlanetMission(null)}
        portal={planetMission.systemAddress}
        title={planetMission.title}
      />}
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setAlliance} />}
      {profileOpen && <MemberProfilePanel member={member} onClose={() => setProfileOpen(false)} onSaved={(profile) => setMember((current) => ({ ...current, ...profile }))} />}
    </main>
  );
}