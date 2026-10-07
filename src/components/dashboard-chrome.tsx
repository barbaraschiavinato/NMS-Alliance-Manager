import { useEffect } from "react";
import { signOut } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import {
  CirclePlus,
  Crosshair,
  MessageCircle,
  Orbit,
  Send,
  Settings2,
  LogOut,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { Mission } from "@/lib/missions";
import type { MissionFilter } from "@/components/mission-table";
import type { AllianceMember, AllianceSettings } from "@/lib/access-store";
import { useLocale } from "@/components/locale-provider";
import { LanguageSelector } from "@/components/language-selector";

export function AllianceSidebar({ missionCount, stationCount, userCount, currentMember, settings, activeSection }: Readonly<{
  missionCount: number;
  stationCount: number;
  userCount?: number;
  currentMember: AllianceMember;
  settings: AllianceSettings;
  activeSection: "missioni" | "utenti" | "stazioni";
}>) {
  const { t } = useLocale();
  const displayName = currentMember.nmsName || currentMember.name;
  let roleLabel = t("members.member_role_label");
  if (currentMember.role === "admin") roleLabel = t("admin.administrator");
  else if (currentMember.role === "moderator") roleLabel = t("common.moderator");
  return (
    <aside className="sidebar">
      <Link className="brand" href="/">
        <span className="brand-mark" style={settings.logoUrl ? { backgroundImage: `url("${settings.logoUrl}")` } : undefined}>{!settings.logoUrl && <Orbit size={21} strokeWidth={1.8} />}</span>
        <span><strong>{settings.name}</strong></span>
      </Link>
      <nav className="side-nav" aria-label={t("navigation.main_navigation")}>
        <Link className={`nav-item ${activeSection === "missioni" ? "active" : ""}`} href="/"><Crosshair size={17} /><span>{t("missions.section_title")}</span><span className="nav-count">{missionCount}</span></Link>
        <Link className={`nav-item ${activeSection === "stazioni" ? "active" : ""}`} href="/stations"><Orbit size={17} /><span>{t("stations.stations")}</span><span className="nav-count">{stationCount}</span></Link>
        {(currentMember.role === "admin" || currentMember.role === "moderator") && <Link className={`nav-item ${activeSection === "utenti" ? "active" : ""}`} href="/users"><UsersRound size={17} /><span>{t("members.users")}</span><span className="nav-count">{userCount ?? 0}</span></Link>}
      </nav>
      <div className="sidebar-bottom">
        <div className="profile"><span className="avatar">{currentMember.image
          ? <Image alt="" aria-hidden="true" height={31} src={currentMember.image} unoptimized width={31} />
          : displayName.slice(0, 2).toUpperCase()}</span><span><strong>{displayName}</strong><small>{roleLabel}</small></span></div>
        {(settings.discordUrl || settings.telegramUrl) && <div className="community-links">
          {settings.discordUrl && <Link aria-label={t("admin.open_the_alliance_discord_server")} href={settings.discordUrl} rel="noreferrer" target="_blank"><MessageCircle size={15} /><span>Discord</span></Link>}
          {settings.telegramUrl && <Link aria-label={t("admin.open_the_alliance_telegram_group")} href={settings.telegramUrl} rel="noreferrer" target="_blank"><Send size={15} /><span>Telegram</span></Link>}
        </div>}
      </div>
    </aside>
  );
}

export function DashboardTopbar({ currentMember, settings, sectionTitle = "Missions", onAdminOpen, onProfileOpen }: Readonly<{
  currentMember: AllianceMember;
  settings: AllianceSettings;
  sectionTitle?: string;
  onAdminOpen?: () => void;
  onProfileOpen?: () => void;
}>) {
  const { t } = useLocale();
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

  let roleLabel = t("members.member_role_label");
  if (currentMember.role === "admin") roleLabel = t("admin.administrator");
  else if (currentMember.role === "moderator") roleLabel = t("common.moderator");
  return (
    <header className="topbar">
      <div className="breadcrumb"><strong>{t(sectionTitle)}</strong></div>
      <div className="topbar-tools">
        <LanguageSelector />
        <span className="account-label">{currentMember.nmsName || currentMember.name} · {roleLabel}</span>
        {onProfileOpen && <button aria-label={t("profile.my_profile")} className="square-button" onClick={onProfileOpen} title={t("profile.my_profile")} type="button"><UserRound size={16} /></button>}
        {currentMember.role === "admin" && onAdminOpen && <button aria-label={t("admin.alliance_settings")} className="square-button" onClick={onAdminOpen} title={t("admin.alliance_settings")} type="button"><Settings2 size={16} /></button>}
        <button aria-label={t("navigation.sign_out")} className="square-button" onClick={() => signOut({ callbackUrl: "/" })} title={t("navigation.sign_out")} type="button"><LogOut size={16} /></button>
        <span className="top-avatar">
          {currentMember.image
            ? <span style={{ backgroundImage: `url("${currentMember.image}")` }} />
            : (currentMember.nmsName || currentMember.name).slice(0, 2).toUpperCase()}
        </span>
      </div>
    </header>
  );
}

export function MissionHero({
  onCreate,
  showCreate,
  settings,
  title = "Mission log",
  description = "Coordinate the next frontier, one expedition at a time.",
  actionLabel = "New mission",
}: Readonly<{
  onCreate?: () => void;
  showCreate?: boolean;
  settings: AllianceSettings;
  title?: string;
  description?: string;
  actionLabel?: string;
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
              <p>{t(description)}</p>
            </div>
          </div>
        </div>
        {showCreate && onCreate && <button className="banner-add" onClick={onCreate} type="button"><CirclePlus size={17} /> {t(actionLabel)}</button>}
      </div>
    </section>
  );
}

export function MissionMetrics({ missions, counts }: Readonly<{
  missions: Mission[];
  counts: Record<MissionFilter, number>;
}>) {
  const { t } = useLocale();
  const highPriorityCount = missions.filter((mission) =>
    mission.status !== "completed" && (mission.priority === "urgent" || mission.priority === "high"),
  ).length;
  const completedShare = missions.length > 0 ? Math.round((counts.completed / missions.length) * 100) : 0;

  return (
    <section aria-label={t("admin.mission_overview")} className="metrics-row">
      <div className="metrics-inner">
        <div className="metric"><span className="metric-label">{t("missions.active_missions_metric")}</span><strong>{counts.in_progress}<small> / {missions.length}</small></strong><span className="metric-foot"><span className="metric-marker marker-green" />{counts.pending} {t("common.pending_status_label")}</span></div>
        <div className="metric"><span className="metric-label">{t("common.completed_missions_metric")}</span><strong>{counts.completed}</strong><span className="metric-foot"><span className="metric-marker marker-coral" />{completedShare}% {t("common.of_total")}</span></div>
        <div className="metric"><span className="metric-label">{t("missions.high_urgent_priority")}</span><strong>{highPriorityCount}</strong><span className="metric-foot"><span className="metric-marker marker-yellow" />{t("missions.need_attention")}</span></div>
        <div className="metric"><span className="metric-label">{t("missions.unassigned_metric")}</span><strong>{counts.pending_unassigned}</strong><span className="metric-foot"><span className="metric-marker marker-coral" />{t("missions.pending_without_an_assignee")}</span></div>
      </div>
    </section>
  );
}
