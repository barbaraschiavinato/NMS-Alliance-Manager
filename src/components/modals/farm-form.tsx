"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SubmitEvent } from "react";
import { CircleAlert, Orbit, Pencil, Plus, Search, X } from "lucide-react";
import { SystemAddressField, type SystemAddressValidation } from "@/components/shared/portal-address-field";
import { useLocale } from "@/components/providers/locale-provider";
import type { AllianceMember } from "@/lib/members/member-types";
import { galaxyNames } from "@/lib/planets/galaxies";
import { plantResourceProduct, plantResourceSearchText } from "@/lib/planets/plant-products";
import { generateSystemName } from "@/lib/planets/system-name";
import { decodePortalAddress } from "@/lib/missions/missions";
import { isSameSystem } from "@/lib/navigation/detail-links";
import { farmMaterials, farmPlants, type Farm, type FarmResource, type FarmStationName } from "@/lib/farms/farms";
import {
  coordinatesMaxLength,
  itemNameMaxLength,
  noteMaxLength,
  planetNameMaxLength,
  systemNameMaxLength,
} from "@/lib/utils/limits";

export type FarmFormValues = Readonly<{
  name: string;
  portal: string;
  galaxy: number;
  systemName: string;
  planetName: string;
  resources: FarmResource[];
  coordinates: string;
  note: string;
  ownerId: string;
}>;

export function FarmResourcePicker({
  selected,
  onChange,
}: Readonly<{
  selected: readonly FarmResource[];
  onChange: (resources: FarmResource[]) => void;
}>) {
  const { t, tv } = useLocale();
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLocaleLowerCase();
  const groups = [
    { key: "materials", title: "farms.materials", items: farmMaterials },
    { key: "plants", title: "farms.plants", items: farmPlants },
  ] as const;

  function toggle(resource: FarmResource) {
    const next = selected.includes(resource) ? selected.filter((item) => item !== resource) : [...selected, resource];
    onChange(next);
  }

  return (
    <fieldset className="farm-resource-picker full-field">
      <legend>
        {t("farms.resources")} <small>{t("farms.selected_count", { count: selected.length })}</small>
      </legend>
      <label className="search-field farm-resource-search">
        <Search size={15} />
        <input
          aria-label={t("farms.search_resources")}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t("farms.search_resources")}
          value={filter}
        />
      </label>
      <div className="farm-resource-groups">
        {groups.map((group) => {
          const items = (group.items as readonly FarmResource[])
            .map((resource) => {
              const label = tv(group.key === "plants" ? plantResourceProduct(resource) : resource);
              return {
                resource,
                label,
                searchText:
                  group.key === "plants"
                    ? plantResourceSearchText(resource, tv)
                    : `${resource} ${label}`.toLocaleLowerCase(),
              };
            })
            .filter(({ searchText }) => !query || searchText.includes(query))
            .sort((left, right) => left.label.localeCompare(right.label));
          if (items.length === 0) return null;
          return (
            <div className={`farm-resource-group farm-resource-group-${group.key}`} key={group.key}>
              <strong>{t(group.title)}</strong>
              <div className="platform-options farm-resource-options">
                {items.map(({ resource, label }) => (
                  <label className="platform-option" key={resource}>
                    <input checked={selected.includes(resource)} onChange={() => toggle(resource)} type="checkbox" />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FarmForm({
  farm,
  currentMember,
  canChooseOwner,
  members,
  stationNames,
  onClose,
  onSave,
}: Readonly<{
  farm: Farm | null;
  currentMember: AllianceMember;
  canChooseOwner: boolean;
  members: readonly AllianceMember[];
  stationNames: readonly FarmStationName[];
  onClose: () => void;
  onSave: (values: FarmFormValues) => Promise<void>;
}>) {
  const { t } = useLocale();
  const [name, setName] = useState(farm?.name ?? "");
  const [portal, setPortal] = useState(farm?.portal ?? "");
  const [galaxy, setGalaxy] = useState(farm?.galaxy ?? 0);
  const [systemNameOverride, setSystemNameOverride] = useState<string | null>(farm?.systemName ?? null);
  const [planetName, setPlanetName] = useState(farm?.planetName ?? "");
  const [resources, setResources] = useState<FarmResource[]>(farm ? [...farm.resources] : []);
  const [coordinates, setCoordinates] = useState(farm?.coordinates ?? "");
  const [note, setNote] = useState(farm?.note ?? "");
  const [ownerId, setOwnerId] = useState(farm ? (farm.ownerId ?? "") : currentMember.publicId);
  const [validation, setValidation] = useState<SystemAddressValidation>({ valid: Boolean(farm), lookup: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resolvedSystemName, setResolvedSystemName] = useState<{
    portal: string;
    galaxy: number;
    name: string | null;
  } | null>(null);
  const nameResolutionVersion = useRef(0);
  const planetNameEdited = useRef(Boolean(farm));
  const addressUnchanged = Boolean(farm) && portal === farm?.portal && galaxy === farm?.galaxy;
  const lookupPending = validation.valid && !validation.lookup && !addressUnchanged;
  const decoded = decodePortalAddress(portal);
  const validPortal = decoded?.kind === "portal" && decoded.errors.length === 0;
  const stationName = validPortal
    ? stationNames.find((station) => isSameSystem(station, { portal, galaxy }))?.name
    : undefined;
  const nameResolved = resolvedSystemName?.portal === portal && resolvedSystemName.galaxy === galaxy;
  const systemName = systemNameOverride ?? stationName ?? (nameResolved ? resolvedSystemName.name : "") ?? "";
  const systemNamePending = validPortal && systemNameOverride === null && !stationName && !nameResolved;
  const systemNameUnavailable =
    validPortal && systemNameOverride === null && !stationName && nameResolved && !resolvedSystemName.name;
  const ownerOptions = useMemo(() => {
    const others = members
      .filter((candidate) => candidate.publicId !== currentMember.publicId)
      .sort((left, right) => (left.nmsName || left.name).localeCompare(right.nmsName || right.name));
    return [currentMember, ...others];
  }, [currentMember, members]);
  const handleValidation = useCallback((state: SystemAddressValidation) => setValidation(state), []);

  useEffect(() => {
    if (!validPortal || systemNameOverride !== null || stationName) return;
    let active = true;
    const version = nameResolutionVersion.current;
    void generateSystemName(portal, galaxy)
      .then((generated) => {
        if (!active || version !== nameResolutionVersion.current) return;
        const name = generated?.trim().slice(0, systemNameMaxLength) || null;
        setResolvedSystemName({ portal, galaxy, name });
      })
      .catch((error: unknown) => {
        console.error("Unable to generate farm system name", error);
        if (active && version === nameResolutionVersion.current) {
          setResolvedSystemName({ portal, galaxy, name: null });
        }
      });
    return () => {
      active = false;
    };
  }, [portal, galaxy, stationName, systemNameOverride, validPortal]);

  function resetAddressDependentFields() {
    setError("");
    nameResolutionVersion.current += 1;
    setResolvedSystemName(null);
    if (farm && systemNameOverride === (farm.systemName ?? null)) setSystemNameOverride(null);
    if (farm && planetName === farm.planetName) planetNameEdited.current = false;
    if (!planetNameEdited.current) setPlanetName("");
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return setError("farms.error_name_required");
    if (!validation.valid) return setError("farms.error_invalid_portal_and_galaxy");
    if (!planetName.trim()) return setError("farms.error_planet_name_required");
    if (resources.length === 0) return setError("farms.error_resources_required");
    setSaving(true);
    setError("");
    try {
      await onSave({ name, portal, galaxy, systemName, planetName, resources, coordinates, note, ownerId });
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : "errors.save_failed");
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <dialog
        aria-labelledby="farm-dialog-title"
        aria-modal="true"
        className="mission-dialog station-dialog farm-dialog"
        open
      >
        <div className="dialog-heading">
          <div>
            <h2 id="farm-dialog-title">{t(farm ? "farms.edit_farm" : "farms.add_farm")}</h2>
          </div>
          <button aria-label={t("common.close")} className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <form className="station-add-form farm-form" onSubmit={submit}>
          <label className="field full-field">
            <span>
              {t("farms.farm_name")} <small>{t("farms.max_80_characters")}</small>
            </span>
            <input
              aria-label={t("farms.farm_name")}
              maxLength={itemNameMaxLength}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <label className="field station-galaxy-select">
            <span>{t("stations.galaxy")}</span>
            <select
              onChange={(event) => {
                setGalaxy(Number(event.target.value));
                resetAddressDependentFields();
              }}
              value={galaxy}
            >
              {galaxyNames.map((galaxyName, index) => (
                <option key={index} value={index}>
                  {galaxyName}
                </option>
              ))}
            </select>
          </label>
          <SystemAddressField
            address={portal}
            galaxy={galaxy}
            lookupMode={farm ? "cache-only" : "farm-create"}
            onChange={(value) => {
              setPortal(value);
              resetAddressDependentFields();
            }}
            onLookupResolved={(lookup) => {
              const found = lookup.planetName?.trim();
              if (found && !planetNameEdited.current) setPlanetName(found);
            }}
            onStateChange={handleValidation}
          />
          <label className="field full-field">
            <span>
              {t("farms.system_name")} <small>{t("farms.system_name_hint")}</small>
            </span>
            <input
              aria-label={t("farms.system_name")}
              maxLength={systemNameMaxLength}
              onChange={(event) => {
                nameResolutionVersion.current += 1;
                setSystemNameOverride(event.target.value);
              }}
              value={systemName}
            />
          </label>
          {systemNameUnavailable && (
            <p className="form-error full-field" role="status">
              <CircleAlert size={15} />
              {t("farms.error_system_name_unavailable")}
            </p>
          )}
          <label className="field full-field">
            <span>
              {t("farms.planet_name")} <small>{t("farms.planet_name_hint")}</small>
            </span>
            <input
              aria-label={t("farms.planet_name")}
              maxLength={planetNameMaxLength}
              onChange={(event) => {
                planetNameEdited.current = event.target.value.trim() !== "";
                setPlanetName(event.target.value);
              }}
              required
              value={planetName}
            />
          </label>
          <FarmResourcePicker onChange={setResources} selected={resources} />
          <label className="field full-field">
            <span>
              {t("farms.coordinates")} <small>{t("farms.coordinates_hint")}</small>
            </span>
            <input
              aria-label={t("farms.coordinates")}
              maxLength={coordinatesMaxLength}
              onChange={(event) => setCoordinates(event.target.value)}
              placeholder="+12.34, -56.78"
              value={coordinates}
            />
          </label>
          <label className="field full-field">
            <span>
              {t("farms.notes")} <small>{t("stations.optional_max_1000_characters")}</small>
            </span>
            <textarea
              aria-label={t("farms.notes")}
              maxLength={noteMaxLength}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              value={note}
            />
          </label>
          {canChooseOwner && (
            <label className="field">
              <span>
                {t("farms.owner")} <small>{t("common.optional")}</small>
              </span>
              <select
                aria-label={t("farms.owner")}
                onChange={(event) => setOwnerId(event.target.value)}
                value={ownerId}
              >
                <option value="">{t("farms.unassigned")}</option>
                {ownerId !== "" && !ownerOptions.some((candidate) => candidate.publicId === ownerId) && (
                  <option value={ownerId}>{t("farms.former_member")}</option>
                )}
                {ownerOptions.map((candidate) => (
                  <option key={candidate.publicId} value={candidate.publicId}>
                    {candidate.nmsName || candidate.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error && (
            <p className="form-error">
              <CircleAlert size={15} />
              {t(error)}
            </p>
          )}
          <div className="dialog-actions">
            <span className="action-spacer" />
            <button className="quiet-button" onClick={onClose} type="button">
              {t("common.cancel")}
            </button>
            <button
              className="primary-button"
              disabled={saving || lookupPending || systemNamePending || !validation.valid}
              type="submit"
            >
              {saving ? t("common.saving") : t(farm ? "common.save" : "common.add")}
              {lookupPending || systemNamePending ? (
                <Orbit aria-hidden="true" className="button-spinner" size={15} />
              ) : farm ? (
                <Pencil size={15} />
              ) : (
                <Plus size={15} />
              )}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
