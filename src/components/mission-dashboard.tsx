"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import {
  AllianceSidebar,
  DashboardFooter,
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

export function MissionDashboard({ currentMember }: Readonly<{ currentMember: AllianceMember }>) {
  const [member, setMember] = useState(currentMember);
  const [missions, setMissions] = useState(initialMissions);
  const [filter, setFilter] = useState<MissionFilter>("Tutte");
  const [search, setSearch] = useState("");
  const [dialogMission, setDialogMission] = useState<Mission | null>(null);
  const [planetMission, setPlanetMission] = useState<Mission | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [members, setMembers] = useState<AllianceMember[]>([]);
  const [stationOwners, setStationOwners] = useState<StationOwnerOption[]>([]);
  const [alliance, setAlliance] = useState<AllianceSettings>({ name: "Nomad Syndicate", logoUrl: "", bannerUrl: "" });
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
    .filter((mission) => `${mission.title} ${mission.system} ${mission.assignedTo}`.toLowerCase().includes(search.toLowerCase()))
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

  function openMission(mission: Mission | null) {
    setDialogMission(mission);
    setDialogOpen(true);
  }

  return (
    <main className="app-shell">
      <AllianceSidebar activeSection="missioni" currentMember={member} missionCount={missions.length} settings={alliance} />
      <section className="main-panel" id="missioni">
        <DashboardTopbar currentMember={member} onAdminOpen={() => setAdminOpen(true)} onProfileOpen={() => setProfileOpen(true)} />
        <div className="content-wrap">
          {!profileComplete && <section className="profile-required-banner"><span><strong>Completa il profilo NMS</strong><small>Inserisci nome in gioco, codice amico, piattaforme e specializzazione per prendere missioni o essere assegnato.</small></span><button className="claim-button" onClick={() => setProfileOpen(true)} type="button">Completa profilo</button></section>}
          <MissionHero onCreate={() => openMission(null)} settings={alliance} showCreate={canManage} />
          <MissionMetrics counts={counts} missions={availableMissions} />
          <MissionTable
            counts={counts}
            filter={filter}
            missions={visibleMissions}
            currentMember={member}
            canManage={canManage}
            onClaim={(mission) => void claimMission(mission).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Richiesta non riuscita."))}
            onComplete={(mission) => void completeMission(mission).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Richiesta non riuscita."))}
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
          <DashboardFooter />
        </div>
      </section>
      {notice && <output className="toast" aria-live="polite"><Check size={15} />{notice}<button aria-label="Chiudi notifica" onClick={() => setNotice("")} type="button"><X size={14} /></button></output>}
      {dialogOpen && <MissionForm members={members} mission={dialogMission} onClose={() => setDialogOpen(false)} onDelete={deleteMission} onSave={saveMission} stationOwners={stationOwners} />}
      {planetMission && <PlanetCard key={planetMission.id} contextLabel={planetMission.system} galaxy={planetMission.galaxy} onClose={() => setPlanetMission(null)} portal={planetMission.systemAddress} title={planetMission.title} />}
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setAlliance} />}
      {profileOpen && <MemberProfilePanel member={member} onClose={() => setProfileOpen(false)} onSaved={(profile) => setMember((current) => ({ ...current, ...profile }))} />}
    </main>
  );
}