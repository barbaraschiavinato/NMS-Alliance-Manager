"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Settings2, LayoutList, LogOut, UserRound } from "lucide-react";
import type { AllianceMember, AllianceSettings } from "@/lib/access-store";
import { useLocale } from "@/components/providers/locale-provider";
import { LanguageSelector } from "@/components/shared/language-selector";

export function Header({ currentMember, settings, sectionTitle = "Missions", onAdminOpen, onProfileOpen, onProfileSaved }: Readonly<{
  currentMember: AllianceMember;
  settings: AllianceSettings;
  sectionTitle?: string;
  onAdminOpen?: () => void;
  onProfileOpen?: () => void;
  onProfileSaved?: (profile: Partial<AllianceMember>) => void;
}>) {
  const { t } = useLocale();
  const [savingView, setSavingView] = useState(false);
  useEffect(() => {
    document.title = settings.name.trim() || "NMS Alliance Manager";
    if (!settings.logoUrl) return;

    let icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.append(icon);
    }
    icon.href = settings.logoUrl;
    icon.removeAttribute("type");
    icon.removeAttribute("sizes");
  }, [settings.logoUrl, settings.name]);

  async function toggleSimpleView() {
    setSavingView(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nmsName: currentMember.nmsName,
          nmsCode: currentMember.nmsCode,
          telegramName: currentMember.telegramName ?? "",
          discordName: currentMember.discordName ?? "",
          platforms: currentMember.platforms,
          specialty: currentMember.specialty,
          simpleView: !currentMember.simpleView,
        }),
      });
      if (response.ok) onProfileSaved?.(await response.json() as Partial<AllianceMember>);
    } finally {
      setSavingView(false);
    }
  }

  const viewToggleLabel = currentMember.simpleView ? "navigation.switch_to_extended_view" : "navigation.switch_to_simple_view";
  const displayRole = currentMember.displayRole ?? currentMember.role;
  let roleLabel = t("members.member_role_label");
  if (displayRole === "admin") roleLabel = t("admin.administrator");
  else if (displayRole === "moderator") roleLabel = t("common.moderator");
  return (
    <header className="topbar">
      <div className="breadcrumb"><strong>{t(sectionTitle)}</strong></div>
      <div className="topbar-tools">
        <LanguageSelector />
        <span className="account-label">{currentMember.nmsName || currentMember.name} · {roleLabel}</span>
        {onProfileSaved && displayRole !== "user" && <button aria-label={t(viewToggleLabel)} aria-pressed={currentMember.simpleView === true} className={`square-button header-view-toggle${currentMember.simpleView ? " selected" : ""}`} disabled={savingView} onClick={() => void toggleSimpleView()} data-tooltip={t(viewToggleLabel)} type="button"><LayoutList size={16} /></button>}
        {onProfileOpen && <button aria-label={t("profile.my_profile")} className="square-button" onClick={onProfileOpen} data-tooltip={t("profile.my_profile")} type="button"><UserRound size={16} /></button>}
        {currentMember.role === "admin" && onAdminOpen && <button aria-label={t("admin.alliance_settings")} className="square-button" onClick={onAdminOpen} data-tooltip={t("admin.alliance_settings")} type="button"><Settings2 size={16} /></button>}
        <button aria-label={t("navigation.sign_out")} className="square-button" onClick={() => signOut({ callbackUrl: "/" })} data-tooltip={t("navigation.sign_out")} type="button"><LogOut size={16} /></button>
        <span className="top-avatar">
          {currentMember.image
            ? <span style={{ backgroundImage: `url("${currentMember.image}")` }} />
            : (currentMember.nmsName || currentMember.name).slice(0, 2).toUpperCase()}
        </span>
      </div>
    </header>
  );
}
