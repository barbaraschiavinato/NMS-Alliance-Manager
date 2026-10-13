"use client";

import { useState, type ReactNode } from "react";
import { CirclePlus, Orbit, X } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { GlyphStrip } from "@/components/shared/portal-address-field";
import type { AllianceSettings } from "@/lib/access-store";
import { galaxyLabel } from "@/lib/galaxies";

export function Hero({
  settings,
  title,
  subtitle,
  children,
}: Readonly<{
  settings: AllianceSettings;
  title: string;
  subtitle: string;
  children?: ReactNode;
}>) {
  const { t } = useLocale();
  const [portalOpen, setPortalOpen] = useState(false);
  const hasPortalCode = /^[0-9A-F]{12}$/i.test(settings.portalCode);
  const allianceName = settings.name.trim() || t("admin.alliance");

  return (
    <section
      className={`mission-banner${settings.heroGradientMode !== "none" ? ` mission-banner-gradient-${settings.heroGradientMode}` : ""}`}
      id="riepilogo"
      style={settings.bannerUrl ? { backgroundImage: `url("${settings.bannerUrl}")` } : undefined}
    >
      <div className="banner-grid" aria-hidden="true" />
      <div className="mission-banner-inner">
        <div className="banner-copy">
          <div className="banner-title-row">
            {hasPortalCode ? (
              <button
                aria-haspopup="dialog"
                aria-label={t("admin.view_alliance_portal")}
                className="banner-alliance-logo banner-alliance-logo-button"
                onClick={() => setPortalOpen(true)}
                style={settings.logoUrl ? { backgroundImage: `url("${settings.logoUrl}")` } : undefined}
                type="button"
              >
                {!settings.logoUrl && <Orbit size={27} />}
              </button>
            ) : (
              <span
                aria-hidden="true"
                className="banner-alliance-logo"
                style={settings.logoUrl ? { backgroundImage: `url("${settings.logoUrl}")` } : undefined}
              >
                {!settings.logoUrl && <Orbit size={27} />}
              </span>
            )}
            <div className="banner-heading-copy">
              <h1>
                {t(title)}
                <span>.</span>
              </h1>
              <p>{t(subtitle)}</p>
            </div>
          </div>
        </div>
        {children}
      </div>
      {portalOpen && hasPortalCode && (
        <div className="dialog-backdrop">
          <dialog
            aria-labelledby="alliance-portal-title"
            aria-modal="true"
            className="mission-dialog portal-dialog"
            open
          >
            <div className="dialog-heading">
              <div>
                <span className="eyebrow">{t("admin.alliance_portal_details")}</span>
                <h2 id="alliance-portal-title">{allianceName}</h2>
              </div>
              <button
                aria-label={t("common.close")}
                className="icon-button"
                onClick={() => setPortalOpen(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <div className="portal-dialog-details">
              <GlyphStrip address={settings.portalCode} large />
              <div className="portal-dialog-values">
                <span>{t("admin.alliance_portal_code")}</span>
                <code>{settings.portalCode}</code>
              </div>
              <div className="portal-dialog-values">
                <span>{t("admin.alliance_galaxy")}</span>
                <strong>{galaxyLabel(settings.galaxy)}</strong>
              </div>
            </div>
          </dialog>
        </div>
      )}
    </section>
  );
}

export function HeroAddButton({
  label,
  onClick,
  className,
}: Readonly<{ label: string; onClick: () => void; className?: string }>) {
  const { t } = useLocale();
  return (
    <button
      aria-label={t(label)}
      className={`banner-add${className ? ` ${className}` : ""}`}
      data-tooltip={t(label)}
      onClick={onClick}
      type="button"
    >
      <CirclePlus size={17} /> <span className="banner-add-label">{t(label)}</span>
    </button>
  );
}
