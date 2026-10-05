import { Check, ChevronDown, Compass, Pencil, Search, Trash2 } from "lucide-react";
import Image from "next/image";
import type { Mission, MissionSpecialty, MissionStatus } from "@/lib/missions";
import { GlyphStrip } from "@/components/portal-address-field";
import type { AllianceMember } from "@/lib/access-store";
import { galaxyLabel } from "@/lib/galaxies";
import { useEffect, useState } from "react";
import { MemberCardDialog } from "@/components/member-card-dialog";

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

function AssigneeCell({ mission, members, currentMember, onOpenProfile }: Readonly<{
  mission: Mission;
  members: AllianceMember[];
  currentMember: AllianceMember;
  onOpenProfile: (email: string) => void;
}>) {
  const assignedMember = members.find((member) => member.email === mission.assignedEmail)
    ?? (mission.assignedEmail === currentMember.email ? currentMember : undefined)
    ?? ([currentMember.nmsName, currentMember.name].includes(mission.assignedTo) ? currentMember : undefined)
    ?? members.find((member) => member.nmsName === mission.assignedTo || member.name === mission.assignedTo);
  const image = assignedMember?.image;
  const name = mission.assignedTo || "Da assegnare";
  const email = mission.assignedEmail || assignedMember?.email;

  const content = <>
    <MemberAvatar image={image} key={image || "fallback"} label={mission.assignedTo || "—"} />
    {name}
  </>;
  return email
    ? <button className="assignee-cell mission-member-link" onClick={() => onOpenProfile(email)} type="button">{content}</button>
    : <span className="assignee-cell">{content}</span>;
}

function DiscovererCell({ email, name, image, onOpenProfile }: Readonly<{
  email?: string;
  name?: string;
  image?: string;
  onOpenProfile: (email: string) => void;
}>) {
  const label = name || email || "Non indicato";
  const content = <>
    <MemberAvatar image={image} key={image || "fallback"} label={label} />
    {label}
  </>;

  return email
    ? <button className="assignee-cell mission-member-link" onClick={() => onOpenProfile(email)} type="button">{content}</button>
    : <span className="assignee-cell">{content}</span>;
}

function MemberAvatar({ image, label }: Readonly<{ image?: string; label: string }>) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = label.slice(0, 2).toUpperCase() || "—";

  return <span aria-hidden="true" className={`assignee-avatar ${image && !imageFailed ? "assignee-avatar-image" : ""}`}>
    {image && !imageFailed
      ? <Image alt="" height={21} onError={() => setImageFailed(true)} src={image} unoptimized width={21} />
      : initials}
  </span>;
}

export function MissionTable({
  missions,
  counts,
  filter,
  search,
  searchInput,
  onFilterChange,
  onSearchChange,
  onEdit,
  onDeleteMission,
  onOpenPlanet,
  onClaim,
  onComplete,
  currentMember,
  canManage,
  members,
}: Readonly<{
  missions: Mission[];
  counts: MissionCounts;
  filter: MissionFilter;
  search: string;
  searchInput: React.RefObject<HTMLInputElement | null>;
  onFilterChange: (filter: MissionFilter) => void;
  onSearchChange: (search: string) => void;
  onEdit: (mission: Mission) => void;
  onDeleteMission: (mission: Mission) => void;
  onOpenPlanet: (mission: Mission) => void;
  onClaim: (mission: Mission) => void;
  onComplete: (mission: Mission) => void;
  currentMember: AllianceMember;
  canManage: boolean;
  members: AllianceMember[];
}>) {
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [discovererImages, setDiscovererImages] = useState<Record<string, string>>({});
  const discovererEmailKey = [...new Set(missions.flatMap((mission) => mission.stationOwnerEmail ? [mission.stationOwnerEmail] : []))].sort().join(",");

  useEffect(() => {
    const emails = discovererEmailKey ? discovererEmailKey.split(",") : [];
    const approvedMembers = new Map(members.map((member) => [member.email.toLowerCase(), member.image]));
    if (currentMember.image) approvedMembers.set(currentMember.email.toLowerCase(), currentMember.image);
    const missingEmails = emails.filter((email) => !approvedMembers.get(email.toLowerCase()));
    if (missingEmails.length === 0) return;

    const controller = new AbortController();
    fetch(`/api/members?emails=${encodeURIComponent(missingEmails.join(","))}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return [];
        const body: unknown = await response.json();
        if (!Array.isArray(body)) return [];
        return body.flatMap((profile): [string, string][] => {
          if (!profile || typeof profile !== "object") return [];
          const entry = profile as Record<string, unknown>;
          return typeof entry.email === "string" && typeof entry.image === "string" && entry.image
            ? [[entry.email.toLowerCase(), entry.image]]
            : [];
        });
      })
      .then((images) => {
        if (!controller.signal.aborted) setDiscovererImages((current) => ({ ...current, ...Object.fromEntries(images) }));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [currentMember.email, currentMember.image, discovererEmailKey, members]);

  function getDiscovererImage(email?: string) {
    if (!email) return undefined;
    return discovererImages[email.toLowerCase()]
      ?? members.find((member) => member.email.toLowerCase() === email.toLowerCase())?.image
      ?? (currentMember.email.toLowerCase() === email.toLowerCase() ? currentMember.image : undefined);
  }

  return (
    <section className="mission-section">
      <div className="section-heading">
        <div><span className="eyebrow dark-eyebrow">TASK FORCE <span>·</span> 08</span><h2>Missioni</h2></div>
      </div>
      <div className="toolbar">
        <div className="filter-tabs" role="tablist" aria-label="Filtra per stato">
          {(["Tutte", "In corso", "Attesa assegnate", "Attesa non assegnate", "Completata"] as MissionFilter[]).map((item) => <button aria-selected={filter === item} className={filter === item ? "filter-tab selected" : "filter-tab"} key={item} onClick={() => onFilterChange(item)} role="tab" type="button">{item}<span>{counts[item]}</span></button>)}
        </div>
        <div className="toolbar-actions">
          <label className="search-field"><Search size={15} /><input aria-label="Cerca per missione, sistema o responsabile" onChange={(event) => onSearchChange(event.target.value)} placeholder="Cerca missione" ref={searchInput} value={search} /><kbd>/</kbd></label>
        </div>
      </div>
      <div className="mission-table-wrap">
        <table className="mission-table">
          <thead><tr><th>MISSIONE</th><th>TIPO</th><th>SETTORE</th><th>SCOPRITORE</th><th>ASSEGNATARIO</th><th>PRIORITÀ</th><th>AVANZAMENTO</th><th aria-label="Azioni" /></tr></thead>
          <tbody>
            {missions.map((mission) => <tr key={mission.id}>
              <td><div className="mission-name-cell"><span className={`mission-icon ${mission.status === "Completata" ? "mission-icon-done" : ""}`}>{mission.status === "Completata" ? <Check size={15} /> : <Compass size={15} />}</span><div><button aria-label={`Apri la scheda del pianeta per ${mission.title}`} className="mission-title" onClick={() => onOpenPlanet(mission)} title="Apri scheda pianeta" type="button">{mission.title}</button><span className="mission-description">{mission.description}</span></div></div></td>
              <td><span className={`mission-specialty mission-specialty-${mission.targetSpecialty ?? "all"}`}>{targetSpecialtyNames[mission.targetSpecialty ?? "all"]}</span></td>
              <td><div className="system-cell"><GlyphStrip address={mission.systemAddress ?? ""} /><span className="system-caption">{mission.system || "Sistema"} · {galaxyLabel(mission.galaxy ?? 0)}</span></div></td>
              <td><DiscovererCell email={mission.stationOwnerEmail} image={getDiscovererImage(mission.stationOwnerEmail)} name={mission.stationOwnerName} onOpenProfile={setProfileEmail} /></td>
              <td><AssigneeCell currentMember={currentMember} members={members} mission={mission} onOpenProfile={setProfileEmail} /></td>
              <td><span className={`priority priority-${mission.priority.toLowerCase()}`}><span />{mission.priority}</span></td>
              <td><div className="progress-cell"><div className="progress-track"><span style={{ width: `${mission.progress}%` }} /></div><span>{mission.progress}%</span></div></td>
              <td><MissionRowAction canManage={canManage} currentMember={currentMember} mission={mission} onClaim={onClaim} onComplete={onComplete} onDeleteMission={onDeleteMission} onEdit={onEdit} /></td>
            </tr>)}
            {missions.length === 0 && <tr><td className="empty-state" colSpan={8}><Search size={18} />Nessuna missione corrisponde ai filtri.</td></tr>}
          </tbody>
        </table>
        <div className="table-footer"><span><span className="footer-live" /> Mostrate <strong>{missions.length}</strong> di <strong>{counts.Tutte}</strong> missioni</span><span>AGGIORNATO ORA <ChevronDown size={13} /></span></div>
      </div>
      {profileEmail && <MemberCardDialog email={profileEmail} onClose={() => setProfileEmail(null)} />}
    </section>
  );
}