import { ArrowDownWideNarrow, Check, ChevronDown, Compass, Pencil, Search, Trash2 } from "lucide-react";
import type { Mission, MissionSpecialty, MissionStatus } from "@/lib/missions";
import { GlyphStrip } from "@/components/portal-address-field";
import type { AllianceMember } from "@/lib/access-store";
import { galaxyLabel } from "@/lib/galaxies";

export type MissionFilter = "Tutte" | MissionStatus | "Attesa assegnate" | "Attesa non assegnate";
type MissionCounts = Record<MissionFilter, number>;
const targetSpecialtyNames: Record<MissionSpecialty, string> = {
  all: "Tutti",
  builder: "Costruttori",
  ranger: "Ranger",
  explorer: "Esploratori",
  other: "Altro",
};

function MissionRowAction({ mission, currentMember, canManage, onEdit, onDeleteMission, onClaim, onComplete }: Readonly<{
  mission: Mission;
  currentMember: AllianceMember;
  canManage: boolean;
  onEdit: (mission: Mission) => void;
  onDeleteMission: (mission: Mission) => void;
  onClaim: (mission: Mission) => void;
  onComplete: (mission: Mission) => void;
}>) {
  if (canManage) {
    return <span className="mission-row-actions">
      <button aria-label={`Modifica ${mission.title}`} className="row-action" onClick={() => onEdit(mission)} title="Modifica missione" type="button"><Pencil size={15} /></button>
      <button aria-label={`Elimina ${mission.title}`} className="row-action row-action-delete" onClick={() => onDeleteMission(mission)} title="Elimina missione" type="button"><Trash2 size={15} /></button>
    </span>;
  }
  if (mission.assignedEmail === currentMember.email && mission.status !== "Completata") {
    return <button className="claim-button" onClick={() => onComplete(mission)} type="button">Completa</button>;
  }
  if (!mission.assignedEmail && !mission.assignedTo.trim()) {
    return <button className="claim-button" onClick={() => onClaim(mission)} type="button">Prendi</button>;
  }
  return <span className="no-row-action">—</span>;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" }).format(
    new Date(`${date}T12:00:00`),
  );
}

export function MissionTable({
  missions,
  counts,
  filter,
  search,
  searchInput,
  sortAscending,
  onFilterChange,
  onSearchChange,
  onSortChange,
  onEdit,
  onDeleteMission,
  onOpenPlanet,
  onClaim,
  onComplete,
  currentMember,
  canManage,
}: Readonly<{
  missions: Mission[];
  counts: MissionCounts;
  filter: MissionFilter;
  search: string;
  searchInput: React.RefObject<HTMLInputElement | null>;
  sortAscending: boolean;
  onFilterChange: (filter: MissionFilter) => void;
  onSearchChange: (search: string) => void;
  onSortChange: () => void;
  onEdit: (mission: Mission) => void;
  onDeleteMission: (mission: Mission) => void;
  onOpenPlanet: (mission: Mission) => void;
  onClaim: (mission: Mission) => void;
  onComplete: (mission: Mission) => void;
  currentMember: AllianceMember;
  canManage: boolean;
}>) {
  return (
    <section className="mission-section">
      <div className="section-heading">
        <div><span className="eyebrow dark-eyebrow">TASK FORCE <span>·</span> 08</span><h2>Missioni assegnate</h2></div>
      </div>
      <div className="toolbar">
        <div className="filter-tabs" role="tablist" aria-label="Filtra per stato">
          {(["Tutte", "In corso", "Attesa assegnate", "Attesa non assegnate", "Completata"] as MissionFilter[]).map((item) => <button aria-selected={filter === item} className={filter === item ? "filter-tab selected" : "filter-tab"} key={item} onClick={() => onFilterChange(item)} role="tab" type="button">{item}<span>{counts[item]}</span></button>)}
        </div>
        <div className="toolbar-actions">
          <label className="search-field"><Search size={15} /><input aria-label="Cerca per missione, sistema o responsabile" onChange={(event) => onSearchChange(event.target.value)} placeholder="Cerca missione" ref={searchInput} value={search} /><kbd>/</kbd></label>
          <button aria-label={`Ordina per scadenza ${sortAscending ? "decrescente" : "crescente"}`} className="square-button" onClick={onSortChange} title={`Scadenza ${sortAscending ? "più vicina prima" : "più lontana prima"}`} type="button"><ArrowDownWideNarrow size={16} /></button>
        </div>
      </div>
      <div className="mission-table-wrap">
        <table className="mission-table">
          <thead><tr><th>MISSIONE</th><th>TIPO</th><th>SETTORE</th><th>RESPONSABILE</th><th>SCADENZA</th><th>PRIORITÀ</th><th>AVANZAMENTO</th><th aria-label="Azioni" /></tr></thead>
          <tbody>
            {missions.map((mission) => <tr key={mission.id}>
              <td><div className="mission-name-cell"><span className={`mission-icon ${mission.status === "Completata" ? "mission-icon-done" : ""}`}>{mission.status === "Completata" ? <Check size={15} /> : <Compass size={15} />}</span><div><button aria-label={`Apri la scheda del pianeta per ${mission.title}`} className="mission-title" onClick={() => onOpenPlanet(mission)} title="Apri scheda pianeta" type="button">{mission.title}</button><span className="mission-description">{mission.description}</span></div></div></td>
              <td><span className={`mission-specialty mission-specialty-${mission.targetSpecialty ?? "all"}`}>{targetSpecialtyNames[mission.targetSpecialty ?? "all"]}</span></td>
              <td><div className="system-cell"><GlyphStrip address={mission.systemAddress ?? ""} /><span className="system-caption">{mission.system || "Sistema"} · {galaxyLabel(mission.galaxy ?? 0)}</span></div></td>
              <td><span className="assignee-cell"><span className="assignee-avatar">{(mission.assignedTo || mission.stationOwnerName || mission.createdByName || "?").slice(0, 2).toUpperCase()}</span>{mission.assignedTo || mission.stationOwnerName || mission.createdByName || "Da assegnare"}</span></td>
              <td><span className={`due-date ${mission.status !== "Completata" && mission.dueDate < new Date().toISOString().slice(0, 10) ? "overdue" : ""}`}>{formatDate(mission.dueDate)}</span></td>
              <td><span className={`priority priority-${mission.priority.toLowerCase()}`}><span />{mission.priority}</span></td>
              <td><div className="progress-cell"><div className="progress-track"><span style={{ width: `${mission.progress}%` }} /></div><span>{mission.progress}%</span></div></td>
              <td><MissionRowAction canManage={canManage} currentMember={currentMember} mission={mission} onClaim={onClaim} onComplete={onComplete} onDeleteMission={onDeleteMission} onEdit={onEdit} /></td>
            </tr>)}
            {missions.length === 0 && <tr><td className="empty-state" colSpan={8}><Search size={18} />Nessuna missione corrisponde ai filtri.</td></tr>}
          </tbody>
        </table>
        <div className="table-footer"><span><span className="footer-live" /> Mostrate <strong>{missions.length}</strong> di <strong>{counts.Tutte}</strong> missioni</span><span>AGGIORNATO ORA <ChevronDown size={13} /></span></div>
      </div>
    </section>
  );
}