"use client";

import type { ReactNode } from "react";
import { CirclePlus, Orbit } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import type { AllianceSettings } from "@/lib/access-store";

export function Hero({ settings, title, subtitle, children }: Readonly<{
  settings: AllianceSettings;
  title: string;
  subtitle: string;
  children?: ReactNode;
}>) {
  const { t } = useLocale();
  return (
    <section className={`mission-banner${settings.heroGradientMode !== "none" ? ` mission-banner-gradient-${settings.heroGradientMode}` : ""}`} id="riepilogo" style={settings.bannerUrl ? { backgroundImage: `url("${settings.bannerUrl}")` } : undefined}>
      <div className="banner-grid" aria-hidden="true" />
      <div className="mission-banner-inner">
        <div className="banner-copy">
          <div className="banner-title-row">
            <span aria-hidden="true" className="banner-alliance-logo" style={settings.logoUrl ? { backgroundImage: `url("${settings.logoUrl}")` } : undefined}>
              {!settings.logoUrl && <Orbit size={27} />}
            </span>
            <div className="banner-heading-copy">
              <h1>{t(title)}<span>.</span></h1>
              <p>{t(subtitle)}</p>
            </div>
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

export function HeroAddButton({ label, onClick }: Readonly<{ label: string; onClick: () => void }>) {
  const { t } = useLocale();
  return <button aria-label={t(label)} className="banner-add" data-tooltip={t(label)} onClick={onClick} type="button"><CirclePlus size={17} /> <span className="banner-add-label">{t(label)}</span></button>;
}
