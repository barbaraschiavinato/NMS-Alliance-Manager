import { useEffect, useEffectEvent, useState } from "react";
import Image from "next/image";
import { ArrowLeft, Check, CircleAlert, X } from "lucide-react";
import { decodePortalAddress } from "@/lib/missions";
import { useLocale } from "@/components/locale-provider";

export type SystemAddressLookup = Readonly<{
  address: string;
  galaxy: number;
  status: "checking" | "found" | "not-found" | "unavailable";
  systemLabel?: string | null;
  planetType?: string | null;
}>;

export type SystemAddressValidation = Readonly<{
  valid: boolean;
  lookup: SystemAddressLookup | null;
}>;

const glyphCharacters = "0123456789ABCDEF".split("");
const glyphAsset = (glyph: string) => `/glyphs/glyph-mask-${glyph}.png`;

export function GlyphStrip({ address, large = false }: Readonly<{ address: string; large?: boolean }>) {
  const { t } = useLocale();
  return (
    <span aria-label={t("Glifi inseriti: {count} su 12", { count: address.length })} className={`glyph-strip ${large ? "glyph-strip-large" : ""}`}>
      {Array.from({ length: 12 }, (_, index) => {
        const glyph = address[index];
        return (
          <span aria-hidden="true" className={`glyph-slot ${glyph ? "glyph-slot-filled" : ""}`} key={index}>
            {glyph && <Image alt="" height={large ? 24 : 16} loading={large ? "eager" : "lazy"} src={glyphAsset(glyph)} unoptimized width={large ? 24 : 16} />}
          </span>
        );
      })}
    </span>
  );
}

function PortalBreakdown({ address, decoded, lookup }: Readonly<{
  address: string;
  decoded: ReturnType<typeof decodePortalAddress>;
  lookup: SystemAddressLookup | null;
}>) {
  const { t } = useLocale();
  const parts = [
    { label: "PLANET", start: 0, width: 1 },
    { label: "SYSTEM", start: 1, width: 3 },
    { label: "Y", start: 4, width: 2, signedBits: 8 as const },
    { label: "Z", start: 6, width: 3, signedBits: 12 as const },
    { label: "X", start: 9, width: 3, signedBits: 12 as const },
  ];
  const errorPrefixes: Record<string, string> = {
    PLANET: "Indice pianeta ",
    SYSTEM: "Indice sistema ",
    Y: "Coordinata Y ",
    Z: "Coordinata Z ",
    X: "Coordinata X ",
  };
  const almanacError = lookup?.address === address &&
    (lookup.status === "not-found" || lookup.status === "unavailable");

  return (
    <div aria-label={t("Avanzamento dei cinque parametri")} className="portal-decode" role="group">
      {parts.map((part) => {
        const raw = address.slice(part.start, part.start + part.width);
        const progress = (raw.length / part.width) * 100;
        const partIsInvalid = decoded?.errors.some((message) => message.startsWith(errorPrefixes[part.label])) ?? false;
        const complete = raw.length === part.width && decoded !== null;
        const state = almanacError || partIsInvalid ? "invalid" : complete ? "valid" : "incomplete";
        const value = almanacError ? part.width : raw.length;

        return (
          <div aria-label={t(part.label)} aria-valuemax={part.width} aria-valuemin={0} aria-valuenow={value} className={`portal-decode-segment portal-decode-${state}`} key={part.label} role="progressbar">
            <div className="portal-decode-progress">
              <span style={{ width: `${almanacError ? 100 : progress}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PortalValidation({ address, decoded, lookup }: Readonly<{
  address: string;
  decoded: ReturnType<typeof decodePortalAddress>;
  lookup: SystemAddressLookup | null;
}>) {
  const { t } = useLocale();
  let statusClass = "address-incomplete";
  let statusText = t("Inserisci un indirizzo portale completo da 12 glifi");
  let statusIcon = <CircleAlert size={13} />;

  if (decoded && decoded.errors.length > 0) {
    statusClass = "address-invalid";
    statusText = decoded.errors.map((message) => t(message)).join(" ");
  } else if (decoded?.kind === "portal") {
    statusClass = "address-valid";
    statusText = t("Portale valido · indirizzo decodificato");
    statusIcon = <Check size={13} />;
  } else if (address.length > 0) {
    statusText = t("Codice incompleto · {count} di 12 glifi", { count: address.length });
  }

  const currentLookup = lookup?.address === address ? lookup : null;
  let lookupLink = false;
  if (currentLookup?.status === "checking") {
    statusText += ` · ${t("Controllo NMS Almanac…")}`;
  } else if (currentLookup?.status === "found") {
    statusText += ` · ${t("Pianeta trovato su")}`;
    lookupLink = true;
  } else if (currentLookup?.status === "not-found") {
    statusClass = "address-invalid";
    statusIcon = <CircleAlert size={13} />;
    statusText += ` · ${t("Nessun pianeta registrato da NMS Almanac; potrebbe esistere nel gioco.")}`;
  } else if (currentLookup?.status === "unavailable") {
    statusClass = "address-invalid";
    statusIcon = <CircleAlert size={13} />;
    statusText += ` · ${t("Errore NMS Almanac: servizio non raggiungibile o limite richieste raggiunto.")}`;
  }

  return (
    <div aria-live="polite" id="portal-address-validation">
      <output className={`address-validation ${statusClass}`}>
        {statusIcon}{statusText}
        {lookupLink && <a href="https://nmsalmanac.com" rel="noreferrer" target="_blank">NMS Almanac</a>}
      </output>
      {address.length > 0 && <PortalBreakdown address={address} decoded={decoded} lookup={lookup} />}
      {decoded && decoded.errors.length > 0 && <ul className="portal-errors">{decoded.errors.map((message) => <li key={message}>{t(message)}</li>)}</ul>}
    </div>
  );
}

export function SystemAddressField({ address, galaxy, onChange, onStateChange, onLookupResolved }: Readonly<{
  address: string;
  galaxy?: number;
  onChange: (value: string) => void;
  onStateChange: (state: SystemAddressValidation) => void;
  onLookupResolved?: (lookup: SystemAddressLookup) => void;
}>) {
  const { t } = useLocale();
  const [lookup, setLookup] = useState<SystemAddressLookup | null>(null);
  const decoded = decodePortalAddress(address);
  const valid = decoded !== null && decoded.errors.length === 0;
  const emitLookupResult = useEffectEvent((lookupResult: SystemAddressLookup) => onLookupResolved?.(lookupResult));
  const matchingLookup = valid && galaxy !== undefined && lookup?.address === address && lookup.galaxy === galaxy ? lookup : null;
  const visibleLookup = matchingLookup ?? (valid && galaxy !== undefined ? { address, galaxy, status: "checking" as const } : null);
  const appendGlyph = (glyph: string) => onChange(`${address}${glyph}`.slice(0, 12));

  useEffect(() => {
    if (!valid || galaxy === undefined) return;

    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ address, galaxy: String(galaxy) });
        const response = await fetch(`/api/missions/verify-system?${params}`, { signal: controller.signal });
        const result: unknown = await response.json();
        if (!response.ok || !result || typeof result !== "object" || !("found" in result) || typeof result.found !== "boolean") {
          throw new Error("System lookup unavailable");
        }
        const found = result.found === true;
        const systemLabel = "systemLabel" in result && typeof result.systemLabel === "string"
          ? result.systemLabel
          : null;
        const planetType = "planetType" in result && typeof result.planetType === "string"
          ? result.planetType
          : null;
        if (active) {
          const lookupResult = { address, galaxy, status: found ? "found" as const : "not-found" as const, systemLabel, planetType };
          setLookup(lookupResult);
          emitLookupResult(lookupResult);
        }
      } catch {
        if (active) {
          const lookupResult = { address, galaxy, status: "unavailable" as const };
          setLookup(lookupResult);
          emitLookupResult(lookupResult);
        }
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [address, galaxy, valid]);

  useEffect(() => {
    onStateChange({ valid, lookup: matchingLookup });
  }, [address, galaxy, valid, lookup, matchingLookup, onStateChange]);

  return (
    <div className="portal-field full-field">
      <div className="portal-field-heading">
        <span>{t("CODICE SISTEMA / PORTALE")} <b>{address.length}/12</b></span>
        <span>{t("GLIFI NMS · INDIRIZZO ESADECIMALE")}</span>
      </div>
      <GlyphStrip address={address} large />
      <div className="address-input-row">
        <input
          aria-label={t("Indirizzo portale di 12 glifi")}
          aria-describedby="portal-address-validation"
          aria-invalid={!valid}
          autoComplete="off"
          maxLength={12}
          onChange={(event) => onChange(event.target.value.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 12))}
          pattern="[0-9A-Fa-f]{12}"
          placeholder={t("12 glifi portale")}
          required
          spellCheck={false}
          value={address}
        />
        <button aria-label={t("Rimuovi ultimo glifo")} className="square-button" disabled={!address} onClick={() => onChange(address.slice(0, -1))} title={t("Rimuovi ultimo glifo")} type="button"><ArrowLeft size={16} /></button>
        <button aria-label={t("Cancella indirizzo")} className="square-button" disabled={!address} onClick={() => onChange("")} title={t("Cancella indirizzo")} type="button"><X size={16} /></button>
      </div>
      <div aria-label={t("Tastiera glifi portale")} className="glyph-keypad">
        {glyphCharacters.map((glyph) => <button aria-label={t("Inserisci glifo {glyph}", { glyph })} disabled={address.length >= 12} key={glyph} onClick={() => appendGlyph(glyph)} title={t("Glifo {glyph}", { glyph })} type="button"><Image alt="" height={24} loading="eager" src={glyphAsset(glyph)} unoptimized width={24} /></button>)}
      </div>
      <PortalValidation address={address} decoded={decoded} lookup={visibleLookup} />
    </div>
  );
}