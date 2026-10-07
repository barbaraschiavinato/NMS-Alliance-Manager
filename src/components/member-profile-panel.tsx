"use client";

import { useState, type SubmitEvent } from "react";
import { Compass, Hammer, Search, Check, CircleAlert, X } from "lucide-react";
import { isValidNmsFriendCode, memberSpecialties, normalizeNmsFriendCode, nmsPlatforms, type AllianceMember, type MemberRole, type MemberSpecialty, type NmsPlatform } from "@/lib/member-types";
import { useLocale } from "@/components/locale-provider";

const roleLabels: Record<MemberRole, string> = {
  user: "Member",
  moderator: "Moderator",
  admin: "Administrator",
};

const specialtyLabels: Record<MemberSpecialty, string> = {
  builder: "Builder",
  ranger: "Ranger",
  explorer: "Explorer",
};

export function MemberProfilePanel({ member, onClose, onSaved }: Readonly<{
  member: AllianceMember;
  onClose: () => void;
  onSaved: (profile: Pick<AllianceMember, "nmsName" | "nmsCode" | "platforms" | "specialty">) => void;
}>) {
  const { t } = useLocale();
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
      if (!response.ok) throw new Error(body.error ?? "Unable to save the profile.");
      onSaved(body as Pick<AllianceMember, "nmsName" | "nmsCode" | "platforms" | "specialty">);
      setSaved(true);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : t("Unable to save the profile."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <dialog aria-labelledby="profile-title" aria-modal="true" className="mission-dialog profile-dialog" open>
        <div className="dialog-heading">
          <div><span className="eyebrow">{t("MEMBER PROFILE")}</span><h2 id="profile-title">{t("My NMS profile")}</h2></div>
          <button aria-label={t("Close")} className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="profile-identity">
            <span className="profile-google-avatar">{member.image ? <span style={{ backgroundImage: `url("${member.image}")` }} /> : member.name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{member.email}</strong><small>{t("Role assigned by administrator: {role}", { role: t(roleLabels[member.role]) })}</small></span>
          </div>
          <label className="field full-field">
            <span>{t("In-game name")}</span>
            <input autoComplete="nickname" maxLength={40} onChange={(event) => setNmsName(event.target.value)} placeholder={t("In-game name")} required value={nmsName} />
          </label>
          <label className="field full-field">
            <span>{t("NMS friend code")} <small>{t("13 alphanumeric characters")}</small></span>
            <input
              autoComplete="off"
              autoCapitalize="characters"
              inputMode="text"
              maxLength={15}
              onChange={(event) => setNmsCode(normalizeNmsFriendCode(event.target.value).slice(0, 13))}
              pattern="[A-Z0-9]{13}"
              placeholder="JZKW-8HFP-6DCAG"
              required
              value={nmsCode}
            />
          </label>
          <fieldset className="platform-fieldset">
            <legend>{t("Platforms")} <small>{t("select all that you use")}</small></legend>
            <div className="platform-options">
              {nmsPlatforms.map((platform) => <label className="platform-option" key={platform}>
                <input checked={platforms.includes(platform)} onChange={() => togglePlatform(platform)} type="checkbox" />
                <span>{platform}</span>
              </label>)}
            </div>
          </fieldset>
          <fieldset className="specialty-fieldset">
            <legend>{t("How do you play?")} <small>{t("choose your specialty")}</small></legend>
            <div className="specialty-options" role="radiogroup" aria-label={t("NMS specialty")}>
              {memberSpecialties.map((item) => {
                const Icon = item === "builder" ? Hammer : item === "ranger" ? Compass : Search;
                return <label className={`specialty-option ${specialty === item ? "selected" : ""}`} key={item}>
                  <input checked={specialty === item} name="specialty" onChange={() => setSpecialty(item)} type="radio" value={item} />
                  <Icon size={18} />
                  <span>{t(specialtyLabels[item])}</span>
                </label>;
              })}
            </div>
          </fieldset>
          {error && <p className="form-error"><CircleAlert size={15} />{t(error)}</p>}
          {saved && <p className="address-validation address-valid"><Check size={14} />{t("Profile saved")}</p>}
          <div className="dialog-actions">
            <span className="action-spacer" />
            <button className="quiet-button" onClick={onClose} type="button">{t("Close")}</button>
            <button className="primary-button" disabled={busy || !nmsName.trim() || !isValidNmsFriendCode(nmsCode) || platforms.length === 0 || !specialty} type="submit">{busy ? t("Saving…") : t("Save profile")}</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}