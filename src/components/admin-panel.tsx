"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { Check, CircleAlert, ImagePlus, ShieldCheck, X } from "lucide-react";
import type { AllianceSettings } from "@/lib/access-store";

export function AdminPanel({ onClose, onSaved }: Readonly<{
  onClose: () => void;
  onSaved: (settings: AllianceSettings) => void;
}>) {
  const [settings, setSettings] = useState<AllianceSettings>({ name: "", logoUrl: "", bannerUrl: "" });
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
            <div className="branding-grid">
              <label className="upload-field">
                <span>Logo</span>
                <span className="image-preview logo-preview" style={settings.logoUrl ? { backgroundImage: `url("${settings.logoUrl}")` } : undefined}>{!settings.logoUrl && <ImagePlus size={20} />}</span>
                <input accept="image/png,image/jpeg,image/webp,image/avif" disabled={busy} onChange={(event) => void uploadImage("logoUrl", event.target.files?.[0])} type="file" />
              </label>
              <label className="upload-field">
                <span>Immagine banner</span>
                <span className="image-preview banner-preview" style={settings.bannerUrl ? { backgroundImage: `url("${settings.bannerUrl}")` } : undefined}>{!settings.bannerUrl && <ImagePlus size={20} />}</span>
                <input accept="image/png,image/jpeg,image/webp,image/avif" disabled={busy} onChange={(event) => void uploadImage("bannerUrl", event.target.files?.[0])} type="file" />
              </label>
            </div>
            <p className="field-hint">PNG, JPEG, WebP o AVIF · massimo 5 MB. Le immagini restano nel Blob privato dell’alleanza.</p>
          </section>
          <div className="admin-save-row"><span className="action-spacer" /><button className="primary-button" disabled={busy || !settings.name.trim()} type="submit">Salva identità</button></div>
        </form>
        {(message || error) && <p className={error ? "admin-feedback admin-error" : "admin-feedback admin-success"}>{error ? <CircleAlert size={14} /> : <Check size={14} />}{error || message}</p>}
      </dialog>
    </div>
  );
}