"use client";

import { useEffect, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AllianceLogoIcon,
  FarmIcon,
  GuideIcon,
  HelpRequestIcon,
  LeaderboardIcon,
  MapIcon,
  MessagesIcon,
  MissionIcon,
  OfflinePlayersIcon,
  PetIcon,
  PlanetIcon,
  StationIcon,
  TaxiIcon,
  TelegramIcon,
  UsersIcon,
  DiscordIcon,
} from "@/components/shared/icons";
import type { AllianceMember, AllianceSettings } from "@/lib/members/access-store";
import { useLocale } from "@/components/providers/locale-provider";
import { useRequestSearchReset } from "@/components/shared/navigation-search-reset";
import {
  loadSidebarCounts,
  readServerSidebarCounts,
  readSidebarCounts,
  subscribeSidebarCounts,
} from "@/components/layout/sidebar-counts";
import { dispatchAppEvent, onAppEvent, type AppEvent } from "@/lib/navigation/app-events";

const counterRefreshMs = 2 * 60 * 1000;
const sidebarCountEvents = [
  "messages-unread-changed",
  "help-requests-changed",
  "taxi-requests-changed",
  "farms-changed",
  "pets-changed",
] as const satisfies readonly AppEvent[];
const planetCountKey = "nms-planet-count";

function subscribePlanetCount(callback: () => void) {
  window.addEventListener("storage", callback);
  const stopListening = onAppEvent("planet-count-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    stopListening();
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
    dispatchAppEvent("planet-count-changed");
  } catch {
    // Il contatore è solo informativo.
  }
}

export function Sidebar({
  missionCount,
  stationCount,
  planetCount,
  userCount,
  offlineCount,
  currentMember,
  settings,
  activeSection,
}: Readonly<{
  missionCount: number;
  stationCount: number;
  planetCount?: number;
  userCount?: number;
  offlineCount?: number;
  currentMember: AllianceMember;
  settings: AllianceSettings;
  activeSection:
    | "missioni"
    | "pianeti"
    | "mappa"
    | "farm"
    | "pet"
    | "utenti"
    | "offline"
    | "stazioni"
    | "messaggi"
    | "aiuto"
    | "taxi"
    | "classifica"
    | "guida";
}>) {
  const { t } = useLocale();
  const resetSearch = useRequestSearchReset();
  const storedPlanetCount = useSyncExternalStore(subscribePlanetCount, readPlanetCount, () => null);
  const shownPlanetCount = planetCount ?? (storedPlanetCount === null ? null : Number(storedPlanetCount));
  const counts = useSyncExternalStore(
    subscribeSidebarCounts,
    () => readSidebarCounts(currentMember.publicId),
    readServerSidebarCounts,
  );
  const { unread: unreadCount, help: helpCount, taxi: taxiCount, farms: farmCount, pets: petCount } = counts;
  const isStaff = currentMember.role === "admin" || currentMember.role === "moderator";
  useEffect(() => {
    const memberId = currentMember.publicId;
    const reload = () => void loadSidebarCounts(memberId, { force: true });
    void loadSidebarCounts(memberId);
    function refreshCounters() {
      if (document.visibilityState === "visible") reload();
    }
    const stopListening = onAppEvent(sidebarCountEvents, reload);
    const interval = window.setInterval(refreshCounters, counterRefreshMs);
    document.addEventListener("visibilitychange", refreshCounters);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshCounters);
      stopListening();
    };
  }, [currentMember.publicId]);
  const displayName = currentMember.nmsName || currentMember.name;
  const displayRole = currentMember.displayRole ?? currentMember.role;
  let roleLabel = t("members.member_role_label");
  if (displayRole === "admin") roleLabel = t("admin.administrator");
  else if (displayRole === "moderator") roleLabel = t("common.moderator");
  return (
    <aside className={currentMember.simpleView ? "sidebar sidebar-compact" : "sidebar"}>
      <Link className="brand" href="/stations" prefetch={activeSection === "farm" ? false : undefined}>
        <span
          className="brand-mark"
          style={settings.logoUrl ? { backgroundImage: `url("${settings.logoUrl}")` } : undefined}
        >
          {!settings.logoUrl && <AllianceLogoIcon size={21} strokeWidth={1.8} />}
        </span>
        <span>
          <strong>{settings.name}</strong>
        </span>
      </Link>
      <nav className="side-nav" aria-label={t("navigation.main_navigation")}>
        <Link
          className={`nav-item ${activeSection === "stazioni" ? "active" : ""}`}
          href="/stations"
          prefetch={activeSection === "farm" ? false : undefined}
          data-tooltip={t("stations.stations")}
          onClick={resetSearch}
        >
          <StationIcon size={17} />
          <span>{t("stations.stations")}</span>
          <span className="nav-count">{stationCount}</span>
        </Link>
        <Link
          className={`nav-item ${activeSection === "missioni" ? "active" : ""}`}
          href="/missions"
          prefetch={activeSection === "farm" ? false : undefined}
          data-tooltip={t("missions.section_title")}
          onClick={resetSearch}
        >
          <MissionIcon size={17} />
          <span>{t("missions.section_title")}</span>
          <span className="nav-count">{missionCount}</span>
        </Link>
        <Link
          className={`nav-item ${activeSection === "pianeti" ? "active" : ""}`}
          href="/planets"
          prefetch={activeSection === "farm" ? false : undefined}
          data-tooltip={t("navigation.planets")}
          onClick={resetSearch}
        >
          <PlanetIcon size={17} />
          <span>{t("navigation.planets")}</span>
          {shownPlanetCount !== null && Number.isFinite(shownPlanetCount) && (
            <span className="nav-count">{shownPlanetCount}</span>
          )}
        </Link>
        <Link
          className={`nav-item ${activeSection === "mappa" ? "active" : ""}`}
          href="/map"
          data-tooltip={t("navigation.map")}
          onClick={resetSearch}
        >
          <MapIcon size={17} />
          <span>{t("navigation.map")}</span>
        </Link>
        <Link
          className={`nav-item ${activeSection === "farm" ? "active" : ""}`}
          href="/farms"
          data-tooltip={t("navigation.farms")}
          onClick={resetSearch}
        >
          <FarmIcon size={17} />
          <span>{t("navigation.farms")}</span>
          {isStaff && farmCount !== null && <span className="nav-count">{farmCount}</span>}
        </Link>
        <Link
          className={`nav-item ${activeSection === "pet" ? "active" : ""}`}
          href="/pets"
          data-tooltip={t("navigation.pets")}
          onClick={resetSearch}
        >
          <PetIcon size={17} />
          <span>{t("navigation.pets")}</span>
          {isStaff && petCount !== null && <span className="nav-count">{petCount}</span>}
        </Link>
        {(currentMember.role === "admin" || currentMember.role === "moderator") && (
          <Link
            className={`nav-item ${activeSection === "utenti" ? "active" : ""}`}
            href="/users"
            data-tooltip={t("members.users")}
            onClick={resetSearch}
          >
            <UsersIcon size={17} />
            <span>{t("members.users")}</span>
            <span className="nav-count">{userCount ?? 0}</span>
          </Link>
        )}
        {(currentMember.role === "admin" || currentMember.role === "moderator") && (
          <Link
            className={`nav-item ${activeSection === "offline" ? "active" : ""}`}
            href="/offline-players"
            data-tooltip={t("members.offline_players")}
            onClick={resetSearch}
          >
            <OfflinePlayersIcon size={17} />
            <span>{t("members.offline_players")}</span>
            <span className="nav-count">{offlineCount ?? 0}</span>
          </Link>
        )}
        <Link
          className={`nav-item ${activeSection === "classifica" ? "active" : ""}`}
          href="/leaderboard"
          data-tooltip={t("leaderboard.title")}
          onClick={resetSearch}
        >
          <LeaderboardIcon size={17} />
          <span>{t("leaderboard.title")}</span>
        </Link>
        <Link
          className={`nav-item ${activeSection === "taxi" ? "active" : ""}`}
          href="/taxi"
          data-tooltip={t("taxi.title")}
          onClick={resetSearch}
        >
          <TaxiIcon size={17} />
          <span>{t("taxi.title")}</span>
          <span className={taxiCount > 0 ? "nav-count nav-unread nav-unread-active" : "nav-count nav-unread"}>
            {taxiCount}
          </span>
        </Link>
        <Link
          className={`nav-item ${activeSection === "messaggi" ? "active" : ""}`}
          href="/messages"
          data-tooltip={t("messages.messages")}
          onClick={resetSearch}
        >
          <MessagesIcon size={17} />
          <span>{t("messages.messages")}</span>
          <span
            aria-label={t("messages.unread_count", { count: unreadCount })}
            className={unreadCount > 0 ? "nav-count nav-unread nav-unread-active" : "nav-count nav-unread"}
            title={t("messages.unread_count", { count: unreadCount })}
          >
            {unreadCount}
          </span>
        </Link>
        <Link
          className={`nav-item ${activeSection === "aiuto" ? "active" : ""}`}
          href="/help-requests"
          data-tooltip={t("help.help_requests")}
          onClick={resetSearch}
        >
          <HelpRequestIcon size={17} />
          <span>{t("help.help_requests")}</span>
          <span className={helpCount > 0 ? "nav-count nav-unread nav-unread-active" : "nav-count nav-unread"}>
            {helpCount}
          </span>
        </Link>
        <Link
          className={`nav-item ${activeSection === "guida" ? "active" : ""}`}
          href="/member-guide"
          data-tooltip={t("navigation.guide")}
          onClick={resetSearch}
        >
          <GuideIcon size={17} />
          <span>{t("navigation.guide")}</span>
        </Link>
      </nav>
      <div className="sidebar-bottom">
        <div className="profile">
          <span className="avatar">
            {currentMember.image ? (
              <Image alt="" aria-hidden="true" height={31} src={currentMember.image} unoptimized width={31} />
            ) : (
              displayName.slice(0, 2).toUpperCase()
            )}
          </span>
          <span>
            <strong>{displayName}</strong>
            <small>{roleLabel}</small>
          </span>
        </div>
        {(settings.discordUrl || settings.telegramUrl) && (
          <div className="community-links">
            {settings.discordUrl && (
              <Link
                aria-label={t("admin.open_the_alliance_discord_server")}
                href={settings.discordUrl}
                rel="noreferrer"
                target="_blank"
              >
                <DiscordIcon aria-hidden="true" size={15} />
                <span>Discord</span>
              </Link>
            )}
            {settings.telegramUrl && (
              <Link
                aria-label={t("admin.open_the_alliance_telegram_group")}
                href={settings.telegramUrl}
                rel="noreferrer"
                target="_blank"
              >
                <TelegramIcon size={15} />
                <span>Telegram</span>
              </Link>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
