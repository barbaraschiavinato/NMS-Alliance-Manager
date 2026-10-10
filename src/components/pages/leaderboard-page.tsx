"use client";

import { useState } from "react";
import Image from "next/image";
import { Compass, Hammer, Search } from "lucide-react";
import { AllianceSidebar, DashboardTopbar, MissionHero } from "@/components/dashboard-chrome";
import { AdminPanel } from "@/components/admin-panel";
import { MemberProfilePanel } from "@/components/member-profile-panel";
import { useLocale } from "@/components/locale-provider";
import type { AllianceMember, AllianceSettings } from "@/lib/access-store";

export type LeaderboardEntry = Readonly<{
  publicId: string;
  name: string;
  image: string;
  specialty: string;
  count: number;
}>;

export type LeaderboardBoard = Readonly<{ id: string; title: string; empty: string; role?: string; entries: readonly LeaderboardEntry[]; stats?: readonly Readonly<{ label: string; value: number }>[]; sections?: readonly Readonly<{ id: string; title: string; entries: readonly LeaderboardEntry[] }>[] }>;

export function LeaderboardPage({ currentMember, alliance, boards, missionCount, stationCount, userCount, offlineCount }: Readonly<{
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

  return <div className="app-shell">
    <AllianceSidebar activeSection="classifica" currentMember={member} missionCount={missionCount} settings={settings} stationCount={stationCount} offlineCount={offlineCount} userCount={userCount} />
    <section className="main-panel">
      <DashboardTopbar currentMember={member} onAdminOpen={() => setAdminOpen(true)} onProfileOpen={() => setProfileOpen(true)} sectionTitle="leaderboard.title" settings={settings} />
      <MissionHero description={t("leaderboard.description")} settings={settings} title="leaderboard.title" />
      <main className="content-wrap leaderboard-page">
        {[boards.filter((board) => !board.role), boards.filter((board) => board.role)].map((group, groupIndex) => <div className={`leaderboard-widgets${groupIndex === 1 ? " leaderboard-widgets-roles" : ""}`} key={groupIndex}>
          {group.map((board) => <section className={`leaderboard-widget${board.role ? ` leaderboard-widget-${board.role}` : ""}`} key={board.id}>
            <h3>{board.role === "ranger" ? <Compass size={14} /> : board.role === "builder" ? <Hammer size={14} /> : board.role === "explorer" ? <Search size={14} /> : null}{t(board.title)}</h3>
            {board.stats && <dl className="leaderboard-stats">{board.stats.map((stat) => <div key={stat.label}><dt>{t(stat.label)}</dt><dd>{stat.value}</dd></div>)}</dl>}
            {!board.stats && (board.sections ?? [{ id: board.id, title: "", entries: board.entries }]).map((section) => <div className="leaderboard-section" key={section.id}>
              {section.title && <h4>{t(section.title)}</h4>}
              {section.entries.length === 0 && <p className="messages-empty">{t(board.empty)}</p>}
              <ol className="leaderboard-list">
                {section.entries.slice(0, board.role ? 3 : 10).map((entry, index) => <li className={`leaderboard-row${entry.publicId === member.publicId ? " leaderboard-row-me" : ""}${index < 3 ? ` leaderboard-row-top-${index + 1}` : ""}`} key={entry.publicId}>
                  <span aria-label={t("leaderboard.rank")} className="leaderboard-rank">{index + 1}</span>
                  {entry.image ? <Image alt="" className="leaderboard-avatar" height={32} src={entry.image} unoptimized width={32} /> : <span className="leaderboard-avatar" />}
                  <span className="leaderboard-name">{entry.name}</span>
                  {entry.specialty && <span className={`badge badge--specialty badge--specialty-${entry.specialty} leaderboard-badge`}><span className="leaderboard-badge-label">{t(`common.${entry.specialty}`)}</span><span aria-label={t(`common.${entry.specialty}`)} className="leaderboard-badge-icon" role="img">{entry.specialty === "ranger" ? <Compass size={14} /> : entry.specialty === "builder" ? <Hammer size={14} /> : <Search size={14} />}</span></span>}
                  <span aria-label={t(section.title || board.title)} className="leaderboard-score" title={t(section.title || board.title)}>{entry.count}</span>
                </li>)}
              </ol>
            </div>)}
          </section>)}
        </div>)}
      </main>
    </section>
    {adminOpen && member.role === "admin" && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setSettings} />}
    {profileOpen && <MemberProfilePanel member={member} onClose={() => setProfileOpen(false)} onSaved={(profile) => setMember((current) => ({ ...current, ...profile }))} />}
  </div>;
}
