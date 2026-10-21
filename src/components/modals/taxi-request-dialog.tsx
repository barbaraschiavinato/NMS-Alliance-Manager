"use client";

import { useEffect, useId, useRef, useState, type SubmitEvent } from "react";
import { ChevronDown, CircleAlert, Send, X } from "lucide-react";
import { galaxyLabel, galaxyNames } from "@/lib/galaxies";
import type { TaxiStationOption } from "@/lib/private-messages-store";
import type { AllianceSettings } from "@/lib/member-types";
import { useLocale } from "@/components/providers/locale-provider";

function TaxiCombobox({
  label,
  options,
  value,
  onChange,
  placeholder,
  toggleLabel,
  noResultsLabel,
  invalidMessage,
}: Readonly<{
  label: string;
  options: readonly Readonly<{ id: string; label: string }>[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  toggleLabel: string;
  noResultsLabel: string;
  invalidMessage: string;
}>) {
  const optionsId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [activeOption, setActiveOption] = useState(0);
  const [inputText, setInputText] = useState<string | null>(null);
  const selectedOption = options.find((option) => option.id === value);
  const invalid = inputText !== null && !selectedOption;
  const filteredOptions = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()),
  );

  useEffect(() => {
    if (open) listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeOption, filter]);

  function openOptions() {
    setOpen(true);
    setFilter("");
    setActiveOption(0);
  }

  function selectOption(option: Readonly<{ id: string; label: string }>) {
    onChange(option.id);
    setInputText(null);
    setOpen(false);
  }

  return (
    <div className="field">
      <label htmlFor={`${optionsId}-input`}>{label}</label>
      <div
        className="taxi-combobox"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <input
          id={`${optionsId}-input`}
          ref={inputRef}
          role="combobox"
          aria-controls={optionsId}
          aria-expanded={open}
          aria-autocomplete="list"
          aria-activedescendant={open && filteredOptions.length ? `${optionsId}-${activeOption}` : undefined}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${optionsId}-error` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          value={inputText ?? selectedOption?.label ?? ""}
          onFocus={(event) => {
            event.currentTarget.select();
            openOptions();
          }}
          onClick={() => {
            if (!open) openOptions();
          }}
          onChange={(event) => {
            const text = event.target.value;
            setInputText(text);
            onChange(options.find((option) => option.label === text)?.id ?? "");
            setFilter(text);
            setOpen(true);
            setActiveOption(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) {
                openOptions();
              } else if (filteredOptions.length) {
                setActiveOption(
                  (current) =>
                    (current + (event.key === "ArrowDown" ? 1 : -1) + filteredOptions.length) % filteredOptions.length,
                );
              }
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              if (filteredOptions[activeOption]) selectOption(filteredOptions[activeOption]);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
          required
        />
        <button
          type="button"
          className="taxi-combobox-toggle"
          aria-label={toggleLabel}
          aria-controls={optionsId}
          aria-expanded={open}
          onClick={() => {
            inputRef.current?.focus();
            setFilter("");
            setActiveOption(0);
            setOpen(!open);
          }}
        >
          <ChevronDown size={18} aria-hidden="true" />
        </button>
        {open && (
          <div ref={listRef} id={optionsId} role="listbox" aria-label={label} className="taxi-combobox-options">
            {filteredOptions.map((option, index) => (
              <div
                key={option.id}
                id={`${optionsId}-${index}`}
                role="option"
                aria-selected={value === option.id}
                data-active={index === activeOption}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
              >
                {option.label}
              </div>
            ))}
            {!filteredOptions.length && <p role="status">{noResultsLabel}</p>}
          </div>
        )}
      </div>
      {invalid && (
        <span id={`${optionsId}-error`} className="form-error">
          {invalidMessage}
        </span>
      )}
    </div>
  );
}

export function TaxiRequestDialog({
  stations,
  alliance,
  onClose,
  onSaved,
}: Readonly<{
  stations: readonly TaxiStationOption[];
  alliance: AllianceSettings;
  onClose: () => void;
  onSaved: () => void;
}>) {
  const { t } = useLocale();
  const [galaxy, setGalaxy] = useState("");
  const [meetingId, setMeetingId] = useState("offline");
  const stationId = meetingId !== "offline" && meetingId !== "arrange" && meetingId !== "hub" ? meetingId : "";
  const [message, setMessage] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meetingId || galaxy === "") {
      setError(!meetingId ? "taxi.choose_meeting_point" : "taxi.choose_galaxy");
      return;
    }
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/taxi-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          galaxy: Number(galaxy),
          meetingPoint: stationId ? "station" : meetingId,
          ...(stationId ? { stationId } : {}),
        }),
      });
      if (!response.ok) {
        const body: unknown = await response.json();
        throw new Error(
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "taxi.request_unable_to_save",
        );
      }
      onSaved();
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : "taxi.request_unable_to_save");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <dialog aria-labelledby="taxi-request-title" aria-modal="true" className="mission-dialog member-card-dialog" open>
        <div className="dialog-heading">
          <h2 id="taxi-request-title">{t("taxi.new_request")}</h2>
          <button aria-label={t("common.close")} className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <form className="member-message-form" onSubmit={(event) => void submit(event)}>
          <TaxiCombobox
            label={t("taxi.destination_galaxy")}
            options={galaxyNames.map((name, index) => ({ id: String(index), label: `${index + 1} · ${name}` }))}
            value={galaxy}
            onChange={setGalaxy}
            placeholder={t("taxi.choose_galaxy")}
            toggleLabel={t("taxi.toggle_galaxies")}
            noResultsLabel={t("taxi.no_galaxies")}
            invalidMessage={t("taxi.choose_galaxy")}
          />
          <TaxiCombobox
            label={t("taxi.meeting_station")}
            options={[
              { id: "offline", label: t("taxi.offline") },
              { id: "arrange", label: t("taxi.no_meeting_station") },
              ...(alliance.portalCode
                ? [
                    {
                      id: "hub",
                      label: `${t("taxi.alliance_hub")} · ${galaxyLabel(alliance.galaxy)} · ${alliance.portalCode}`,
                    },
                  ]
                : []),
              ...stations.map((station) => ({
                id: station.id,
                label: `${station.name || station.portal} · ${galaxyLabel(station.galaxy)} · ${station.portal}`,
              })),
            ]}
            value={meetingId}
            onChange={setMeetingId}
            placeholder={t("taxi.choose_meeting_point")}
            toggleLabel={t("taxi.toggle_meeting_points")}
            noResultsLabel={t("taxi.no_meeting_points")}
            invalidMessage={t("taxi.choose_meeting_point")}
          />
          <label className="field">
            <span>{t("profile.message_text")}</span>
            <textarea
              required
              maxLength={2000}
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <label className="message-acknowledgement">
            <input
              type="checkbox"
              required
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>{t("taxi.message_notice")}</span>
          </label>
          {error && (
            <p className="form-error">
              <CircleAlert size={15} />
              {t(error)}
            </p>
          )}
          <button
            className="primary-button"
            disabled={sending || galaxy === "" || !meetingId || !message.trim() || !acknowledged}
            type="submit"
          >
            <Send size={15} />
            {t("help.send_request")}
          </button>
        </form>
      </dialog>
    </div>
  );
}
