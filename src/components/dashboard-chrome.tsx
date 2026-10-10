import { useEffect, useState, useSyncExternalStore } from "react";
import { signOut } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import {
  CirclePlus,
  Crosshair,
  Eclipse,
  Siren,
  Mail,
  Orbit,
  Send,
  Settings2,
  Trophy,
  LogOut,
  UserRound,
  UsersRound,
  UserRoundX,
} from "lucide-react";
import type { Mission } from "@/lib/missions";
import type { MissionFilter } from "@/components/mission-table";
import type { AllianceMember, AllianceSettings } from "@/lib/access-store";
import { useLocale } from "@/components/locale-provider";
import { LanguageSelector } from "@/components/language-selector";
import { useRequestSearchReset } from "@/components/navigation-search-reset";

const counterRefreshMs = 2 * 60 * 1000;
const planetCountKey = "nms-planet-count";
const planetCountEvent = "planet-count-changed";

function subscribePlanetCount(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(planetCountEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(planetCountEvent, callback);
  };
}

function readPlanetCount() {
  try {
    return window.localStorage.getItem(planetCountKey);
  } catch {
    return null;
  }
}

export function storePlanetCount(count: number) {
  try {
    if (window.localStorage.getItem(planetCountKey) === String(count)) return;
    window.localStorage.setItem(planetCountKey, String(count));
    window.dispatchEvent(new Event(planetCountEvent));
  } catch {
    // Il contatore è solo informativo.
  }
}

export function AllianceSidebar({ missionCount, stationCount, planetCount, userCount, offlineCount, currentMember, settings, activeSection }: Readonly<{
  missionCount: number;
  stationCount: number;
  planetCount?: number;
  userCount?: number;
  offlineCount?: number;
  currentMember: AllianceMember;
  settings: AllianceSettings;
  activeSection: "missioni" | "pianeti" | "utenti" | "offline" | "stazioni" | "messaggi" | "aiuto" | "classifica";
}>) {
  const { t } = useLocale();
  const resetSearch = useRequestSearchReset();
  const storedPlanetCount = useSyncExternalStore(subscribePlanetCount, readPlanetCount, () => null);
  const shownPlanetCount = planetCount ?? (storedPlanetCount === null ? null : Number(storedPlanetCount));
  const [unreadCount, setUnreadCount] = useState(0);
  const [helpCount, setHelpCount] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function loadUnread() {
      try {
        const response = await fetch("/api/messages?count=unread", { cache: "no-store", signal: controller.signal });
        const body: unknown = await response.json();
        if (response.ok && body && typeof body === "object" && "count" in body && typeof body.count === "number") setUnreadCount(body.count);
      } catch {
        // Il contatore è solo informativo.
      }
    }
    async function loadHelpCount() {
      try {
        const response = await fetch("/api/help-requests?count=1", { cache: "no-store", signal: controller.signal });
        const body: unknown = await response.json();
        if (response.ok && body && typeof body === "object" && "count" in body && typeof body.count === "number") setHelpCount(body.count);
      } catch {
        // Il contatore è solo informativo.
      }
    }
    void loadUnread();
    void loadHelpCount();
    window.addEventListener("help-requests-changed", loadHelpCount);
    function refreshCounters() {
      if (document.visibilityState !== "visible") return;
      void loadUnread();
      void loadHelpCount();
    }
    const interval = window.setInterval(refreshCounters, counterRefreshMs);
    document.addEventListener("visibilitychange", refreshCounters);
    window.addEventListener("messages-unread-changed", loadUnread);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshCounters);
      window.removeEventListener("messages-unread-changed", loadUnread);
      window.removeEventListener("help-requests-changed", loadHelpCount);
    };
  }, []);
  const displayName = currentMember.nmsName || currentMember.name;
  const displayRole = currentMember.displayRole ?? currentMember.role;
  let roleLabel = t("members.member_role_label");
  if (displayRole === "admin") roleLabel = t("admin.administrator");
  else if (displayRole === "moderator") roleLabel = t("common.moderator");
  return (
    <aside className={currentMember.simpleView ? "sidebar sidebar-compact" : "sidebar"}>
      <Link className="brand" href="/stations">
        <span className="brand-mark" style={settings.logoUrl ? { backgroundImage: `url("${settings.logoUrl}")` } : undefined}>{!settings.logoUrl && <Orbit size={21} strokeWidth={1.8} />}</span>
        <span><strong>{settings.name}</strong></span>
      </Link>
      <nav className="side-nav" aria-label={t("navigation.main_navigation")}>
        <Link className={`nav-item ${activeSection === "stazioni" ? "active" : ""}`} href="/stations" data-tooltip={t("stations.stations")} onClick={resetSearch}><Orbit size={17} /><span>{t("stations.stations")}</span><span className="nav-count">{stationCount}</span></Link>
        <Link className={`nav-item ${activeSection === "missioni" ? "active" : ""}`} href="/missions" data-tooltip={t("missions.section_title")} onClick={resetSearch}><Crosshair size={17} /><span>{t("missions.section_title")}</span><span className="nav-count">{missionCount}</span></Link>
        <Link className={`nav-item ${activeSection === "pianeti" ? "active" : ""}`} href="/planets" data-tooltip={t("navigation.planets")} onClick={resetSearch}><Eclipse size={17} /><span>{t("navigation.planets")}</span>{shownPlanetCount !== null && Number.isFinite(shownPlanetCount) && <span className="nav-count">{shownPlanetCount}</span>}</Link>
        {(currentMember.role === "admin" || currentMember.role === "moderator") && <Link className={`nav-item ${activeSection === "utenti" ? "active" : ""}`} href="/users" data-tooltip={t("members.users")} onClick={resetSearch}><UsersRound size={17} /><span>{t("members.users")}</span><span className="nav-count">{userCount ?? 0}</span></Link>}
        {(currentMember.role === "admin" || currentMember.role === "moderator") && <Link className={`nav-item ${activeSection === "offline" ? "active" : ""}`} href="/offline-players" data-tooltip={t("members.offline_players")} onClick={resetSearch}><UserRoundX size={17} /><span>{t("members.offline_players")}</span><span className="nav-count">{offlineCount ?? 0}</span></Link>}
        <Link className={`nav-item ${activeSection === "classifica" ? "active" : ""}`} href="/leaderboard" data-tooltip={t("leaderboard.title")} onClick={resetSearch}><Trophy size={17} /><span>{t("leaderboard.title")}</span></Link>
        <Link className={`nav-item ${activeSection === "aiuto" ? "active" : ""}`} href="/help-requests" data-tooltip={t("help.help_requests")} onClick={resetSearch}><Siren size={17} /><span>{t("help.help_requests")}</span><span className={helpCount > 0 ? "nav-count nav-unread nav-unread-active" : "nav-count nav-unread"}>{helpCount}</span></Link>
        <Link className={`nav-item ${activeSection === "messaggi" ? "active" : ""}`} href="/messages" data-tooltip={t("messages.messages")} onClick={resetSearch}><Mail size={17} /><span>{t("messages.messages")}</span><span aria-label={t("messages.unread_count", { count: unreadCount })} className={unreadCount > 0 ? "nav-count nav-unread nav-unread-active" : "nav-count nav-unread"} title={t("messages.unread_count", { count: unreadCount })}>{unreadCount}</span></Link>
      </nav>
      <div className="sidebar-bottom">
        <div className="profile"><span className="avatar">{currentMember.image
          ? <Image alt="" aria-hidden="true" height={31} src={currentMember.image} unoptimized width={31} />
          : displayName.slice(0, 2).toUpperCase()}</span><span><strong>{displayName}</strong><small>{roleLabel}</small></span></div>
        {(settings.discordUrl || settings.telegramUrl) && <div className="community-links">
          {settings.discordUrl && <Link aria-label={t("admin.open_the_alliance_discord_server")} href={settings.discordUrl} rel="noreferrer" target="_blank"><svg aria-hidden="true" fill="currentColor" height="15" viewBox="0 0 24 24" width="15"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" /></svg><span>Discord</span></Link>}
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
        {showCreate && onCreate && <button aria-label={t(actionLabel)} className="banner-add" data-tooltip={t(actionLabel)} onClick={onCreate} type="button"><CirclePlus size={17} /> <span className="banner-add-label">{t(actionLabel)}</span></button>}
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
