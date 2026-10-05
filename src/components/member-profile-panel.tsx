"use client";

import { useState, type SubmitEvent } from "react";
import { Compass, Hammer, Search, Check, CircleAlert, X } from "lucide-react";
import { memberSpecialties, nmsPlatforms, type AllianceMember, type MemberRole, type MemberSpecialty, type NmsPlatform } from "@/lib/member-types";

const roleLabels: Record<MemberRole, string> = {
  user: "Utente",
  moderator: "Moderatore",
  admin: "Admin",
};

const specialtyLabels: Record<MemberSpecialty, string> = {
  builder: "Costruttore",
  ranger: "Ranger",
  explorer: "Esploratore",
};

export function MemberProfilePanel({ member, onClose, onSaved }: Readonly<{
  member: AllianceMember;
  onClose: () => void;
  onSaved: (profile: Pick<AllianceMember, "nmsName" | "nmsCode" | "platforms" | "specialty">) => void;
}>) {
  const [nmsName, setNmsName] = useState(member.nmsName);
  const [nmsCode, setNmsCode] = useState(member.nmsCode);
  const [platforms, setPlatforms] = useState<NmsPlatform[]>(member.platforms);
  const [specialty, setSpecialty] = useState<MemberSpecialty | "">(member.specialty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function togglePlatform(platform: NmsPlatform) {
    setPlatforms((current) => current.includes(platform)
      ? current.filter((item) => item !== platform)
      : [...current, platform]);
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nmsName, nmsCode, platforms, specialty }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Impossibile salvare il profilo.");
      onSaved(body as Pick<AllianceMember, "nmsName" | "nmsCode" | "platforms" | "specialty">);
      setSaved(true);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Impossibile salvare il profilo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <dialog aria-labelledby="profile-title" aria-modal="true" className="mission-dialog profile-dialog" open>
        <div className="dialog-heading">
          <div><span className="eyebrow">PROFILO MEMBRO</span><h2 id="profile-title">Il mio profilo NMS</h2></div>
          <button aria-label="Chiudi" className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="profile-identity">
            <span className="profile-google-avatar">{member.image ? <span style={{ backgroundImage: `url("${member.image}")` }} /> : member.name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{member.email}</strong><small>Ruolo assegnato dall’amministratore: {roleLabels[member.role]}</small></span>
          </div>
          <label className="field full-field">
            <span>Nome in gioco</span>
            <input autoComplete="nickname" maxLength={40} onChange={(event) => setNmsName(event.target.value)} placeholder="Nome comandante" required value={nmsName} />
          </label>
          <label className="field full-field">
            <span>Codice amico NMS <small>12 cifre</small></span>
            <input
              autoComplete="off"
              inputMode="numeric"
              maxLength={12}
              onChange={(event) => setNmsCode(event.target.value.replace(/\D/g, "").slice(0, 12))}
              pattern="\d{12}"
              placeholder="0000 0000 0000"
              required
              value={nmsCode}
            />
          </label>
          <fieldset className="platform-fieldset">
            <legend>Piattaforme <small>seleziona tutte quelle che usi</small></legend>
            <div className="platform-options">
              {nmsPlatforms.map((platform) => <label className="platform-option" key={platform}>
                <input checked={platforms.includes(platform)} onChange={() => togglePlatform(platform)} type="checkbox" />
                <span>{platform}</span>
              </label>)}
            </div>
          </fieldset>
          <fieldset className="specialty-fieldset">
            <legend>Come giochi? <small>scegli la tua specializzazione</small></legend>
            <div className="specialty-options" role="radiogroup" aria-label="Specializzazione NMS">
              {memberSpecialties.map((item) => {
                const Icon = item === "builder" ? Hammer : item === "ranger" ? Compass : Search;
                return <label className={`specialty-option ${specialty === item ? "selected" : ""}`} key={item}>
                  <input checked={specialty === item} name="specialty" onChange={() => setSpecialty(item)} type="radio" value={item} />
                  <Icon size={18} />
                  <span>{specialtyLabels[item]}</span>
                </label>;
              })}
            </div>
          </fieldset>
          {error && <p className="form-error"><CircleAlert size={15} />{error}</p>}
          {saved && <p className="address-validation address-valid"><Check size={14} />Profilo salvato</p>}
          <div className="dialog-actions">
            <span className="action-spacer" />
            <button className="quiet-button" onClick={onClose} type="button">Chiudi</button>
            <button className="primary-button" disabled={busy || !nmsName.trim() || nmsCode.length !== 12 || platforms.length === 0 || !specialty} type="submit">{busy ? "Salvataggio…" : "Salva profilo"}</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}