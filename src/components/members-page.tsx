"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Ban, Check, CircleAlert, Search, Trash2, UserRoundCheck } from "lucide-react";
import type { AllianceMember, AllianceSettings, MemberRole, MemberSpecialty, MembershipStatus } from "@/lib/member-types";
import { AllianceSidebar, DashboardTopbar } from "@/components/dashboard-chrome";
import { AdminPanel } from "@/components/admin-panel";
import { MemberProfilePanel } from "@/components/member-profile-panel";

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
  const canManage = canChangeRole || member.role === "user";
  if (!canManage || member.protectedAdmin || member.email.toLowerCase() === currentMemberEmail.toLowerCase()) {
    return <span className="role-lock">Protetto</span>;
  }

  if (member.role === "admin") return <div className="member-page-actions">
    <select aria-label={`Ruolo di ${member.email}`} onChange={(event) => onRole(member.email, event.target.value as MemberRole)} value={member.role}>
      {(Object.keys(roleLabels) as MemberRole[]).map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
    </select>
    <button aria-label={`Elimina ${member.email}`} className="member-icon-action delete-member" onClick={() => onDelete(member)} title="Elimina admin" type="button"><Trash2 size={14} /></button>
  </div>;

  return (
    <div className="member-page-actions">
      {member.membershipStatus === "pending" && <button className="approval-button" onClick={() => onStatus(member.email, "approved")} type="button">Approva</button>}
      {member.membershipStatus === "approved" && <button className="approval-button revoke-approval" onClick={() => onStatus(member.email, "pending")} type="button">Revoca</button>}
      {member.membershipStatus === "blocked"
        ? <button className="approval-button" onClick={() => onStatus(member.email, "pending")} type="button"><UserRoundCheck size={14} /> Sblocca</button>
        : <button aria-label={`Blocca ${member.email}`} className="member-icon-action block-member" onClick={() => onStatus(member.email, "blocked")} title="Blocca" type="button"><Ban size={14} /></button>}
      {canChangeRole && <select aria-label={`Ruolo di ${member.email}`} onChange={(event) => onRole(member.email, event.target.value as MemberRole)} value={member.role}>{(Object.keys(roleLabels) as MemberRole[]).map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select>}
      <button aria-label={`Elimina ${member.email}`} className="member-icon-action delete-member" onClick={() => onDelete(member)} title="Elimina" type="button"><Trash2 size={14} /></button>
    </div>
  );
}

export function MembersPage({ currentMember, alliance, missionCount }: Readonly<{ currentMember: AllianceMember; alliance: AllianceSettings; missionCount: number }>) {
  const [pageMember, setPageMember] = useState(currentMember);
  const [allianceSettings, setAllianceSettings] = useState(alliance);
  const [members, setMembers] = useState<ManagedMember[]>([]);
  const [filter, setFilter] = useState<MemberFilter>("all");
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
      .catch((error_: unknown) => setError(error_ instanceof Error ? error_.message : "Impossibile caricare la lista utenti."));
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
  let emptyMessage = "Nessun utente in questo filtro.";
  if (counts.all === 0) emptyMessage = "Nessun utente registrato: i membri compariranno dopo il primo accesso con Google.";
  else if (filter === "pending") emptyMessage = "Nessuna richiesta in attesa di approvazione.";

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
    if (!window.confirm(`Eliminare ${member.nmsName || member.email} dall’alleanza? Un nuovo accesso richiederà una nuova approvazione.`)) return;
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
      <AllianceSidebar activeSection="utenti" currentMember={pageMember} missionCount={missionCount} />
      <section className="main-panel">
        <DashboardTopbar currentMember={pageMember} onAdminOpen={() => setAdminOpen(true)} onProfileOpen={() => setProfileOpen(true)} sectionTitle="Utenti" settings={allianceSettings} />
        <main className="members-page">
          <header className="members-page-header">
            <Link aria-label="Torna alle missioni" className="members-back" href="/"><ArrowLeft size={16} /> Missioni</Link>
            <span className="eyebrow">GESTIONE ALLEANZA</span>
            <h1>Utenti<span>.</span></h1>
            <p>Approva le richieste, gestisci gli accessi e consulta i profili NMS.</p>
          </header>

      <section aria-label="Stato utenti" className="member-counts">
        <div><span>RICHIESTE IN ATTESA</span><strong>{counts.pending}</strong></div>
        <div><span>APPROVATI</span><strong>{counts.approved}</strong></div>
        <div><span>BLOCCATI</span><strong>{counts.blocked}</strong></div>
        <div><span>TOTALE</span><strong>{counts.all}</strong></div>
      </section>

      <section className="members-list-section">
        <div className="members-toolbar">
          <div className="member-filter-tabs" role="tablist" aria-label="Filtra utenti per stato">
            {(["pending", "approved", "blocked", "all"] as MemberFilter[]).map((status) => <button aria-selected={filter === status} className={filter === status ? "member-filter-tab selected" : "member-filter-tab"} key={status} onClick={() => setFilter(status)} role="tab" type="button">{status === "all" ? "Tutti" : statusLabels[status]}<span>{counts[status]}</span></button>)}
          </div>
          <label className="search-field member-search"><Search size={15} /><input aria-label="Cerca utenti" onChange={(event) => setSearch(event.target.value)} placeholder="Cerca nome, email o codice" value={search} /></label>
        </div>

        {error && <p className="form-error"><CircleAlert size={15} />{error}</p>}
        {notice && <p className="address-validation address-valid"><Check size={14} />{notice}</p>}

        <div className="members-table-wrap">
          <table className="members-table">
            <thead><tr><th>MEMBRO</th><th>CODICE AMICO</th><th>PIATTAFORME</th><th>SPECIALIZZAZIONE</th><th>STATO</th><th>RUOLO</th><th>AZIONI</th></tr></thead>
            <tbody>
              {visibleMembers.map((member) => <tr key={member.email}>
                <td><div className="member-page-identity"><span className="member-admin-avatar">{member.image ? <span style={{ backgroundImage: `url("${member.image}")` }} /> : (member.nmsName || member.name).slice(0, 1).toUpperCase()}</span><span><strong>{member.nmsName || "Nome NMS da completare"}</strong><small>{member.email}</small></span></div></td>
                <td className="member-code-cell">{member.nmsCode || "Da completare"}</td>
                <td>{member.platforms.length ? member.platforms.join(", ") : "Da selezionare"}</td>
                <td>{member.specialty ? specialtyLabels[member.specialty] : "Da scegliere"}</td>
                <td><span className={`member-status-pill member-status-${member.membershipStatus}`}>{statusLabels[member.membershipStatus]}</span></td>
                <td>{roleLabels[member.role]}</td>
                <td><MemberActions canChangeRole={canChangeRole} currentMemberEmail={pageMember.email} member={member} onDelete={(target) => void deleteMember(target)} onRole={(email, role) => void patchMember(email, { role })} onStatus={(email, membershipStatus) => void patchMember(email, { membershipStatus })} /></td>
              </tr>)}
              {visibleMembers.length === 0 && <tr><td className="members-empty" colSpan={7}>{emptyMessage}</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="members-list-footer">Visualizzati {visibleMembers.length} di {counts.all} utenti</footer>
      </section>
        </main>
      </section>
      {adminOpen && pageMember.role === "admin" && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setAllianceSettings} />}
      {profileOpen && <MemberProfilePanel member={pageMember} onClose={() => setProfileOpen(false)} onSaved={(profile) => setPageMember((current) => ({ ...current, ...profile }))} />}
    </div>
  );
}