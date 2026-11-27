"use client";

import { useEffect, useRef, useState, type ChangeEvent, type SubmitEvent } from "react";
import { AddImageIcon, AlertIcon, CloseIcon, ConfirmAddIcon, DeleteIcon, LoadingIcon } from "@/components/shared/icons";
import { SystemAddressField, type SystemAddressValidation } from "@/components/shared/portal-address-field";
import { useLocale } from "@/components/providers/locale-provider";
import { eventLocationLabel } from "@/components/cards/event-format";
import { eventDescriptionMaxLength, eventTypes, isEventType, type EventType } from "@/lib/events/events";
import type { EventView } from "@/lib/events/event-views";
import type { TaxiStationOption } from "@/lib/messages/private-messages-store";
import type { AllianceSettings } from "@/lib/members/member-types";
import { petImageTypes } from "@/lib/pets/pets";
import { galaxyLabel, galaxyNames } from "@/lib/planets/galaxies";
import { imageUploadMaxBytes, itemNameMaxLength } from "@/lib/utils/limits";

export type EventFormValues = Readonly<{
  type: EventType;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  locationKind: "keep" | "hub" | "station" | "portal";
  stationId?: string;
  portal?: string;
  galaxy?: number;
  image: File | null;
  removeImage: boolean;
}>;

// `datetime-local` inputs hold local wall-clock time; the API stores absolute instants.
function toLocalInput(iso: string | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function toInstant(local: string) {
  return local ? new Date(local).toISOString() : "";
}

// A new event starts from "hub" when there is one; a duplicate reuses the original location.
function initialLocation(
  event: EventView | null,
  source: EventView | null,
  stations: readonly TaxiStationOption[],
  hasHub: boolean,
) {
  if (event) return "keep";
  const location = source?.location;
  if (!location) return hasHub ? "hub" : "portal";
  if (location.kind === "hub" && hasHub) return "hub";
  const station =
    location.kind === "station"
      ? stations.find((entry) => entry.portal === location.portal && entry.galaxy === location.galaxy)
      : undefined;
  return station ? `station:${station.id}` : "portal";
}

export function EventForm({
  event,
  source,
  stations,
  alliance,
  onClose,
  onSave,
}: Readonly<{
  // The event being edited; null when creating.
  event: EventView | null;
  // The event being duplicated, if any: it prefills a new one.
  source: EventView | null;
  stations: readonly TaxiStationOption[];
  alliance: AllianceSettings;
  onClose: () => void;
  onSave: (values: EventFormValues) => Promise<void>;
}>) {
  const { t } = useLocale();
  const initial = event ?? source;
  const hasHub = /^[0-9A-F]{12}$/i.test(alliance.portalCode);
  const [type, setType] = useState<EventType | "">(initial?.type ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt));
  const [location, setLocation] = useState(() => initialLocation(event, source, stations, hasHub));
  const [portal, setPortal] = useState(source?.location.portal ?? "");
  const [galaxy, setGalaxy] = useState(source?.location.galaxy ?? 0);
  const [validation, setValidation] = useState<SystemAddressValidation>({ valid: false, lookup: null });
  const [image, setImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [keepExistingImage, setKeepExistingImage] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);
  const displayedImageUrl = image?.previewUrl ?? (keepExistingImage ? event?.imageUrl : undefined);

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

  function handleImageChange(change: ChangeEvent<HTMLInputElement>) {
    const file = change.target.files?.[0];
    if (!file) return;
    setError("");
    if (!(petImageTypes as readonly string[]).includes(file.type) || file.size > imageUploadMaxBytes) {
      replaceImage(null);
      setError("events.error_image_invalid");
      return;
    }
    replaceImage(file);
  }

  async function submit(submitted: SubmitEvent<HTMLFormElement>) {
    submitted.preventDefault();
    if (!isEventType(type)) return setError("events.error_type_required");
    if (!title.trim()) return setError("events.error_title_required");
    if (!description.trim()) return setError("events.error_description_required");
    if (!startsAt) return setError("events.error_start_required");
    if (endsAt && toInstant(endsAt) <= toInstant(startsAt)) return setError("events.error_end_before_start");
    if (location === "portal" && !validation.valid) return setError("events.error_invalid_location");
    setSaving(true);
    setError("");
    try {
      await onSave({
        type,
        title,
        description,
        startsAt: toInstant(startsAt),
        endsAt: toInstant(endsAt),
        ...(location.startsWith("station:")
          ? { locationKind: "station", stationId: location.slice("station:".length) }
          : location === "portal"
            ? { locationKind: "portal", portal, galaxy }
            : { locationKind: location === "keep" ? "keep" : "hub" }),
        image: image?.file ?? null,
        removeImage: Boolean(event?.imageUrl) && !keepExistingImage,
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
        aria-labelledby="event-dialog-title"
        aria-modal="true"
        className="mission-dialog station-dialog event-dialog"
        open
      >
        <div className="dialog-heading">
          <div>
            <h2 id="event-dialog-title">{t(event ? "events.edit_event" : "events.add_event")}</h2>
          </div>
          <button aria-label={t("common.close")} className="icon-button" onClick={onClose} type="button">
            <CloseIcon size={18} />
          </button>
        </div>
        <form className="station-add-form event-form" noValidate onSubmit={(submitted) => void submit(submitted)}>
          <label className="field full-field">
            <span>{t("events.type")}</span>
            <select
              aria-label={t("events.type")}
              onChange={(change) => {
                setError("");
                setType(change.target.value as EventType | "");
              }}
              required
              value={type}
            >
              <option value="">{t("events.select_type")}</option>
              {eventTypes.map((value) => (
                <option key={value} value={value}>
                  {t(`events.type_${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="field full-field">
            <span>
              {t("events.event_title")} <small>{t("farms.max_80_characters")}</small>
            </span>
            <input
              aria-label={t("events.event_title")}
              maxLength={itemNameMaxLength}
              onChange={(change) => setTitle(change.target.value)}
              required
              value={title}
            />
          </label>
          <label className="field full-field">
            <span>{t("events.description_label")}</span>
            <textarea
              aria-label={t("events.description_label")}
              maxLength={eventDescriptionMaxLength}
              onChange={(change) => setDescription(change.target.value)}
              required
              rows={4}
              value={description}
            />
          </label>
          <div className="event-field-row full-field">
            <label className="field">
              <span>{t("events.starts_at")}</span>
              <input
                aria-label={t("events.starts_at")}
                onChange={(change) => setStartsAt(change.target.value)}
                required
                type="datetime-local"
                value={startsAt}
              />
            </label>
            <label className="field">
              <span>
                {t("events.ends_at")} <small>{t("events.optional")}</small>
              </span>
              <input
                aria-label={t("events.ends_at")}
                min={startsAt || undefined}
                onChange={(change) => setEndsAt(change.target.value)}
                type="datetime-local"
                value={endsAt}
              />
            </label>
          </div>
          <label className="field full-field">
            <span>{t("events.location")}</span>
            <select
              aria-label={t("events.location")}
              onChange={(change) => {
                setError("");
                setLocation(change.target.value);
              }}
              value={location}
            >
              {event && (
                <option value="keep">
                  {t("events.location_keep", { location: eventLocationLabel(event.location, t) })}
                </option>
              )}
              {hasHub && <option value="hub">{t("events.location_hub")}</option>}
              <option value="portal">{t("events.location_portal")}</option>
              {stations.map((station) => (
                <option key={station.id} value={`station:${station.id}`}>
                  {`${station.name || station.portal} · ${galaxyLabel(station.galaxy)} · ${station.portal}`}
                </option>
              ))}
            </select>
          </label>
          {location === "portal" && (
            <>
              <label className="field station-galaxy-select">
                <span>{t("stations.galaxy")}</span>
                <select
                  aria-label={t("stations.galaxy")}
                  onChange={(change) => setGalaxy(Number(change.target.value))}
                  value={galaxy}
                >
                  {galaxyNames.map((galaxyName, index) => (
                    <option key={index} value={index}>
                      {galaxyName}
                    </option>
                  ))}
                </select>
              </label>
              {/* Cache only: an event never spends the Almanac quota. */}
              <SystemAddressField
                address={portal}
                galaxy={galaxy}
                lookupMode="cache-only"
                onChange={setPortal}
                onStateChange={setValidation}
              />
            </>
          )}
          <div className="upload-field full-field pet-image-field">
            <span>
              {t("events.image")} <small>{t("pets.image_hint")}</small>
            </span>
            <button
              aria-label={t("pets.choose_image")}
              className={`image-preview pet-image-preview${displayedImageUrl ? "" : " pet-image-preview-empty"}`}
              onClick={() => imageInput.current?.click()}
              style={displayedImageUrl ? { backgroundImage: `url("${displayedImageUrl}")` } : undefined}
              title={t("pets.choose_image")}
              type="button"
            >
              {!displayedImageUrl && <AddImageIcon aria-hidden="true" size={20} />}
            </button>
            <div className="pet-image-actions">
              <input
                accept={petImageTypes.join(",")}
                aria-label={t("events.image")}
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
                  <DeleteIcon size={16} />
                </button>
              )}
            </div>
          </div>
          {error && (
            <p className="form-error full-field" role="alert">
              <AlertIcon size={15} />
              {t(error)}
            </p>
          )}
          <button className="primary-button full-field" disabled={saving} type="submit">
            {saving ? (
              <LoadingIcon aria-hidden="true" className="button-spinner" size={15} />
            ) : (
              <ConfirmAddIcon size={15} />
            )}
            {t(event ? "events.save_changes" : "events.add_event")}
          </button>
        </form>
      </dialog>
    </div>
  );
}
