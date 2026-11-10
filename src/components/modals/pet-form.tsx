"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type SubmitEvent } from "react";
import { CircleAlert, ImagePlus, Orbit, Pencil, Plus, Trash2, X } from "lucide-react";
import { SystemAddressField, type SystemAddressValidation } from "@/components/shared/portal-address-field";
import { useLocale } from "@/components/providers/locale-provider";
import type { PetEntry } from "@/components/cards/pet-card";
import { PetTypeIcon } from "@/components/shared/pet-type-icon";
import type { AllianceMember } from "@/lib/members/member-types";
import { galaxyNames } from "@/lib/planets/galaxies";
import {
  isPetActivity,
  isPetClassGrade,
  isPetHabitat,
  isPetRarity,
  isPetType,
  petActivities,
  petClassGrades,
  petClassKeys,
  petHabitats,
  petImageTypes,
  petRarities,
  petTypes,
  type PetActivity,
  type PetClassGrade,
  type PetClassKey,
  type PetHabitat,
  type PetRarity,
  type PetType,
} from "@/lib/pets/pets";
import {
  coordinatesMaxLength,
  imageUploadMaxBytes,
  itemNameMaxLength,
  noteMaxLength,
  planetNameMaxLength,
} from "@/lib/utils/limits";

export type PetFormValues = Readonly<{
  name: string;
  petType: PetType;
  activity: PetActivity;
  habitat: PetHabitat;
  rarity: PetRarity;
  eggTradeAvailable: boolean;
  image: File | null;
  removeImage: boolean;
  portal: string;
  galaxy: number;
  planetName: string;
  coordinates: string;
  note: string;
  ownerId: string;
  classes: Readonly<Record<PetClassKey, PetClassGrade>>;
}>;

export function PetForm({
  pet,
  currentMember,
  canChooseOwner,
  members,
  onClose,
  onSave,
}: Readonly<{
  pet: PetEntry | null;
  currentMember: AllianceMember;
  canChooseOwner: boolean;
  members: readonly AllianceMember[];
  onClose: () => void;
  onSave: (values: PetFormValues) => Promise<void>;
}>) {
  const { t } = useLocale();
  const [name, setName] = useState(pet?.name ?? "");
  const [petType, setPetType] = useState<PetType | "">(pet?.petType ?? "");
  const [activity, setActivity] = useState<PetActivity>(pet?.activity ?? "unknown");
  const [habitat, setHabitat] = useState<PetHabitat>(pet?.habitat ?? "unknown");
  const [rarity, setRarity] = useState<PetRarity>(pet?.rarity ?? "unknown");
  const [eggTradeAvailable, setEggTradeAvailable] = useState(pet?.eggTradeAvailable ?? false);
  const [image, setImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [keepExistingImage, setKeepExistingImage] = useState(Boolean(pet?.imageUrl));
  const displayedImageUrl = image?.previewUrl ?? (keepExistingImage ? pet?.imageUrl : undefined);
  const imageInput = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);
  const [portal, setPortal] = useState(pet?.portal ?? "");
  const [galaxy, setGalaxy] = useState(pet?.galaxy ?? 0);
  const [planetName, setPlanetName] = useState(pet?.planetName ?? "");
  const [coordinates, setCoordinates] = useState(pet?.coordinates ?? "");
  const [note, setNote] = useState(pet?.note ?? "");
  const [ownerId, setOwnerId] = useState(pet ? (pet.ownerId ?? "") : currentMember.publicId);
  const [classes, setClasses] = useState<Record<PetClassKey, PetClassGrade | "">>({
    combat: pet?.classes.combat ?? "",
    agility: pet?.classes.agility ?? "",
    health: pet?.classes.health ?? "",
  });
  const [validation, setValidation] = useState<SystemAddressValidation>({ valid: Boolean(pet), lookup: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const planetNameEdited = useRef(Boolean(pet));
  const addressUnchanged = Boolean(pet) && portal === pet?.portal && galaxy === pet?.galaxy;
  // The Almanac lookup never blocks saving: the planet may be missing from the Almanac or its galaxies.
  const lookupPending = validation.valid && !validation.lookup && !addressUnchanged;
  const ownerOptions = useMemo(() => {
    const others = members
      .filter((candidate) => candidate.publicId !== currentMember.publicId)
      .sort((left, right) => (left.nmsName || left.name).localeCompare(right.nmsName || right.name));
    return [currentMember, ...others];
  }, [currentMember, members]);
  const handleValidation = useCallback((state: SystemAddressValidation) => setValidation(state), []);

  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  function replaceImage(file: File | null) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = file ? URL.createObjectURL(file) : null;
    setImage(file && previewUrl.current ? { file, previewUrl: previewUrl.current } : null);
    if (!file && imageInput.current) imageInput.current.value = "";
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    if (!(petImageTypes as readonly string[]).includes(file.type) || file.size > imageUploadMaxBytes) {
      replaceImage(null);
      setError("pets.error_image_invalid");
      return;
    }
    replaceImage(file);
  }

  function resetAddressDependentFields() {
    setError("");
    if (pet && planetName === pet.planetName) planetNameEdited.current = false;
    if (!planetNameEdited.current) setPlanetName("");
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return setError("pets.error_name_required");
    if (!isPetType(petType)) return setError("pets.error_type_required");
    if (!validation.valid) return setError("farms.error_invalid_portal_and_galaxy");
    if (!planetName.trim()) return setError("farms.error_planet_name_required");
    const { combat, agility, health } = classes;
    if (!isPetClassGrade(combat) || !isPetClassGrade(agility) || !isPetClassGrade(health)) {
      return setError("pets.error_classes_required");
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        name,
        petType,
        activity,
        habitat,
        rarity,
        eggTradeAvailable,
        image: image?.file ?? null,
        removeImage: Boolean(pet?.imageUrl) && !keepExistingImage,
        portal,
        galaxy,
        planetName,
        coordinates,
        note,
        ownerId,
        classes: { combat, agility, health },
      });
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : "errors.save_failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <dialog
        aria-labelledby="pet-dialog-title"
        aria-modal="true"
        className="mission-dialog station-dialog pet-dialog"
        open
      >
        <div className="dialog-heading">
          <div>
            <h2 id="pet-dialog-title">{t(pet ? "pets.edit_pet" : "pets.add_pet")}</h2>
          </div>
          <button aria-label={t("common.close")} className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <form className="station-add-form pet-form" onSubmit={submit}>
          <label className="field full-field">
            <span>
              {t("pets.pet_name")} <small>{t("farms.max_80_characters")}</small>
            </span>
            <input
              aria-label={t("pets.pet_name")}
              maxLength={itemNameMaxLength}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <div className="pet-field-row full-field">
            {petClassKeys.map((key) => (
              <label className="field" key={key}>
                <span>{t(`pets.${key}`)}</span>
                <select
                  aria-label={t(`pets.${key}`)}
                  onChange={(event) => {
                    setError("");
                    setClasses((current) => ({ ...current, [key]: event.target.value as PetClassGrade | "" }));
                  }}
                  required
                  value={classes[key]}
                >
                  <option value="">{t("pets.select_class")}</option>
                  {petClassGrades.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="pet-field-row full-field">
            <label className="field">
              <span>
                {t("pets.pet_type")}
                {isPetType(petType) && <PetTypeIcon size={16} type={petType} />}
              </span>
              <select
                aria-label={t("pets.pet_type")}
                onChange={(event) => {
                  setError("");
                  setPetType(event.target.value as PetType | "");
                }}
                required
                value={petType}
              >
                <option value="">{t("pets.select_type")}</option>
                {petTypes.map((type) => (
                  <option key={type} value={type}>
                    {t(`pets.type_${type}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="pet-toggle-field">
              <span>{t("pets.egg_trade")}</span>
              <div className="pet-toggle">
                <input
                  aria-label={t("pets.egg_trade")}
                  checked={eggTradeAvailable}
                  onChange={(event) => setEggTradeAvailable(event.target.checked)}
                  role="switch"
                  type="checkbox"
                />
                <strong>{t(eggTradeAvailable ? "pets.egg_trade_yes" : "pets.egg_trade_no")}</strong>
              </div>
            </label>
          </div>
          <div className="pet-field-row full-field">
            <label className="field">
              <span>{t("pets.activity")}</span>
              <select
                aria-label={t("pets.activity")}
                onChange={(event) => {
                  if (isPetActivity(event.target.value)) setActivity(event.target.value);
                }}
                value={activity}
              >
                {petActivities.map((value) => (
                  <option key={value} value={value}>
                    {t(`pets.activity_${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t("pets.habitat")}</span>
              <select
                aria-label={t("pets.habitat")}
                onChange={(event) => {
                  if (isPetHabitat(event.target.value)) setHabitat(event.target.value);
                }}
                value={habitat}
              >
                {petHabitats.map((value) => (
                  <option key={value} value={value}>
                    {t(`pets.habitat_${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t("pets.rarity")}</span>
              <select
                aria-label={t("pets.rarity")}
                onChange={(event) => {
                  if (isPetRarity(event.target.value)) setRarity(event.target.value);
                }}
                value={rarity}
              >
                {petRarities.map((value) => (
                  <option key={value} value={value}>
                    {t(`pets.rarity_${value}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="upload-field full-field pet-image-field">
            <span>
              {t("pets.image")} <small>{t("pets.image_hint")}</small>
            </span>
            <button
              aria-label={t("pets.choose_image")}
              className={`image-preview pet-image-preview${displayedImageUrl ? "" : " pet-image-preview-empty"}`}
              data-tooltip={t("pets.choose_image")}
              onClick={() => imageInput.current?.click()}
              style={displayedImageUrl ? { backgroundImage: `url("${displayedImageUrl}")` } : undefined}
              type="button"
            >
              {!displayedImageUrl && <ImagePlus aria-hidden="true" size={20} />}
            </button>
            <div className="pet-image-actions">
              <input
                accept={petImageTypes.join(",")}
                aria-label={t("pets.image")}
                onChange={handleImageChange}
                ref={imageInput}
                type="file"
              />
              {displayedImageUrl && (
                <button
                  aria-label={t("pets.remove_image")}
                  className="square-button"
                  onClick={() => {
                    replaceImage(null);
                    setKeepExistingImage(false);
                  }}
                  title={t("pets.remove_image")}
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
          <label className="field full-field">
            <span>
              {t("pets.notes")} <small>{t("stations.optional_max_1000_characters")}</small>
            </span>
            <textarea
              aria-label={t("pets.notes")}
              maxLength={noteMaxLength}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              value={note}
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
            lookupMode={pet ? "cache-only" : undefined}
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
          {canChooseOwner && (
            <label className="field">
              <span>
                {t("pets.discoverer")} <small>{t("common.optional")}</small>
              </span>
              <select
                aria-label={t("pets.discoverer")}
                onChange={(event) => setOwnerId(event.target.value)}
                value={ownerId}
              >
                <option value="">{t("pets.unassigned")}</option>
                {ownerId !== "" && !ownerOptions.some((candidate) => candidate.publicId === ownerId) && (
                  <option value={ownerId}>{t("pets.former_member")}</option>
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
            <button className="primary-button" disabled={saving || lookupPending || !validation.valid} type="submit">
              {saving ? t("common.saving") : t(pet ? "common.save" : "common.add")}
              {lookupPending ? (
                <Orbit aria-hidden="true" className="button-spinner" size={15} />
              ) : pet ? (
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
