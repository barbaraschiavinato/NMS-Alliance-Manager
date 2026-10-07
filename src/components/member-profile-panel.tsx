"use client";

import { useState, type SubmitEvent } from "react";
import { Compass, Hammer, Search, Check, CircleAlert, X } from "lucide-react";
import { formatNmsFriendCode, isValidNmsFriendCode, memberSpecialties, normalizeNmsFriendCode, nmsPlatforms, type AllianceMember, type MemberRole, type MemberSpecialty, type NmsPlatform } from "@/lib/member-types";
import { useLocale } from "@/components/locale-provider";

const roleLabels: Record<MemberRole, string> = {
  user: "members.member_role_label",
  moderator: "common.moderator",
  admin: "admin.administrator",
};

const specialtyLabels: Record<MemberSpecialty, string> = {
  builder: "common.builder",
  ranger: "common.ranger",
  explorer: "common.explorer",
};

export function MemberProfilePanel({ member, onClose, onSaved, createOffline = false, editOffline = false }: Readonly<{
  member: AllianceMember;
  onClose: () => void;
  onSaved: (profile: AllianceMember) => void;
  createOffline?: boolean;
  editOffline?: boolean;
}>) {
  const { t } = useLocale();
  const [nmsName, setNmsName] = useState(member.nmsName);
  const [nmsCode, setNmsCode] = useState(member.nmsCode);
  const [platforms, setPlatforms] = useState<NmsPlatform[]>(member.platforms);
  const [specialty, setSpecialty] = useState<MemberSpecialty | "">(member.specialty);
  const [simpleView, setSimpleView] = useState(member.simpleView === true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const offlineMode = createOffline || editOffline;
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
      const response = await fetch(offlineMode ? "/api/admin/members" : "/api/profile", {
        method: offlineMode ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nmsName, nmsCode, platforms, specialty, ...(offlineMode ? {} : { simpleView }), ...(editOffline ? { action: "update", offlineId: member.publicId } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save the profile.");
      onSaved(body as AllianceMember);
      if (offlineMode) onClose();
      else setSaved(true);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : t("errors.unable_to_save_the_profile"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <dialog aria-labelledby="profile-title" aria-modal="true" className="mission-dialog profile-dialog" open>
        <div className="dialog-heading">
          <div><span className="eyebrow">{t("profile.member_profile")}</span><h2 id="profile-title">{createOffline ? t("members.add_offline_player") : editOffline ? t("members.edit_offline_player") : t("profile.my_nms_profile")}</h2></div>
          <button aria-label={t("common.close")} className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          {!offlineMode && <div className="profile-identity">
            <span className="profile-google-avatar">{member.image ? <span style={{ backgroundImage: `url("${member.image}")` }} /> : member.name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{member.email}</strong><small>{t("admin.role_assigned_by_administrator_role", { role: t(roleLabels[member.role]) })}</small></span>
          </div>}
          {offlineMode && <p className="form-hint">{t("members.offline_player_hint")}</p>}
          <label className="field full-field">
            <span>{t("common.in_game_name")}</span>
            <input autoComplete="nickname" maxLength={40} onChange={(event) => setNmsName(event.target.value)} placeholder={t("common.in_game_name")} required value={nmsName} />
          </label>
          <label className="field full-field">
            <span>{t("profile.nms_friend_code_label")} <small>{t("common.13_alphanumeric_characters")}</small></span>
            <input
              autoComplete="off"
              autoCapitalize="characters"
              inputMode="text"
              maxLength={15}
              onChange={(event) => setNmsCode(normalizeNmsFriendCode(event.target.value).slice(0, 13))}
              placeholder="BMPE-S0B9-RCDMT"
              required
              value={formatNmsFriendCode(nmsCode)}
            />
          </label>
          <fieldset className="platform-fieldset">
            <legend>{t("profile.platforms_label")} <small>{t("common.select_all_that_you_use")}</small></legend>
            <div className="platform-options">
              {nmsPlatforms.map((platform) => <label className="platform-option" key={platform}>
                <input checked={platforms.includes(platform)} onChange={() => togglePlatform(platform)} type="checkbox" />
                <span>{platform}</span>
              </label>)}
            </div>
          </fieldset>
          <fieldset className="specialty-fieldset">
            <legend>{t("common.how_do_you_play")} <small>{t("profile.choose_your_specialty")}</small></legend>
            <div className="specialty-options" role="radiogroup" aria-label={t("profile.nms_specialty")}>
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
          {!offlineMode && <label className="message-acknowledgement">
            <input checked={simpleView} onChange={(event) => setSimpleView(event.target.checked)} type="checkbox" />
            <span>{t("profile.simple_view")}</span>
          </label>}
          {error && <p className="form-error"><CircleAlert size={15} />{t(error)}</p>}
          {saved && <p className="address-validation address-valid"><Check size={14} />{t("profile.profile_saved")}</p>}
          <div className="dialog-actions">
            <span className="action-spacer" />
            <button className="quiet-button" onClick={onClose} type="button">{t("common.close")}</button>
            <button className="primary-button" disabled={busy || !nmsName.trim() || !isValidNmsFriendCode(nmsCode) || !specialty} type="submit">{busy ? t("common.saving") : t("profile.save_profile")}</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}