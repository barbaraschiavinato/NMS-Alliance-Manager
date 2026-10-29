"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { Check, CircleAlert, ImagePlus, ShieldCheck, X } from "lucide-react";
import type { AllianceSettings } from "@/lib/members/access-store";
import { useLocale } from "@/components/providers/locale-provider";
import { galaxyNames } from "@/lib/planets/galaxies";
import { TaxiNotificationAdmin } from "@/components/shared/taxi-notification-controls";
import { MemberNotificationAdmin } from "@/components/shared/member-notification-controls";

const maxIconSourceBytes = 5 * 1024 * 1024;

export function AdminPanel({
  onClose,
  onSaved,
}: Readonly<{
  onClose: () => void;
  onSaved: (settings: AllianceSettings) => void;
}>) {
  const { t } = useLocale();
  const [settings, setSettings] = useState<AllianceSettings>({
    name: "",
    portalCode: "",
    galaxy: 0,
    logoUrl: "",
    bannerUrl: "",
    discordUrl: "",
    telegramUrl: "",
    heroGradientMode: "full",
    faviconUrl: "",
    appleIconUrl: "",
    appIcon192Url: "",
    appIcon512Url: "",
  });
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
      .catch((error_: unknown) =>
        setError(error_ instanceof Error ? error_.message : t("errors.unable_to_load_alliance_settings")),
      );
  }, [t]);

  async function uploadImageFile(file: File) {
    const formData = new FormData();
    formData.set("image", file);
    const response = await fetch("/api/admin/upload", { method: "POST", body: formData });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Upload failed.");
    if (typeof body.url !== "string") throw new Error(t("errors.upload_failed"));
    return body.url;
  }

  async function uploadImage(kind: "logoUrl" | "bannerUrl", file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const url = await uploadImageFile(file);
      setSettings((current) => ({ ...current, [kind]: url }));
      setMessage(t("admin.image_uploaded_save_to_publish_the_changes"));
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : t("errors.upload_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function generateAppIcons(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    let bitmap: ImageBitmap | undefined;
    try {
      if (file.size > maxIconSourceBytes) throw new Error(t("admin.icon_source_too_large"));
      bitmap = await createImageBitmap(file);
      if (bitmap.width > 4096 || bitmap.height > 4096) throw new Error(t("admin.icon_source_too_large"));
      const generated: Pick<AllianceSettings, "faviconUrl" | "appleIconUrl" | "appIcon192Url" | "appIcon512Url"> = {
        faviconUrl: "",
        appleIconUrl: "",
        appIcon192Url: "",
        appIcon512Url: "",
      };
      const sourceSize = Math.min(bitmap.width, bitmap.height);
      const sourceX = (bitmap.width - sourceSize) / 2;
      const sourceY = (bitmap.height - sourceSize) / 2;

      for (const [size, field] of [
        [32, "faviconUrl"],
        [180, "appleIconUrl"],
        [192, "appIcon192Url"],
        [512, "appIcon512Url"],
      ] as const) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) throw new Error(t("admin.icon_generation_failed"));
        context.drawImage(bitmap, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
        const image = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error(t("admin.icon_generation_failed")))),
            "image/png",
          );
        });
        generated[field] = await uploadImageFile(new File([image], `app-icon-${size}.png`, { type: "image/png" }));
      }

      setSettings((current) => ({ ...current, ...generated }));
      setMessage(t("admin.app_icons_generated_save_to_publish"));
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : t("admin.icon_generation_failed"));
    } finally {
      bitmap?.close();
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
          <div>
            <span className="eyebrow">{t("admin.administration")}</span>
            <h2 id="admin-title">{t("admin.alliance")}</h2>
          </div>
          <button aria-label={t("common.close")} className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={saveSettings}>
          <section className="admin-section">
            <h3>
              <ShieldCheck size={15} /> {t("admin.alliance_identity_section_heading")}
            </h3>
            <label className="field">
              <span>{t("admin.alliance_name")}</span>
              <input
                maxLength={80}
                onChange={(event) => setSettings((current) => ({ ...current, name: event.target.value }))}
                required
                value={settings.name}
              />
            </label>
            <label className="field">
              <span>{t("admin.alliance_portal_code")}</span>
              <input
                autoComplete="off"
                maxLength={12}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    portalCode: event.target.value
                      .toUpperCase()
                      .replace(/[^0-9A-F]/g, "")
                      .slice(0, 12),
                  }))
                }
                pattern="[0-9A-Fa-f]{12}"
                placeholder={t("admin.alliance_portal_code_placeholder")}
                spellCheck={false}
                value={settings.portalCode}
              />
            </label>
            <label className="field">
              <span>{t("admin.alliance_galaxy")}</span>
              <select
                onChange={(event) => setSettings((current) => ({ ...current, galaxy: Number(event.target.value) }))}
                value={settings.galaxy}
              >
                {galaxyNames.map((name, index) => (
                  <option key={index} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field admin-default-view">
              <span>{t("common.hero_image_gradient")}</span>
              <div aria-label={t("common.hero_image_gradient")} className="view-toggle admin-view-toggle" role="group">
                <button
                  aria-pressed={settings.heroGradientMode === "none"}
                  className={settings.heroGradientMode === "none" ? "selected" : ""}
                  onClick={() => setSettings((current) => ({ ...current, heroGradientMode: "none" }))}
                  type="button"
                >
                  {t("common.none")}
                </button>
                <button
                  aria-pressed={settings.heroGradientMode === "left"}
                  className={settings.heroGradientMode === "left" ? "selected" : ""}
                  onClick={() => setSettings((current) => ({ ...current, heroGradientMode: "left" }))}
                  type="button"
                >
                  {t("common.text_only")}
                </button>
                <button
                  aria-pressed={settings.heroGradientMode === "full"}
                  className={settings.heroGradientMode === "full" ? "selected" : ""}
                  onClick={() => setSettings((current) => ({ ...current, heroGradientMode: "full" }))}
                  type="button"
                >
                  {t("common.full")}
                </button>
              </div>
            </div>
            <div className="branding-grid">
              <label className="upload-field">
                <span>Logo</span>
                <span
                  className="image-preview logo-preview"
                  style={settings.logoUrl ? { backgroundImage: `url("${settings.logoUrl}")` } : undefined}
                >
                  {!settings.logoUrl && <ImagePlus size={20} />}
                </span>
                <input
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  disabled={busy}
                  onChange={(event) => void uploadImage("logoUrl", event.target.files?.[0])}
                  type="file"
                />
              </label>
              <label className="upload-field">
                <span>{t("admin.banner_image")}</span>
                <span
                  className="image-preview banner-preview"
                  style={
                    settings.bannerUrl
                      ? {
                          backgroundImage: `${settings.heroGradientMode === "full" ? "linear-gradient(100deg, #101719ed 0%, #171d20c7 55%, #52371886 100%), " : settings.heroGradientMode === "left" ? "linear-gradient(90deg, #101719ed 0%, #171d20c7 48%, transparent 72%), " : ""}url("${settings.bannerUrl}")`,
                        }
                      : undefined
                  }
                >
                  {!settings.bannerUrl && <ImagePlus size={20} />}
                </span>
                <input
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  disabled={busy}
                  onChange={(event) => void uploadImage("bannerUrl", event.target.files?.[0])}
                  type="file"
                />
              </label>
            </div>
            <p className="field-hint">
              {t("admin.png_jpeg_webp_or_avif_5_mb_max_images_remain_in_the_alliance_s_private_blob")}
            </p>
            <label className="upload-field">
              <span>{t("admin.app_icons_and_favicon")}</span>
              <span
                className="image-preview app-icon-preview"
                style={settings.appIcon192Url ? { backgroundImage: `url("${settings.appIcon192Url}")` } : undefined}
              >
                {!settings.appIcon192Url && <ImagePlus size={20} />}
              </span>
              <input
                accept="image/png,image/jpeg,image/webp,image/avif"
                disabled={busy}
                onChange={(event) => {
                  void generateAppIcons(event.target.files?.[0]);
                  event.target.value = "";
                }}
                type="file"
              />
            </label>
            <p className="field-hint">{t("admin.choose_a_square_source_image_to_generate_icons")}</p>
          </section>
          <section className="admin-section admin-community-section">
            <h3>{t("admin.community_links")}</h3>
            <label className="field">
              <span>{t("admin.discord_invite")}</span>
              <input
                autoComplete="url"
                maxLength={300}
                onChange={(event) => setSettings((current) => ({ ...current, discordUrl: event.target.value }))}
                placeholder={t("admin.https_discord_gg_or_shortened_t_co_link")}
                type="url"
                value={settings.discordUrl}
              />
            </label>
            <label className="field">
              <span>{t("admin.telegram_link")}</span>
              <input
                autoComplete="url"
                maxLength={300}
                onChange={(event) => setSettings((current) => ({ ...current, telegramUrl: event.target.value }))}
                placeholder={t("common.https_t_me_or_shortened_t_co_link")}
                type="url"
                value={settings.telegramUrl}
              />
            </label>
            <p className="field-hint">{t("members.configured_links_will_be_visible_to_all_members_in_the_sidebar")}</p>
          </section>
          <div className="admin-save-row">
            <span className="action-spacer" />
            <button className="primary-button" disabled={busy || !settings.name.trim()} type="submit">
              {t("admin.save_settings")}
            </button>
          </div>
        </form>
        <TaxiNotificationAdmin />
        <MemberNotificationAdmin />
        {(message || error) && (
          <p className={error ? "admin-feedback admin-error" : "admin-feedback admin-success"}>
            {error ? <CircleAlert size={14} /> : <Check size={14} />}
            {t(error || message)}
          </p>
        )}
      </dialog>
    </div>
  );
}
