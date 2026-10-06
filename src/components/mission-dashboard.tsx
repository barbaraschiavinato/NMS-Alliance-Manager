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
import { initialMissions } from "@/lib/seed";
import { AdminPanel } from "@/components/admin-panel";
import { MemberProfilePanel } from "@/components/member-profile-panel";
import { PlanetCard } from "@/components/planet-card";
import { isValidNmsFriendCode } from "@/lib/member-types";
import { planetSystemStatusKey, type MissionSystemStatus, type PlanetSystemStatuses } from "@/lib/planet-system-status";

const missionTypeLabels: Record<Mission["targetSpecialty"], string> = {
  all: "Tutti",
  builder: "Costruttori",
  ranger: "Ranger",
  explorer: "Esploratori",
  other: "Altro",
};

export function MissionDashboard({ currentMember, initialSearch = "" }: Readonly<{
  currentMember: AllianceMember;
  initialSearch?: string;
}>) {
  const [member, setMember] = useState(currentMember);
  const [missions, setMissions] = useState(initialMissions);
  const [planetStatuses, setPlanetStatuses] = useState<PlanetSystemStatuses>({});
  const [filter, setFilter] = useState<MissionFilter>("Tutte");
  const [search, setSearch] = useState(initialSearch);
  const [dialogMission, setDialogMission] = useState<Mission | null>(null);
  const [planetMission, setPlanetMission] = useState<Mission | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [members, setMembers] = useState<AllianceMember[]>([]);
  const [stationOwners, setStationOwners] = useState<StationOwnerOption[]>([]);
  const [alliance, setAlliance] = useState<AllianceSettings>({ name: "", logoUrl: "", bannerUrl: "", discordUrl: "", telegramUrl: "", heroGradientMode: "full", defaultTableView: "list" });
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const canManage = member.role === "moderator" || member.role === "admin";
  const profileComplete = Boolean(member.nmsName.trim() && isValidNmsFriendCode(member.nmsCode) && member.platforms.length > 0 && member.specialty);

  useEffect(() => {
    fetch("/api/missions", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Archivio missioni non disponibile.");
        setMissions(await response.json() as Mission[]);
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Archivio missioni non disponibile."));
    fetch("/api/alliance", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Impossibile caricare l'alleanza.");
        setAlliance(await response.json() as AllianceSettings);
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Impossibile caricare l’alleanza."));
    fetch("/api/planet-status", { cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error("Impossibile caricare gli stati dei pianeti.");
        if (!body || typeof body !== "object" || !("planets" in body) || !body.planets || typeof body.planets !== "object") {
          throw new Error("Elenco stati pianeta non valido.");
        }
        setPlanetStatuses(body.planets as PlanetSystemStatuses);
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Impossibile caricare gli stati dei pianeti."));
    if (canManage) {
      fetch("/api/members", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Impossibile caricare i membri.");
          setMembers(await response.json() as AllianceMember[]);
        })
        .catch(() => setMembers([]));
      fetch("/api/stations", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Impossibile caricare i proprietari delle stazioni.");
          const body: unknown = await response.json();
          if (!body || typeof body !== "object" || !("stations" in body) || !Array.isArray(body.stations)) {
            throw new Error("Elenco stazioni non valido.");
          }
          const options = body.stations.flatMap((value): StationOwnerOption[] => {
            if (!value || typeof value !== "object") return [];
            const station = value as Record<string, unknown>;
            return typeof station.portal === "string" && typeof station.galaxy === "number" && typeof station.owner === "string"
              ? [{ portal: station.portal, galaxy: station.galaxy, owner: station.owner }]
              : [];
          });
          setStationOwners(options);
        })
        .catch(() => setStationOwners([]));
    }
  }, [canManage]);

  const availableMissions = canManage ? missions : missions.filter((mission) => canViewMission(mission, member));

  const counts = useMemo(() => {
    const waitingMissions = availableMissions.filter((mission) => mission.status === "In attesa");
    const isAssigned = (mission: Mission) => Boolean(mission.assignedEmail || mission.assignedTo.trim());
    return {
      Tutte: availableMissions.length,
      "In corso": availableMissions.filter((mission) => mission.status === "In corso").length,
      "In attesa": waitingMissions.length,
      "Attesa assegnate": waitingMissions.filter(isAssigned).length,
      "Attesa non assegnate": waitingMissions.filter((mission) => !isAssigned(mission)).length,
      Completata: availableMissions.filter((mission) => mission.status === "Completata").length,
    };
  }, [availableMissions]);

  const visibleMissions = useMemo(() => availableMissions
    .filter((mission) => {
      if (filter === "Tutte") return true;
      const isAssigned = Boolean(mission.assignedEmail || mission.assignedTo.trim());
      if (filter === "Attesa assegnate") return mission.status === "In attesa" && isAssigned;
      if (filter === "Attesa non assegnate") return mission.status === "In attesa" && !isAssigned;
      return mission.status === filter;
    })
    .filter((mission) => {
      const searchText = search.trim().toLowerCase();
      if (!searchText) return true;

      const searchableText = [
        mission.title,
        mission.system,
        mission.assignedTo,
        mission.assignedEmail,
        mission.stationOwnerName,
        mission.stationOwnerEmail,
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
    if (!response.ok) throw new Error(body.error ?? "Salvataggio non riuscito.");
    if (editing) {
      const saved = body as Mission;
      setMissions((current) => current.map((mission) => mission.id === saved.id ? saved : mission));
      setNotice("Missione aggiornata.");
      return;
    }

    const created = body as Mission[];
    setMissions((current) => [...created, ...current]);
    setNotice(created.length === 3
      ? "Create 3 missioni: una per Costruttori, Ranger ed Esploratori."
      : "Missione aggiunta al registro.");
  }

  async function deleteMission(id: string) {
    const response = await fetch(`/api/missions/${id}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Eliminazione non riuscita.");
    setMissions((current) => current.filter((mission) => mission.id !== id));
    setNotice("Missione eliminata.");
  }

  async function claimMission(mission: Mission) {
    const response = await fetch(`/api/missions/${mission.id}/claim`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Impossibile prendere la missione.");
    const claimed = body as Mission;
    setMissions((current) => current.map((item) => item.id === claimed.id ? claimed : item));
    setNotice("Missione assegnata a te.");
  }

  async function completeMission(mission: Mission) {
    const response = await fetch(`/api/missions/${mission.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Completata", progress: 100 }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Impossibile completare la missione.");
    setMissions((current) => current.map((item) => item.id === mission.id ? body as Mission : item));
    setNotice("Missione completata.");
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
      throw new Error(typeof message === "string" ? message : "Impossibile aggiornare lo stato del pianeta.");
    }
    const savedStatuses = body && typeof body === "object" && "systemStatuses" in body ? body.systemStatuses : null;
    if (!Array.isArray(savedStatuses)) throw new Error("Risposta dello stato pianeta non valida.");
    setPlanetStatuses((current) => ({ ...current, [key]: savedStatuses }));
  }

  function openMission(mission: Mission | null) {
    setDialogMission(mission);
    setDialogOpen(true);
  }

  return (
    <main className="app-shell">
      <AllianceSidebar activeSection="missioni" currentMember={member} missionCount={missions.length} settings={alliance} />
      <section className="main-panel" id="missioni">
        <DashboardTopbar currentMember={member} onAdminOpen={() => setAdminOpen(true)} onProfileOpen={() => setProfileOpen(true)} settings={alliance} />
        <MissionHero onCreate={() => openMission(null)} settings={alliance} showCreate={canManage} />
        <MissionMetrics counts={counts} missions={availableMissions} />
        <div className="content-wrap">
          {!profileComplete && <section className="profile-required-banner"><span><strong>Completa il profilo NMS</strong><small>Inserisci nome in gioco, codice amico, piattaforme e specializzazione per prendere missioni o essere assegnato.</small></span><button className="claim-button" onClick={() => setProfileOpen(true)} type="button">Completa profilo</button></section>}
          <MissionTable
            counts={counts}
            filter={filter}
            missions={visibleMissions}
            currentMember={member}
            canManage={canManage}
            members={members}
            defaultView={alliance.defaultTableView}
            planetStatuses={planetStatuses}
            onClaim={(mission) => void claimMission(mission).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Richiesta non riuscita."))}
            onComplete={(mission) => void completeMission(mission).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Richiesta non riuscita."))}
            onToggleSystemStatus={(mission, status, checked) => void togglePlanetSystemStatus(mission, status, checked).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Richiesta non riuscita."))}
            onEdit={(mission) => openMission(mission)}
            onDeleteMission={(mission) => {
              if (!window.confirm(`Eliminare "${mission.title}"?`)) return;
              void deleteMission(mission.id).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Eliminazione non riuscita."));
            }}
            onOpenPlanet={setPlanetMission}
            onFilterChange={setFilter}
            onSearchChange={setSearch}
            search={search}
            searchInput={searchInput}
          />
        </div>
      </section>
      {notice && <output className="toast" aria-live="polite"><Check size={15} />{notice}<button aria-label="Chiudi notifica" onClick={() => setNotice("")} type="button"><X size={14} /></button></output>}
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