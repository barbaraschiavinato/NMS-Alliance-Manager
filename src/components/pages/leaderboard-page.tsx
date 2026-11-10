"use client";

import { useState } from "react";
import Image from "next/image";
import {
  BuilderIcon,
  ExplorerIcon,
  RangerIcon,
  sectionIcons,
  specialtyIcons,
  type IconComponent,
} from "@/components/shared/icons";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Hero } from "@/components/layout/hero";
import { AdminPanel } from "@/components/modals/admin-panel";
import { MemberProfilePanel } from "@/components/modals/member-profile-panel";
import { useLocale } from "@/components/providers/locale-provider";
import type { AllianceMember, AllianceSettings } from "@/lib/members/access-store";

export type LeaderboardEntry = Readonly<{
  publicId: string;
  name: string;
  image: string;
  specialty: string;
  count: number;
}>;

export type LeaderboardBoard = Readonly<{
  id: string;
  title: string;
  empty: string;
  role?: string;
  accent?: "planets" | "stations" | "missions" | "farms" | "pets";
  entries: readonly LeaderboardEntry[];
  stats?: readonly Readonly<{ label: string; value: number }>[];
  sections?: readonly Readonly<{ id: string; title: string; entries: readonly LeaderboardEntry[] }>[];
}>;

const BOARD_ENTRY_LIMIT = 10;
const ROLE_BOARD_ENTRY_TOTAL = 12;

// Specialty boards show their specialty icon, the others the icon of their section.
function boardIcon(board: Pick<LeaderboardBoard, "role" | "accent">): IconComponent | null {
  if (board.role && board.role in specialtyIcons) return specialtyIcons[board.role as keyof typeof specialtyIcons];
  return board.accent ? sectionIcons[board.accent] : null;
}

// Specialty boards always show 12 entries in total, split evenly across their tasks.
export function entryLimit(board: Pick<LeaderboardBoard, "role" | "sections">) {
  if (!board.role) return BOARD_ENTRY_LIMIT;
  return Math.floor(ROLE_BOARD_ENTRY_TOTAL / Math.max(board.sections?.length ?? 1, 1));
}

export function LeaderboardPage({
  currentMember,
  alliance,
  boards,
  missionCount,
  stationCount,
  userCount,
  offlineCount,
}: Readonly<{
  currentMember: AllianceMember;
  alliance: AllianceSettings;
  boards: readonly LeaderboardBoard[];
  missionCount: number;
  stationCount: number;
  userCount?: number;
  offlineCount?: number;
}>) {
  const { t } = useLocale();
  const [member, setMember] = useState(currentMember);
  const [settings, setSettings] = useState(alliance);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <div className={`app-shell${member.pulseEffectsEnabled === false ? " pulse-effects-disabled" : ""}`}>
      <Sidebar
        activeSection="classifica"
        currentMember={member}
        missionCount={missionCount}
        settings={settings}
        stationCount={stationCount}
        offlineCount={offlineCount}
        userCount={userCount}
      />
      <section className="main-panel">
        <Header
          currentMember={member}
          onAdminOpen={() => setAdminOpen(true)}
          onProfileOpen={() => setProfileOpen(true)}
          onProfileSaved={(profile) => setMember((current) => ({ ...current, ...profile }))}
          sectionTitle="leaderboard.title"
          settings={settings}
        />
        <Hero settings={settings} subtitle={t("leaderboard.description")} title="leaderboard.title" />
        <main className="content-wrap leaderboard-page">
          {[boards.filter((board) => !board.role), boards.filter((board) => board.role)].map((group, groupIndex) => (
            <div className={"leaderboard-widgets"} key={groupIndex}>
              {group.map((board) => {
                const BoardIcon = boardIcon(board);
                return (
                  <section
                    className={`leaderboard-widget${board.role ? ` leaderboard-widget-${board.role}` : ""}${board.accent ? ` leaderboard-widget-${board.accent}` : ""}`}
                    key={board.id}
                  >
                    <h3>
                      {BoardIcon && <BoardIcon size={14} />}
                      {t(board.title)}
                    </h3>
                    {board.stats && (
                      <dl className="leaderboard-stats">
                        {board.stats.map((stat) => (
                          <div key={stat.label}>
                            <dt>{t(stat.label)}</dt>
                            <dd>{stat.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {!board.stats &&
                      (board.sections ?? [{ id: board.id, title: "", entries: board.entries }]).map((section) => (
                        <div className="leaderboard-section" key={section.id}>
                          {section.title && <h4>{t(section.title)}</h4>}
                          {section.entries.length === 0 && <p className="messages-empty">{t(board.empty)}</p>}
                          <ol className="leaderboard-list">
                            {section.entries.slice(0, entryLimit(board)).map((entry, index) => (
                              <li
                                className={`leaderboard-row${entry.publicId === member.publicId ? " leaderboard-row-me" : ""}${index < 3 ? ` leaderboard-row-top-${index + 1}` : ""}`}
                                key={entry.publicId}
                              >
                                <span aria-label={t("leaderboard.rank")} className="leaderboard-rank">
                                  {index + 1}
                                </span>
                                {entry.image ? (
                                  <Image
                                    alt=""
                                    className="leaderboard-avatar"
                                    height={32}
                                    src={entry.image}
                                    unoptimized
                                    width={32}
                                  />
                                ) : (
                                  <span className="leaderboard-avatar" />
                                )}
                                <span className="leaderboard-name">{entry.name}</span>
                                {entry.specialty && (
                                  <span
                                    className={`badge badge--specialty badge--specialty-${entry.specialty} leaderboard-badge`}
                                  >
                                    <span className="leaderboard-badge-label">{t(`common.${entry.specialty}`)}</span>
                                    <span
                                      aria-label={t(`common.${entry.specialty}`)}
                                      className="leaderboard-badge-icon"
                                      role="img"
                                    >
                                      {entry.specialty === "ranger" ? (
                                        <RangerIcon size={14} />
                                      ) : entry.specialty === "builder" ? (
                                        <BuilderIcon size={14} />
                                      ) : (
                                        <ExplorerIcon size={14} />
                                      )}
                                    </span>
                                  </span>
                                )}
                                <span
                                  aria-label={t(section.title || board.title)}
                                  className="leaderboard-score"
                                  title={t(section.title || board.title)}
                                >
                                  {entry.count}
                                </span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      ))}
                  </section>
                );
              })}
            </div>
          ))}
        </main>
      </section>
      {adminOpen && member.role === "admin" && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setSettings} />}
      {profileOpen && (
        <MemberProfilePanel
          member={member}
          onClose={() => setProfileOpen(false)}
          onSaved={(profile) => setMember((current) => ({ ...current, ...profile }))}
        />
      )}
    </div>
  );
}
