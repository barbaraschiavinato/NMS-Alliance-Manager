import { useEffect, useState, type SubmitEvent } from "react";
import { ArrowUpRight, CircleAlert, Trash2, X } from "lucide-react";
import {
  decodePortalAddress,
  missionPriorities,
  missionStatuses,
  type Mission,
  type MissionInput,
  type MissionPriority,
  type MissionStatus,
} from "@/lib/missions";
import { SystemAddressField, type SystemAddressLookup, type SystemAddressValidation } from "@/components/portal-address-field";
import type { AllianceMember } from "@/lib/access-store";
import type { MemberSpecialty } from "@/lib/member-types";
import { missionSpecialties, type MissionSpecialty } from "@/lib/missions";
import { galaxyNames, galaxyLabel } from "@/lib/galaxies";
import { isMissionSystemStatus, missionSystemStatuses, planetSystemStatusKey, type MissionSystemStatus } from "@/lib/planet-system-status";

const specialtyNames: Record<MemberSpecialty, string> = { builder: "Costruttore", ranger: "Ranger", explorer: "Esploratore" };
const targetNames: Record<MissionSpecialty, string> = { all: "Tutti", builder: "Costruttori", ranger: "Ranger", explorer: "Esploratori", other: "Altro" };
export type StationOwnerOption = Readonly<{ portal: string; galaxy: number; owner: string }>;

const emptyMission: MissionInput = {
  title: "",
  description: "",
  system: "",
  systemAddress: "",
  galaxy: 0,
  systemVerified: false,
  systemLabelFromAlmanac: false,
  assignedTo: "",
  targetSpecialty: "all",
  dueDate: new Date().toISOString().slice(0, 10),
  status: "In attesa",
  priority: "Normale",
  progress: 0,
};

export function MissionForm({
  mission,
  onClose,
  onSave,
  onDelete,
  members,
  stationOwners,
  initialValues,
  availableSpecialties,
  onSystemStatusesSaved,
}: Readonly<{
  mission: Mission | null;
  onClose: () => void;
  onSave: (input: MissionInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  members: AllianceMember[];
  stationOwners: StationOwnerOption[];
  initialValues?: Partial<MissionInput>;
  availableSpecialties?: MissionSpecialty[];
  onSystemStatusesSaved?: (portal: string, galaxy: number, statuses: MissionSystemStatus[]) => void;
}>) {
  const [form, setForm] = useState<MissionInput>(() => mission
    ? { ...mission, systemAddress: mission.systemAddress ?? "", galaxy: mission.galaxy ?? 0 }
    : { ...emptyMission, ...initialValues });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [systemStatuses, setSystemStatuses] = useState<MissionSystemStatus[]>([]);
  const [loadedStatusKey, setLoadedStatusKey] = useState("");
  const [systemStatusesSaving, setSystemStatusesSaving] = useState(false);
  const [systemStatusesError, setSystemStatusesError] = useState("");
  const [loadedStatusErrorKey, setLoadedStatusErrorKey] = useState("");
  const [addressValidation, setAddressValidation] = useState<SystemAddressValidation>({ valid: false, lookup: null });
  const addressComplete = addressValidation.valid;
  const matchingLookup = addressValidation.lookup?.address === form.systemAddress && addressValidation.lookup.galaxy === form.galaxy
    ? addressValidation.lookup
    : null;
  const systemLookup = addressComplete
    ? matchingLookup ?? { address: form.systemAddress, galaxy: form.galaxy, status: "checking" as const }
    : null;
  const matchingStationOwners = stationOwners.filter((station) =>
    station.portal === form.systemAddress.toUpperCase() && station.galaxy === form.galaxy,
  );
  let submitLabel = "Crea missione";
  if (saving) submitLabel = "Salvataggio…";
  else if (mission) submitLabel = "Salva modifiche";
  const update = <K extends keyof MissionInput>(key: K, value: MissionInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const currentPlanetKey = /^[0-9a-f]{12}$/i.test(form.systemAddress) &&
    Number.isInteger(form.galaxy) && form.galaxy >= 0 && form.galaxy <= 255 &&
    decodePortalAddress(form.systemAddress)?.errors.length === 0
    ? planetSystemStatusKey(form.systemAddress, form.galaxy)
    : "";
  const systemStatusesLoading = Boolean(currentPlanetKey && loadedStatusKey !== currentPlanetKey);
  useEffect(() => {
    const address = form.systemAddress;
    const galaxy = form.galaxy;
    if (!/^[0-9a-f]{12}$/i.test(address) || !Number.isInteger(galaxy) || galaxy < 0 || galaxy > 255 ||
      decodePortalAddress(address)?.errors.length !== 0) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ portal: address, galaxy: String(galaxy) });
    fetch(`/api/planet-status?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          const message = body && typeof body === "object" && "error" in body ? body.error : null;
          throw new Error(typeof message === "string" ? message : "Impossibile leggere lo stato del pianeta.");
        }
        const statuses = body && typeof body === "object" && "systemStatuses" in body ? body.systemStatuses : null;
        if (!Array.isArray(statuses) || !statuses.every(isMissionSystemStatus)) {
          throw new Error("Risposta dello stato pianeta non valida.");
        }
        setSystemStatuses(statuses);
        setLoadedStatusErrorKey("");
      })
      .catch((error_: unknown) => {
        if (!controller.signal.aborted) {
          setSystemStatusesError(error_ instanceof Error ? error_.message : "Impossibile leggere lo stato del pianeta.");
          setLoadedStatusErrorKey(planetSystemStatusKey(address, galaxy));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedStatusKey(planetSystemStatusKey(address, galaxy));
      });
    return () => controller.abort();
  }, [form.galaxy, form.systemAddress]);

  async function updateSystemStatus(status: MissionSystemStatus, checked: boolean) {
    const nextStatuses = checked
      ? [...systemStatuses, status]
      : systemStatuses.filter((selected) => selected !== status);
    setSystemStatusesSaving(true);
    setSystemStatusesError("");
    try {
      const response = await fetch("/api/planet-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portal: form.systemAddress, galaxy: form.galaxy, systemStatuses: nextStatuses }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body ? body.error : null;
        throw new Error(typeof message === "string" ? message : "Impossibile salvare lo stato del pianeta.");
      }
      const statuses = body && typeof body === "object" && "systemStatuses" in body ? body.systemStatuses : null;
      if (!Array.isArray(statuses) || !statuses.every(isMissionSystemStatus)) {
        throw new Error("Risposta dello stato pianeta non valida.");
      }
      setSystemStatuses(statuses);
      setSystemStatusesError("");
      onSystemStatusesSaved?.(form.systemAddress, form.galaxy, statuses);
    } catch (error_: unknown) {
      setSystemStatusesError(error_ instanceof Error ? error_.message : "Impossibile salvare lo stato del pianeta.");
    } finally {
      setSystemStatusesSaving(false);
    }
  }
  const resetAlmanacSystemData = () => {
    if (form.systemLabelFromAlmanac) update("system", "");
    update("systemVerified", false);
    update("systemLabelFromAlmanac", false);
  };
  const handleSystemLookup = (lookup: SystemAddressLookup) => {
    const verified = lookup.status === "found";
    setForm((current) => ({
      ...current,
      systemVerified: verified,
      ...(verified && lookup.systemLabel && (!current.system.trim() || current.systemLabelFromAlmanac)
        ? { system: lookup.systemLabel, systemLabelFromAlmanac: true }
        : !verified && current.systemLabelFromAlmanac
          ? { system: "", systemLabelFromAlmanac: false }
          : {}),
    }));
  };

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!addressComplete) {
      setError("Inserisci un codice sistema o portale valido prima di salvare.");
      return;
    }
    if (systemLookup?.status === "checking") {
      setError("Attendi il completamento del controllo dell’archivio.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(form);
      onClose();
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Salvataggio non riuscito.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!mission || !window.confirm(`Eliminare "${mission.title}"?`)) return;
    setSaving(true);
    try {
      await onDelete(mission.id);
      onClose();
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Eliminazione non riuscita.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <dialog aria-labelledby="dialog-title" aria-modal="true" className="mission-dialog" open>
        <div className="dialog-heading">
          <div>
            <h2 id="dialog-title">{mission ? "Modifica missione" : "Nuova missione"}</h2>
          </div>
          <button aria-label="Chiudi" className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <label className="field full-field">
            <span>Nome missione</span>
            <input autoFocus maxLength={120} onChange={(event) => update("title", event.target.value)} placeholder="Es. Mappare il settore" required value={form.title} />
          </label>
          <label className="field full-field">
            <span>Obiettivo</span>
            <textarea onChange={(event) => update("description", event.target.value)} placeholder="Dettagli e criteri di completamento" rows={3} value={form.description} />
          </label>
          <SystemAddressField address={form.systemAddress} galaxy={form.galaxy} onChange={(value) => {
            update("systemAddress", value);
            update("stationOwnerEmail", undefined);
            update("stationOwnerName", undefined);
            resetAlmanacSystemData();
            setAddressValidation({ valid: false, lookup: null });
          }} onLookupResolved={handleSystemLookup} onStateChange={setAddressValidation} />
          <div className="form-grid">
            <label className="field">
              <span>Nome sistema / settore <small>facoltativo</small></span>
              <input onChange={(event) => {
                update("system", event.target.value);
                update("systemLabelFromAlmanac", false);
              }} placeholder="Etichetta per riconoscerlo" value={form.system} />
            </label>
            <label className="field">
              <span>Galassia <b>{galaxyLabel(form.galaxy)}</b></span>
              <select aria-label="Galassia" onChange={(event) => {
                update("galaxy", Number(event.target.value));
                update("stationOwnerEmail", undefined);
                update("stationOwnerName", undefined);
                resetAlmanacSystemData();
                setAddressValidation((current) => ({ ...current, lookup: null }));
              }} required value={form.galaxy}>
                {galaxyNames.map((name, index) => <option key={index} value={index}>{name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Missione per</span>
              <select onChange={(event) => update("targetSpecialty", event.target.value as MissionSpecialty)} value={form.targetSpecialty}>
                {(availableSpecialties ?? missionSpecialties).map((specialty) => <option disabled={Boolean(mission) && specialty === "all"} key={specialty} value={specialty}>{targetNames[specialty]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Scopritore del sistema</span>
              <select onChange={(event) => {
                update("stationOwnerEmail", event.target.value || undefined);
                update("stationOwnerName", undefined);
              }} value={form.stationOwnerEmail ?? ""}>
                <option value="">Non indicato</option>
                {form.stationOwnerEmail && !matchingStationOwners.some((station) => station.owner === form.stationOwnerEmail) && <option value={form.stationOwnerEmail}>{form.stationOwnerName || form.stationOwnerEmail}</option>}
                {matchingStationOwners.map((station) => {
                  const owner = members.find((candidate) => candidate.email === station.owner);
                  return <option key={station.owner} value={station.owner}>{owner?.nmsName || owner?.name || station.owner}</option>;
                })}
              </select>
            </label>
            <label className="field">
                <span>Assegna a</span>
                <select onChange={(event) => {
                  const selectedEmail = event.target.value;
                  if (selectedEmail === "__legacy") {
                    update("assignedEmail", undefined);
                    return;
                  }
                  const assignedEmail = selectedEmail;
                  const assignedMember = members.find((candidate) => candidate.email === assignedEmail);
                  update("assignedEmail", assignedEmail || undefined);
                  update("assignedTo", assignedMember?.nmsName || assignedMember?.name || "");
                }} value={form.assignedEmail ?? (form.assignedTo ? "__legacy" : "")}>
                  <option value="">Non assegnata</option>
                  {form.assignedTo && !form.assignedEmail && <option value="__legacy">{form.assignedTo} · assegnazione esistente</option>}
                  {members.map((candidate) => <option key={candidate.email} value={candidate.email}>{candidate.nmsName || candidate.name} · {candidate.specialty ? specialtyNames[candidate.specialty] : "Specializzazione da completare"} · {candidate.nmsCode} · {candidate.platforms.join(", ")}</option>)}
                </select>
            </label>
            <label className="field">
              <span>Priorità</span>
              <select onChange={(event) => update("priority", event.target.value as MissionPriority)} value={form.priority}>
                {missionPriorities.map((priority) => <option key={priority}>{priority}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Stato</span>
              <select onChange={(event) => update("status", event.target.value as MissionStatus)} value={form.status}>
                {missionStatuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <label className="field mission-progress-field">
              <span>Avanzamento <b>{form.progress}%</b></span>
              <input max={100} min={0} onChange={(event) => update("progress", Number(event.target.value))} type="range" value={form.progress} />
            </label>
            <fieldset className="system-status-fieldset">
              <legend>Stato sistema · condiviso per pianeta</legend>
              {!currentPlanetKey && <p className="field-hint">Inserisci un indirizzo portale valido per gestire lo stato del pianeta.</p>}
              {systemStatusesLoading && <p className="field-hint">Caricamento stato pianeta…</p>}
              {systemStatusesError && <p className="form-error"><CircleAlert size={14} />{systemStatusesError}</p>}
              {currentPlanetKey && !systemStatusesLoading && loadedStatusErrorKey !== currentPlanetKey && (
                <div className="system-status-options">
                  {missionSystemStatuses.map((status) => (
                    <label className="system-status-option" key={status}>
                      <input
                        checked={loadedStatusKey === currentPlanetKey && systemStatuses.includes(status)}
                        disabled={systemStatusesSaving || !addressComplete}
                        onChange={(event) => void updateSystemStatus(status, event.target.checked)}
                        type="checkbox"
                      />
                      <span>{status}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          </div>
          {error && <p className="form-error"><CircleAlert size={15} />{error}</p>}
          <div className="dialog-actions">
            {mission && <button className="delete-button" disabled={saving} onClick={remove} type="button"><Trash2 size={15} /> Elimina</button>}
            <span className="action-spacer" />
            <button className="quiet-button" onClick={onClose} type="button">Annulla</button>
            <button className="primary-button" disabled={saving || !addressComplete || systemLookup?.status === "checking"} type="submit">{submitLabel}<ArrowUpRight size={15} /></button>
          </div>
        </form>
      </dialog>
    </div>
  );
}