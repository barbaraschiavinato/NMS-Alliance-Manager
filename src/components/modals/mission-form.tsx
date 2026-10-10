import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { generateSystemName } from "@/lib/system-name";
import { ArrowUpRight, CircleAlert, Orbit, Trash2, X } from "lucide-react";
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
import { missionSpecialties, specialtyAlreadyCovered, type MissionSpecialty } from "@/lib/missions";
import { galaxyNames, galaxyLabel } from "@/lib/galaxies";
import { isMissionSystemStatus, missionSystemStatuses, missionSystemStatusRoles, planetSystemStatusKey, systemProgressFloor, type MissionSystemStatus } from "@/lib/planet-system-status";
import { useLocale } from "@/components/locale-provider";

const specialtyNames: Record<MemberSpecialty, string> = { builder: "common.builder", ranger: "common.ranger", explorer: "common.explorer" };
const targetNames: Record<MissionSpecialty, string> = { all: "common.all", explorer_builder: "common.explorers_and_builders", builder: "common.builders", ranger: "common.ranger", explorer: "common.explorers", other: "common.other" };
export type StationOwnerOption = Readonly<{ portal: string; galaxy: number; ownerId: string; ownerName: string }>;

const emptyMission: MissionInput = {
  title: "",
  description: "",
  notes: "",
  system: "",
  systemAddress: "",
  galaxy: 0,
  systemVerified: false,
  systemLabelFromAlmanac: false,
  assignedTo: "",
  targetSpecialty: "explorer",
  dueDate: new Date().toISOString().slice(0, 10),
  status: "pending",
  priority: "normal",
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
  simplified = false,
  existingMissions = [],
  hideAddress = false,
  hideSpecialty = false,
  hideSystemStatus = false,
  minimal = false,
  simplifiedStatusRole = "ranger",
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
  simplified?: boolean;
  existingMissions?: readonly Mission[];
  hideAddress?: boolean;
  hideSpecialty?: boolean;
  hideSystemStatus?: boolean;
  minimal?: boolean;
  simplifiedStatusRole?: string;
  onSystemStatusesSaved?: (portal: string, galaxy: number, statuses: MissionSystemStatus[]) => void;
}>) {
  const { t } = useLocale();
  const [form, setForm] = useState<MissionInput>(() => mission
    ? { ...mission, systemAddress: mission.systemAddress ?? "", galaxy: mission.galaxy ?? 0 }
    : { ...emptyMission, ...initialValues });
  const [saving, setSaving] = useState(false);
  const titleEditedRef = useRef(Boolean(mission?.title || initialValues?.title));
  const [generatingNames, setGeneratingNames] = useState(0);
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
  let submitLabel = t("missions.create_mission");
  if (saving) submitLabel = t("common.saving");
  else if (mission) submitLabel = t("common.save_changes");
  const update = <K extends keyof MissionInput>(key: K, value: MissionInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const currentPlanetKey = /^[0-9a-f]{12}$/i.test(form.systemAddress) &&
    Number.isInteger(form.galaxy) && form.galaxy >= 0 && form.galaxy <= 255 &&
    decodePortalAddress(form.systemAddress)?.errors.length === 0
    ? planetSystemStatusKey(form.systemAddress, form.galaxy)
    : "";
  const isEditing = Boolean(mission);
  const systemStatusesLoading = Boolean(currentPlanetKey && loadedStatusKey !== currentPlanetKey);
  useEffect(() => {
    const address = form.systemAddress;
    const editingMission = isEditing;
    const galaxy = form.galaxy;
    if (hideSystemStatus || !/^[0-9a-f]{12}$/i.test(address) || !Number.isInteger(galaxy) || galaxy < 0 || galaxy > 255 ||
      decodePortalAddress(address)?.errors.length !== 0) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ portal: address, galaxy: String(galaxy) });
    fetch(`/api/planet-status?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          const message = body && typeof body === "object" && "error" in body ? body.error : null;
          throw new Error(typeof message === "string" ? message : "Unable to read planet status.");
        }
        const statuses = body && typeof body === "object" && "systemStatuses" in body ? body.systemStatuses : null;
        if (!Array.isArray(statuses) || !statuses.every(isMissionSystemStatus)) {
          throw new Error("Invalid planet status response.");
        }
        setSystemStatuses(statuses);
        if (editingMission) setForm((current) => current.progress === 0 ? { ...current, progress: systemProgressFloor(statuses, current.targetSpecialty) } : current);
        setLoadedStatusErrorKey("");
      })
      .catch((error_: unknown) => {
        if (!controller.signal.aborted) {
          setSystemStatusesError(error_ instanceof Error ? error_.message : "Unable to read planet status.");
          setLoadedStatusErrorKey(planetSystemStatusKey(address, galaxy));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedStatusKey(planetSystemStatusKey(address, galaxy));
      });
    return () => controller.abort();
  }, [form.galaxy, form.systemAddress, hideSystemStatus, isEditing]);

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
        throw new Error(typeof message === "string" ? message : "Unable to save planet status.");
      }
      const statuses = body && typeof body === "object" && "systemStatuses" in body ? body.systemStatuses : null;
      if (!Array.isArray(statuses) || !statuses.every(isMissionSystemStatus)) {
        throw new Error("Invalid planet status response.");
      }
      setSystemStatuses(statuses);
      setSystemStatusesError("");
      onSystemStatusesSaved?.(form.systemAddress, form.galaxy, statuses);
    } catch (error_: unknown) {
      setSystemStatusesError(error_ instanceof Error ? error_.message : "Unable to save planet status.");
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
    if (!mission && !titleEditedRef.current) {
      setGeneratingNames((count) => count + 1);
      void generateSystemName(lookup.address, lookup.galaxy).then((systemName) => {
        if (systemName && !titleEditedRef.current) setForm((current) => ({ ...current, title: `${systemName} System` }));
      }).finally(() => setGeneratingNames((count) => count - 1));
    }
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
      setError(t("stations.enter_a_valid_system_or_portal_code_before_saving"));
      return;
    }
    if (systemLookup?.status === "checking") {
      setError(t("common.wait_for_the_archive_check_to_finish"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const hasProgress = form.targetSpecialty === "ranger" || form.targetSpecialty === "explorer" || form.targetSpecialty === "builder";
      await onSave(hasProgress ? form : { ...form, progress: 0 });
      onClose();
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : t("errors.save_failed"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!mission || !window.confirm(t("common.delete_title", { title: mission.title }))) return;
    setSaving(true);
    try {
      await onDelete(mission.id);
      onClose();
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : t("errors.deletion_failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <dialog aria-labelledby="dialog-title" aria-modal="true" className="mission-dialog" open>
        <div className="dialog-heading">
          <div>
            <h2 id="dialog-title">{t(mission ? "missions.edit_mission" : "missions.new_mission")}</h2>
          </div>
          <button aria-label={t("common.close")} className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <form className={[simplified && "mission-form-simplified", hideAddress && "mission-form-hide-address", minimal && "mission-form-minimal"].filter(Boolean).join(" ") || undefined} onSubmit={submit}>
          <label className="field full-field">
            <span>{t("missions.mission_name")}</span>
            <input autoFocus maxLength={120} onChange={(event) => {
              titleEditedRef.current = true;
              update("title", event.target.value);
            }} placeholder={t("common.e_g_map_the_sector")} required value={form.title} />
          </label>
          <label className="field full-field mission-objective-field">
            <span>{t("common.objective")}</span>
            <textarea onChange={(event) => update("description", event.target.value)} placeholder={t("common.details_and_completion_criteria")} rows={3} value={form.description} />
          </label>
          <SystemAddressField address={form.systemAddress} galaxy={form.galaxy} onChange={(value) => {
            update("systemAddress", value);
            update("stationOwnerMemberId", undefined);
            update("stationOwnerName", undefined);
            resetAlmanacSystemData();
            setAddressValidation({ valid: false, lookup: null });
          }} onLookupResolved={handleSystemLookup} onStateChange={setAddressValidation} />
          <div className="form-grid">
            <label className="field">
              <span>{t("system.system_sector_name")} <small>{t("common.optional")}</small></span>
              <input onChange={(event) => {
                update("system", event.target.value);
                update("systemLabelFromAlmanac", false);
              }} placeholder={t("common.a_label_to_identify_it")} value={form.system} />
            </label>
            <label className="field mission-galaxy-field">
              <span>{t("stations.galaxy")} <b>{galaxyLabel(form.galaxy)}</b></span>
              <select aria-label={t("stations.galaxy")} onChange={(event) => {
                update("galaxy", Number(event.target.value));
                update("stationOwnerMemberId", undefined);
                update("stationOwnerName", undefined);
                resetAlmanacSystemData();
                setAddressValidation((current) => ({ ...current, lookup: null }));
              }} required value={form.galaxy}>
                {galaxyNames.map((name, index) => <option key={index} value={index}>{name}</option>)}
              </select>
            </label>
            {!hideSpecialty && <label className="field mission-for-field">
              <span>{t("missions.mission_for")}</span>
              <select onChange={(event) => update("targetSpecialty", event.target.value as MissionSpecialty)} value={form.targetSpecialty}>
                {(availableSpecialties ?? missionSpecialties).map((specialty) => <option disabled={(Boolean(mission) && (specialty === "all" || specialty === "explorer_builder")) || (form.systemAddress.length === 12 && specialty !== form.targetSpecialty && specialtyAlreadyCovered(specialty, existingMissions, form.systemAddress, form.galaxy, mission?.id))} key={specialty} value={specialty}>{t(targetNames[specialty])}</option>)}
              </select>
            </label>}
            <label className="field">
              <span>{t("missions.system_discoverer")}</span>
              <select onChange={(event) => {
                update("stationOwnerMemberId", event.target.value || undefined);
                update("stationOwnerName", undefined);
              }} value={form.stationOwnerMemberId ?? ""}>
                <option value="">{t("common.not_specified")}</option>
                {form.stationOwnerMemberId && !matchingStationOwners.some((station) => station.ownerId === form.stationOwnerMemberId) && <option value={form.stationOwnerMemberId}>{form.stationOwnerName || t("common.not_specified")}</option>}
                {matchingStationOwners.map((station) => <option key={station.ownerId} value={station.ownerId}>{station.ownerName}</option>)}
              </select>
            </label>
            <label className="field">
                <span>{t("common.assign_to")}</span>
                <select onChange={(event) => {
                  const selectedMemberId = event.target.value;
                  const assignedMember = members.find((candidate) => candidate.publicId === selectedMemberId);
                  update("assignedMemberId", selectedMemberId || undefined);
                  update("assignedTo", assignedMember?.nmsName || assignedMember?.name || "");
                }} value={form.assignedMemberId ?? ""}>
                  <option value="">{t("missions.not_assigned")}</option>
                  {form.assignedMemberId && !members.some((candidate) => candidate.publicId === form.assignedMemberId) && <option value={form.assignedMemberId}>{form.assignedTo || t("common.existing_assignment")}</option>}
                  {members.map((candidate) => <option key={candidate.publicId} value={candidate.publicId}>{candidate.nmsName || candidate.name} · {candidate.specialty ? t(specialtyNames[candidate.specialty]) : t("profile.specialty_incomplete")} · {candidate.nmsCode} · {candidate.platforms.join(", ")}</option>)}
                </select>
            </label>
            <label className="field">
              <span>{t("missions.priority_field_label")}</span>
              <select onChange={(event) => update("priority", event.target.value as MissionPriority)} value={form.priority}>
                {missionPriorities.map((priority) => <option key={priority} value={priority}>{t(`common.${priority}`)}</option>)}
              </select>
            </label>
            <label className="field mission-status-field">
              <span>{t("common.status_field_label")}</span>
              <select onChange={(event) => update("status", event.target.value as MissionStatus)} value={form.status}>
                {missionStatuses.map((status) => <option key={status} value={status}>{t(`missions.status_${status}`)}</option>)}
              </select>
            </label>
            {(form.targetSpecialty === "ranger" || form.targetSpecialty === "explorer" || form.targetSpecialty === "builder") && (
              <label className={`field mission-progress-field mission-role-progress-${form.targetSpecialty}`}>
                <span>{t("missions.progress_field_label")} {t(`common.${form.targetSpecialty}`)} <b>{form.progress}%</b></span>
                <input max={100} min={0} onChange={(event) => update("progress", Number(event.target.value))} type="range" value={form.progress} />
              </label>
            )}
            {!hideSystemStatus && <fieldset className="system-status-fieldset system-status-visible">
              <legend>{t("planet.system_status_shared_by_planet")}</legend>
              {!currentPlanetKey && <p className="field-hint">{t("planet.enter_a_valid_portal_address_to_manage_planet_status")}</p>}
              {systemStatusesLoading && <p className="field-hint">{t("planet.loading_planet_status")}</p>}
              {systemStatusesError && <p className="form-error"><CircleAlert size={14} />{t(systemStatusesError)}</p>}
              {currentPlanetKey && !systemStatusesLoading && loadedStatusErrorKey !== currentPlanetKey && (
                <div className="system-status-options">
                  {missionSystemStatuses.filter((status) => !simplified || missionSystemStatusRoles[status] === simplifiedStatusRole).map((status) => (
                    <label className={`system-status-option system-status-option-${status === "data_error" ? "error" : missionSystemStatusRoles[status]}`} key={status}>
                      <input
                        checked={loadedStatusKey === currentPlanetKey && systemStatuses.includes(status)}
                        disabled={systemStatusesSaving || !addressComplete}
                        onChange={(event) => void updateSystemStatus(status, event.target.checked)}
                        type="checkbox"
                      />
                      <span>{t(status)}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>}
          </div>
          <label className="field full-field mission-notes-field">
            <span>{t("missions.mission_notes")} <small>{t("missions.optional_max_1000_characters")}</small></span>
            <textarea
              aria-label={t("missions.mission_notes")}
              maxLength={1000}
              onChange={(event) => update("notes", event.target.value)}
              rows={3}
              value={form.notes ?? ""}
            />
          </label>
          {error && <p className="form-error"><CircleAlert size={15} />{t(error)}</p>}
          <div className="dialog-actions">
            {mission && <button className="delete-button" disabled={saving} onClick={remove} type="button"><Trash2 size={15} /> {t("common.delete")}</button>}
            <span className="action-spacer" />
            <button className="quiet-button" onClick={onClose} type="button">{t("common.cancel")}</button>
            <button className="primary-button" disabled={saving || generatingNames > 0 || !addressComplete || systemLookup?.status === "checking"} type="submit">{submitLabel}{generatingNames > 0 || systemLookup?.status === "checking" ? <Orbit aria-hidden="true" className="button-spinner" size={15} /> : <ArrowUpRight size={15} />}</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}