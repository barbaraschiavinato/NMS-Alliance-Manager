"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Ban, Check, CircleAlert, CircleX, Crosshair, LayoutGrid, List, Orbit, Search, Trash2, UserRoundCheck } from "lucide-react";
import type { AllianceMember, AllianceSettings, MemberRole, MemberSpecialty, MembershipStatus } from "@/lib/member-types";
import { AllianceSidebar, DashboardTopbar, MissionHero } from "@/components/dashboard-chrome";
import { AdminPanel } from "@/components/admin-panel";
import { MemberProfilePanel } from "@/components/member-profile-panel";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useLocale } from "@/components/locale-provider";

type MemberFilter = "all" | MembershipStatus;
type ManagedMember = AllianceMember & { protectedAdmin: boolean };

const roleLabels: Record<MemberRole, string> = { user: "Utente", moderator: "Moderatore", admin: "Admin" };
const statusLabels: Record<MembershipStatus, string> = { pending: "In attesa", approved: "Approvato", blocked: "Bloccato" };
const specialtyLabels: Record<MemberSpecialty, string> = { builder: "Costruttore", ranger: "Ranger", explorer: "Esploratore" };

function updateNotice(update: { membershipStatus: MembershipStatus } | { role: MemberRole }) {
  if ("role" in update) return `Ruolo aggiornato: ${roleLabels[update.role]}.`;
  if (update.membershipStatus === "approved") return "Utente approvato.";
  if (update.membershipStatus === "blocked") return "Utente bloccato.";
  return "Utente in attesa di approvazione.";
}

function MemberActions({ member, canChangeRole, currentMemberEmail, onStatus, onRole, onDelete }: Readonly<{
  member: ManagedMember;
  canChangeRole: boolean;
  currentMemberEmail: string;
  onStatus: (email: string, status: MembershipStatus) => void;
  onRole: (email: string, role: MemberRole) => void;
  onDelete: (member: AllianceMember) => void;
}>) {
  const { t } = useLocale();
  const canManage = canChangeRole || member.role === "user";
  const isCurrentMember = member.email.toLowerCase() === currentMemberEmail.toLowerCase();
  if (member.protectedAdmin || isCurrentMember || !canManage) return null;

  if (member.role === "admin") return <div className="member-page-actions">
    <select aria-label={t("Ruolo di {email}", { email: member.email })} onChange={(event) => onRole(member.email, event.target.value as MemberRole)} value={member.role}>
      {(Object.keys(roleLabels) as MemberRole[]).map((role) => <option key={role} value={role}>{t(roleLabels[role])}</option>)}
    </select>
    <button aria-label={t("Elimina {email}", { email: member.email })} className="member-icon-action delete-member" data-tooltip={t("Elimina admin")} onClick={() => onDelete(member)} type="button"><Trash2 size={14} /></button>
  </div>;

  return (
    <div className="member-page-actions">
      {canChangeRole && <select aria-label={t("Ruolo di {email}", { email: member.email })} onChange={(event) => onRole(member.email, event.target.value as MemberRole)} value={member.role}>{(Object.keys(roleLabels) as MemberRole[]).map((role) => <option key={role} value={role}>{t(roleLabels[role])}</option>)}</select>}
      {member.membershipStatus === "pending" && <button aria-label={t("Approva {email}", { email: member.email })} className="member-icon-action approval-button" data-tooltip={t("Approva utente")} onClick={() => onStatus(member.email, "approved")} type="button"><Check size={14} /></button>}
      {member.membershipStatus === "approved" && <button aria-label={t("Revoca approvazione a {email}", { email: member.email })} className="member-icon-action approval-button revoke-approval" data-tooltip={t("Revoca approvazione")} onClick={() => onStatus(member.email, "pending")} type="button"><CircleX size={14} /></button>}
      {member.membershipStatus === "blocked"
        ? <button aria-label={t("Sblocca {email}", { email: member.email })} className="member-icon-action approval-button" data-tooltip={t("Sblocca utente")} onClick={() => onStatus(member.email, "pending")} type="button"><UserRoundCheck size={14} /></button>
        : <button aria-label={t("Blocca {email}", { email: member.email })} className="member-icon-action block-member" data-tooltip={t("Blocca utente")} onClick={() => onStatus(member.email, "blocked")} type="button"><Ban size={14} /></button>}
      <button aria-label={t("Elimina {email}", { email: member.email })} className="member-icon-action delete-member" data-tooltip={t("Elimina utente")} onClick={() => onDelete(member)} type="button"><Trash2 size={14} /></button>
    </div>
  );
}

export function MembersPage({ currentMember, alliance, missionCount, sidebarStationCount, sidebarUserCount }: Readonly<{
  currentMember: AllianceMember;
  alliance: AllianceSettings;
  missionCount: number;
  sidebarStationCount: number;
  sidebarUserCount: number;
}>) {
  const { t } = useLocale();
  const [pageMember, setPageMember] = useState(currentMember);
  const [allianceSettings, setAllianceSettings] = useState(alliance);
  const [members, setMembers] = useState<ManagedMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [viewOverride, setViewOverride] = useState<"list" | "cards" | null>(null);
  const viewMode = viewOverride ?? allianceSettings.defaultTableView;
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const canChangeRole = pageMember.role === "admin";

  useEffect(() => {
    fetch("/api/admin/members", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Impossibile caricare la lista utenti.");
        setMembers(body as ManagedMember[]);
      })
      .catch((error_: unknown) => setError(error_ instanceof Error ? error_.message : "Impossibile caricare la lista utenti."))
      .finally(() => setLoadingMembers(false));
  }, []);

  const counts = useMemo(() => ({
    all: members.length,
    pending: members.filter((member) => member.membershipStatus === "pending").length,
    approved: members.filter((member) => member.membershipStatus === "approved").length,
    blocked: members.filter((member) => member.membershipStatus === "blocked").length,
  }), [members]);

  const visibleMembers = useMemo(() => members
    .filter((member) => filter === "all" || member.membershipStatus === filter)
    .filter((member) => `${member.name} ${member.nmsName} ${member.email} ${member.nmsCode} ${member.specialty ? specialtyLabels[member.specialty] : ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [filter, members, search]);
  let emptyMessage = t("Nessun utente in questo filtro.");
  if (counts.all === 0) emptyMessage = t("Nessun utente registrato: i membri compariranno dopo il primo accesso con Google.");
  else if (filter === "pending") emptyMessage = t("Nessuna richiesta in attesa di approvazione.");

  async function patchMember(email: string, update: { membershipStatus: MembershipStatus } | { role: MemberRole }) {
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ...update }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Aggiornamento non riuscito.");
      setMembers((current) => current.map((member) => member.email === email ? { ...member, ...update } : member));
      setNotice(updateNotice(update));
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : "Aggiornamento non riuscito.");
    }
  }

  async function deleteMember(member: AllianceMember) {
    if (!window.confirm(t("Eliminare {member} dall’alleanza? Un nuovo accesso richiederà una nuova approvazione.", { member: member.nmsName || member.email }))) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: member.email }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Eliminazione non riuscita.");
      setMembers((current) => current.filter((item) => item.email !== member.email));
      setNotice("Utente eliminato dall’alleanza.");
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : "Eliminazione non riuscita.");
    }
  }

  return (
    <div className="app-shell">
      <AllianceSidebar activeSection="utenti" currentMember={pageMember} missionCount={missionCount} settings={allianceSettings} stationCount={sidebarStationCount} userCount={loadingMembers ? sidebarUserCount : members.length} />
      <section className="main-panel">
        <DashboardTopbar currentMember={pageMember} onAdminOpen={() => setAdminOpen(true)} onProfileOpen={() => setProfileOpen(true)} sectionTitle="Utenti" settings={allianceSettings} />
        <MissionHero
          description="Approva le richieste, gestisci gli accessi e consulta i profili NMS."
          settings={allianceSettings}
          showCreate={false}
          title="Utenti"
        />
        <section aria-label={t("Stato utenti")} className="metrics-row">
          <div className="metrics-inner">
            <div className="metric"><span className="metric-label">{t("RICHIESTE IN ATTESA")}</span><strong>{counts.pending}</strong></div>
            <div className="metric"><span className="metric-label">{t("APPROVATI")}</span><strong>{counts.approved}</strong></div>
            <div className="metric"><span className="metric-label">{t("BLOCCATI")}</span><strong>{counts.blocked}</strong></div>
            <div className="metric"><span className="metric-label">{t("TOTALE")}</span><strong>{counts.all}</strong></div>
          </div>
        </section>
        <main className="content-wrap">
      <section className="members-list-section">
        <div className="members-toolbar">
          <div className="member-filter-tabs" role="tablist" aria-label={t("Filtra utenti per stato")}>
            {(["pending", "approved", "blocked", "all"] as MemberFilter[]).map((status) => <button aria-selected={filter === status} className={filter === status ? "member-filter-tab selected" : "member-filter-tab"} key={status} onClick={() => setFilter(status)} role="tab" type="button">{t(status === "all" ? "Tutti" : statusLabels[status])}<span>{counts[status]}</span></button>)}
          </div>
          <label className="search-field member-search"><Search size={15} /><input aria-label={t("Cerca utenti")} onChange={(event) => setSearch(event.target.value)} placeholder={t("Cerca nome, email o codice")} value={search} /></label>
          <div aria-label={t("Vista utenti")} className="view-toggle" role="group">
            <button aria-label={t("Vista lista")} aria-pressed={viewMode === "list"} className={viewMode === "list" ? "selected" : ""} onClick={() => setViewOverride("list")} title={t("Vista lista")} type="button"><List size={15} /></button>
            <button aria-label={t("Vista schede")} aria-pressed={viewMode === "cards"} className={viewMode === "cards" ? "selected" : ""} onClick={() => setViewOverride("cards")} title={t("Vista schede")} type="button"><LayoutGrid size={15} /></button>
          </div>
        </div>

        {error && <p className="form-error"><CircleAlert size={15} />{t(error)}</p>}
        {notice && <p className="address-validation address-valid"><Check size={14} />{t(notice)}</p>}

        {loadingMembers ? <LoadingSpinner /> : viewMode === "list" ? <div className="members-table-wrap">
          <table className="members-table">
            <thead><tr><th>{t("MEMBRO")}</th><th>{t("CODICE AMICO")}</th><th>{t("PIATTAFORME")}</th><th>{t("SPECIALIZZAZIONE")}</th><th>{t("STATO")}</th><th>{t("RUOLO")}</th><th>{t("AZIONI")}</th></tr></thead>
            <tbody>
              {visibleMembers.map((member) => <tr key={member.email}>
                <td><div className="member-page-identity"><span className="member-admin-avatar">{member.image ? <span style={{ backgroundImage: `url("${member.image}")` }} /> : (member.nmsName || member.name).slice(0, 1).toUpperCase()}</span><span><strong>{member.nmsName || t("Nome NMS da completare")}</strong><small>{member.email}</small></span></div></td>
                <td className="member-code-cell">{member.nmsCode || t("Da completare")}</td>
                <td>{member.platforms.length ? member.platforms.join(", ") : t("Da selezionare")}</td>
                <td>{member.specialty ? t(specialtyLabels[member.specialty]) : t("Da scegliere")}</td>
                <td>{member.protectedAdmin
                  ? <span className="badge badge--protected">{t("Protetto")}</span>
                  : <span className={`badge badge--member-status badge--member-status-${member.membershipStatus}`}>{t(statusLabels[member.membershipStatus])}</span>}</td>
                <td>{t(roleLabels[member.role])}</td>
                <td><MemberActions canChangeRole={canChangeRole} currentMemberEmail={pageMember.email} member={member} onDelete={(target) => void deleteMember(target)} onRole={(email, role) => void patchMember(email, { role })} onStatus={(email, membershipStatus) => void patchMember(email, { membershipStatus })} /></td>
              </tr>)}
              {visibleMembers.length === 0 && <tr><td className="members-empty" colSpan={7}>{emptyMessage}</td></tr>}
            </tbody>
          </table>
        </div> : <div className="member-card-grid">
          {visibleMembers.map((member) => <article className="member-card" key={member.email}>
            <div className="member-card-heading">
              <div className="member-page-identity">
                <span className="member-admin-avatar">{member.image ? <span style={{ backgroundImage: `url("${member.image}")` }} /> : (member.nmsName || member.name).slice(0, 1).toUpperCase()}</span>
                <span><strong>{member.nmsName || t("Nome NMS da completare")}</strong><small>{member.email}</small></span>
              </div>
              {member.protectedAdmin
                ? <span className="badge badge--protected">{t("Protetto")}</span>
                : <span className={`badge badge--member-status badge--member-status-${member.membershipStatus}`}>{t(statusLabels[member.membershipStatus])}</span>}
            </div>
            <dl className="member-card-details">
              <div><dt>{t("Codice amico")}</dt><dd>{member.nmsCode || t("Da completare")}</dd></div>
              <div><dt>{t("Piattaforme")}</dt><dd>{member.platforms.length ? member.platforms.join(", ") : t("Da selezionare")}</dd></div>
              <div><dt>{t("Specializzazione")}</dt><dd>{member.specialty ? t(specialtyLabels[member.specialty]) : t("Da scegliere")}</dd></div>
              <div><dt>{t("Ruolo")}</dt><dd>{t(roleLabels[member.role])}</dd></div>
            </dl>
            <div className="member-card-actions">
              <div className="member-page-actions">
                <Link aria-label={t("Cerca missioni di {member}", { member: member.nmsName || member.email })} className="member-icon-action" data-tooltip={t("Missioni dell’utente")} href={`/?search=${encodeURIComponent(member.email)}`}><Crosshair size={14} /></Link>
                <Link aria-label={t("Cerca stazioni di {member}", { member: member.nmsName || member.email })} className="member-icon-action" data-tooltip={t("Stazioni dell’utente")} href={`/stations?search=${encodeURIComponent(member.email)}`}><Orbit size={14} /></Link>
              </div>
              <MemberActions canChangeRole={canChangeRole} currentMemberEmail={pageMember.email} member={member} onDelete={(target) => void deleteMember(target)} onRole={(email, role) => void patchMember(email, { role })} onStatus={(email, membershipStatus) => void patchMember(email, { membershipStatus })} />
            </div>
          </article>)}
          {visibleMembers.length === 0 && <p className="member-cards-empty">{emptyMessage}</p>}
        </div>}
        <footer className="members-list-footer">{loadingMembers ? t("Caricamento utenti") : t("Visualizzati {visible} di {total} utenti", { visible: visibleMembers.length, total: counts.all })}</footer>
      </section>
        </main>
      </section>
      {adminOpen && pageMember.role === "admin" && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setAllianceSettings} />}
      {profileOpen && <MemberProfilePanel member={pageMember} onClose={() => setProfileOpen(false)} onSaved={(profile) => setPageMember((current) => ({ ...current, ...profile }))} />}
    </div>
  );
}