"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { Check, CircleAlert, ImagePlus, LayoutGrid, List, ShieldCheck, X } from "lucide-react";
import type { AllianceSettings } from "@/lib/access-store";

export function AdminPanel({ onClose, onSaved }: Readonly<{
  onClose: () => void;
  onSaved: (settings: AllianceSettings) => void;
}>) {
  const [settings, setSettings] = useState<AllianceSettings>({ name: "", logoUrl: "", bannerUrl: "", discordUrl: "", telegramUrl: "", heroGradientEnabled: true, defaultTableView: "list" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/alliance", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Impossibile caricare le impostazioni alleanza.");
        setSettings(body as AllianceSettings);
      })
      .catch((error_: unknown) => setError(error_ instanceof Error ? error_.message : "Impossibile caricare le impostazioni alleanza."));
  }, []);

  async function uploadImage(kind: "logoUrl" | "bannerUrl", file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    const formData = new FormData();
    formData.set("image", file);
    try {
      const response = await fetch("/api/admin/upload", { method: "POST", body: formData });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Caricamento non riuscito.");
      setSettings((current) => ({ ...current, [kind]: body.url }));
      setMessage("Immagine caricata. Salva per pubblicare le modifiche.");
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Caricamento non riuscito.");
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
      if (!response.ok) throw new Error(body.error ?? "Salvataggio non riuscito.");
      setSettings(body as AllianceSettings);
      onSaved(body as AllianceSettings);
      setMessage("Impostazioni alleanza salvate.");
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Salvataggio non riuscito.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <dialog aria-labelledby="admin-title" aria-modal="true" className="mission-dialog admin-dialog" open>
        <div className="dialog-heading">
          <div><span className="eyebrow">AMMINISTRAZIONE</span><h2 id="admin-title">Alleanza</h2></div>
          <button aria-label="Chiudi" className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <form onSubmit={saveSettings}>
          <section className="admin-section">
            <h3><ShieldCheck size={15} /> IDENTITÀ ALLEANZA</h3>
            <label className="field">
              <span>Nome alleanza</span>
              <input maxLength={80} onChange={(event) => setSettings((current) => ({ ...current, name: event.target.value }))} required value={settings.name} />
            </label>
            <div className="field admin-default-view">
              <span>Vista predefinita delle tabelle</span>
              <div aria-label="Vista predefinita delle tabelle" className="view-toggle admin-view-toggle" role="group">
                <button aria-pressed={settings.defaultTableView === "list"} className={settings.defaultTableView === "list" ? "selected" : ""} onClick={() => setSettings((current) => ({ ...current, defaultTableView: "list" }))} type="button"><List size={14} /> Lista</button>
                <button aria-pressed={settings.defaultTableView === "cards"} className={settings.defaultTableView === "cards" ? "selected" : ""} onClick={() => setSettings((current) => ({ ...current, defaultTableView: "cards" }))} type="button"><LayoutGrid size={14} /> Schede</button>
              </div>
            </div>
            <label className="admin-feature-toggle">
              <input checked={settings.heroGradientEnabled} onChange={(event) => setSettings((current) => ({ ...current, heroGradientEnabled: event.target.checked }))} type="checkbox" />
              <span>Applica la sfumatura all’immagine hero</span>
            </label>
            <div className="branding-grid">
              <label className="upload-field">
                <span>Logo</span>
                <span className="image-preview logo-preview" style={settings.logoUrl ? { backgroundImage: `url("${settings.logoUrl}")` } : undefined}>{!settings.logoUrl && <ImagePlus size={20} />}</span>
                <input accept="image/png,image/jpeg,image/webp,image/avif" disabled={busy} onChange={(event) => void uploadImage("logoUrl", event.target.files?.[0])} type="file" />
              </label>
              <label className="upload-field">
                <span>Immagine banner</span>
                <span className="image-preview banner-preview" style={settings.bannerUrl ? { backgroundImage: `${settings.heroGradientEnabled ? "linear-gradient(100deg, #101719ed 0%, #171d20c7 55%, #52371886 100%), " : ""}url("${settings.bannerUrl}")` } : undefined}>{!settings.bannerUrl && <ImagePlus size={20} />}</span>
                <input accept="image/png,image/jpeg,image/webp,image/avif" disabled={busy} onChange={(event) => void uploadImage("bannerUrl", event.target.files?.[0])} type="file" />
              </label>
            </div>
            <p className="field-hint">PNG, JPEG, WebP o AVIF · massimo 5 MB. Le immagini restano nel Blob privato dell’alleanza.</p>
          </section>
          <section className="admin-section admin-community-section">
            <h3>LINK COMMUNITY</h3>
            <label className="field">
              <span>Invito Discord</span>
              <input autoComplete="url" maxLength={300} onChange={(event) => setSettings((current) => ({ ...current, discordUrl: event.target.value }))} placeholder="https://discord.gg/… o link abbreviato t.co" type="url" value={settings.discordUrl} />
            </label>
            <label className="field">
              <span>Link Telegram</span>
              <input autoComplete="url" maxLength={300} onChange={(event) => setSettings((current) => ({ ...current, telegramUrl: event.target.value }))} placeholder="https://t.me/… o link abbreviato t.co" type="url" value={settings.telegramUrl} />
            </label>
            <p className="field-hint">I link configurati saranno visibili nella barra laterale a tutti i membri.</p>
          </section>
          <div className="admin-save-row"><span className="action-spacer" /><button className="primary-button" disabled={busy || !settings.name.trim()} type="submit">Salva impostazioni</button></div>
        </form>
        {(message || error) && <p className={error ? "admin-feedback admin-error" : "admin-feedback admin-success"}>{error ? <CircleAlert size={14} /> : <Check size={14} />}{error || message}</p>}
      </dialog>
    </div>
  );
}