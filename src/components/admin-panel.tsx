"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { Check, CircleAlert, ImagePlus, LayoutGrid, List, ShieldCheck, X } from "lucide-react";
import type { AllianceSettings } from "@/lib/access-store";
import { useLocale } from "@/components/locale-provider";

export function AdminPanel({ onClose, onSaved }: Readonly<{
  onClose: () => void;
  onSaved: (settings: AllianceSettings) => void;
}>) {
  const { t } = useLocale();
  const [settings, setSettings] = useState<AllianceSettings>({ name: "", logoUrl: "", bannerUrl: "", discordUrl: "", telegramUrl: "", heroGradientMode: "full", defaultTableView: "list" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/alliance", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load alliance settings.");
        setSettings(body as AllianceSettings);
      })
      .catch((error_: unknown) => setError(error_ instanceof Error ? error_.message : t("errors.unable_to_load_alliance_settings")));
  }, [t]);

  async function uploadImage(kind: "logoUrl" | "bannerUrl", file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    const formData = new FormData();
    formData.set("image", file);
    try {
      const response = await fetch("/api/admin/upload", { method: "POST", body: formData });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Upload failed.");
      setSettings((current) => ({ ...current, [kind]: body.url }));
      setMessage(t("admin.image_uploaded_save_to_publish_the_changes"));
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : t("errors.upload_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/alliance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Save failed.");
      setSettings(body as AllianceSettings);
      onSaved(body as AllianceSettings);
      setMessage(t("admin.alliance_settings_saved"));
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : t("errors.save_failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <dialog aria-labelledby="admin-title" aria-modal="true" className="mission-dialog admin-dialog" open>
        <div className="dialog-heading">
          <div><span className="eyebrow">{t("admin.administration")}</span><h2 id="admin-title">{t("admin.alliance")}</h2></div>
          <button aria-label={t("common.close")} className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <form onSubmit={saveSettings}>
          <section className="admin-section">
            <h3><ShieldCheck size={15} /> {t("admin.alliance_identity_section_heading")}</h3>
            <label className="field">
              <span>{t("admin.alliance_name")}</span>
              <input maxLength={80} onChange={(event) => setSettings((current) => ({ ...current, name: event.target.value }))} required value={settings.name} />
            </label>
            <div className="field admin-default-view">
              <span>{t("navigation.default_table_view")}</span>
              <div aria-label={t("navigation.default_table_view")} className="view-toggle admin-view-toggle" role="group">
                <button aria-pressed={settings.defaultTableView === "list"} className={settings.defaultTableView === "list" ? "selected" : ""} onClick={() => setSettings((current) => ({ ...current, defaultTableView: "list" }))} type="button"><List size={14} /> {t("common.list")}</button>
                <button aria-pressed={settings.defaultTableView === "cards"} className={settings.defaultTableView === "cards" ? "selected" : ""} onClick={() => setSettings((current) => ({ ...current, defaultTableView: "cards" }))} type="button"><LayoutGrid size={14} /> {t("common.cards")}</button>
              </div>
            </div>
            <div className="field admin-default-view">
              <span>{t("common.hero_image_gradient")}</span>
              <div aria-label={t("common.hero_image_gradient")} className="view-toggle admin-view-toggle" role="group">
                <button aria-pressed={settings.heroGradientMode === "none"} className={settings.heroGradientMode === "none" ? "selected" : ""} onClick={() => setSettings((current) => ({ ...current, heroGradientMode: "none" }))} type="button">{t("common.none")}</button>
                <button aria-pressed={settings.heroGradientMode === "left"} className={settings.heroGradientMode === "left" ? "selected" : ""} onClick={() => setSettings((current) => ({ ...current, heroGradientMode: "left" }))} type="button">{t("common.text_only")}</button>
                <button aria-pressed={settings.heroGradientMode === "full"} className={settings.heroGradientMode === "full" ? "selected" : ""} onClick={() => setSettings((current) => ({ ...current, heroGradientMode: "full" }))} type="button">{t("common.full")}</button>
              </div>
            </div>
            <div className="branding-grid">
              <label className="upload-field">
                <span>Logo</span>
                <span className="image-preview logo-preview" style={settings.logoUrl ? { backgroundImage: `url("${settings.logoUrl}")` } : undefined}>{!settings.logoUrl && <ImagePlus size={20} />}</span>
                <input accept="image/png,image/jpeg,image/webp,image/avif" disabled={busy} onChange={(event) => void uploadImage("logoUrl", event.target.files?.[0])} type="file" />
              </label>
              <label className="upload-field">
                <span>{t("admin.banner_image")}</span>
                <span className="image-preview banner-preview" style={settings.bannerUrl ? { backgroundImage: `${settings.heroGradientMode === "full" ? "linear-gradient(100deg, #101719ed 0%, #171d20c7 55%, #52371886 100%), " : settings.heroGradientMode === "left" ? "linear-gradient(90deg, #101719ed 0%, #171d20c7 48%, transparent 72%), " : ""}url("${settings.bannerUrl}")` } : undefined}>{!settings.bannerUrl && <ImagePlus size={20} />}</span>
                <input accept="image/png,image/jpeg,image/webp,image/avif" disabled={busy} onChange={(event) => void uploadImage("bannerUrl", event.target.files?.[0])} type="file" />
              </label>
            </div>
            <p className="field-hint">{t("admin.png_jpeg_webp_or_avif_5_mb_max_images_remain_in_the_alliance_s_private_blob")}</p>
          </section>
          <section className="admin-section admin-community-section">
            <h3>{t("admin.community_links")}</h3>
            <label className="field">
              <span>{t("admin.discord_invite")}</span>
              <input autoComplete="url" maxLength={300} onChange={(event) => setSettings((current) => ({ ...current, discordUrl: event.target.value }))} placeholder={t("admin.https_discord_gg_or_shortened_t_co_link")} type="url" value={settings.discordUrl} />
            </label>
            <label className="field">
              <span>{t("admin.telegram_link")}</span>
              <input autoComplete="url" maxLength={300} onChange={(event) => setSettings((current) => ({ ...current, telegramUrl: event.target.value }))} placeholder={t("common.https_t_me_or_shortened_t_co_link")} type="url" value={settings.telegramUrl} />
            </label>
            <p className="field-hint">{t("members.configured_links_will_be_visible_to_all_members_in_the_sidebar")}</p>
          </section>
          <div className="admin-save-row"><span className="action-spacer" /><button className="primary-button" disabled={busy || !settings.name.trim()} type="submit">{t("admin.save_settings")}</button></div>
        </form>
        {(message || error) && <p className={error ? "admin-feedback admin-error" : "admin-feedback admin-success"}>{error ? <CircleAlert size={14} /> : <Check size={14} />}{t(error || message)}</p>}
      </dialog>
    </div>
  );
}