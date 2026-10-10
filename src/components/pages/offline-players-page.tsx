"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, CircleAlert, Crosshair, Orbit, Pencil, Search, Trash2 } from "lucide-react";
import { formatNmsFriendCode } from "@/lib/member-types";
import type { AllianceMember, AllianceSettings, MemberSpecialty } from "@/lib/member-types";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Hero, HeroAddButton } from "@/components/layout/hero";
import { AdminPanel } from "@/components/modals/admin-panel";
import { MemberProfilePanel } from "@/components/modals/member-profile-panel";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { useLocale } from "@/components/providers/locale-provider";
import { useNavigationSearchState } from "@/components/shared/navigation-search-reset";

const specialtyLabels: Record<MemberSpecialty, string> = { builder: "common.builder", ranger: "common.ranger", explorer: "common.explorer" };

export function OfflinePlayersPage({ memberActivity, currentMember, alliance, missionCount, sidebarOfflineCount, sidebarStationCount, sidebarUserCount }: Readonly<{
  memberActivity: { missionOwnerIds: string[]; stationOwnerIds: string[] };
  currentMember: AllianceMember;
  alliance: AllianceSettings;
  missionCount: number;
  sidebarStationCount: number;
  sidebarOfflineCount: number;
  sidebarUserCount: number;
}>) {
  const { t } = useLocale();
  const [pageMember, setPageMember] = useState(currentMember);
  const [allianceSettings, setAllianceSettings] = useState(alliance);
  const [all, setAll] = useState<AllianceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useNavigationSearchState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<AllianceMember | null>(null);

  async function load() {
    const response = await fetch("/api/admin/members", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to load the user list.");
    setAll(body as AllianceMember[]);
  }

  useEffect(() => {
    fetch("/api/admin/members", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load the user list.");
        setAll(body as AllianceMember[]);
      })
      .catch((error_: unknown) => setError(error_ instanceof Error ? error_.message : t("errors.unable_to_load_the_user_list")))
      .finally(() => setLoading(false));
  }, [t]);

  const offline = useMemo(() => all.filter((member) => member.offline)
    .filter((member) => `${member.nmsName} ${member.nmsCode}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.nmsName.localeCompare(b.nmsName)), [all, search]);
  const targets = useMemo(() => all.filter((member) => !member.offline)
    .sort((a, b) => (a.nmsName || a.name).localeCompare(b.nmsName || b.name)), [all]);

  async function link(player: AllianceMember, target: AllianceMember) {
    if (!window.confirm(t("members.link_offline_confirm", { offline: player.nmsName, target: target.nmsName || target.email }))) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link", offlineId: player.publicId, targetId: target.publicId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Link failed.");
      await load();
      setNotice("members.offline_player_linked");
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : t("errors.update_failed"));
    }
  }

  async function remove(player: AllianceMember) {
    if (!window.confirm(t("auth.remove_member_from_the_alliance_signing_in_again_will_require_a_new_approval", { member: player.nmsName }))) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: player.email }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Deletion failed.");
      setAll((current) => current.filter((item) => item.publicId !== player.publicId));
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : t("errors.deletion_failed"));
    }
  }

  return (
    <div className="app-shell">
      <Sidebar activeSection="offline" currentMember={pageMember} missionCount={missionCount} settings={allianceSettings} stationCount={sidebarStationCount} offlineCount={loading ? sidebarOfflineCount : all.filter((member) => member.offline).length} userCount={sidebarUserCount} />
      <section className="main-panel">
        <Header currentMember={pageMember} onAdminOpen={() => setAdminOpen(true)} onProfileOpen={() => setProfileOpen(true)} onProfileSaved={(profile) => setPageMember((current) => ({ ...current, ...profile }))} sectionTitle={t("members.offline_players")} settings={allianceSettings} />
        <Hero settings={allianceSettings} subtitle={t("members.offline_players_description")} title={t("members.offline_players")}>
          <HeroAddButton label="members.add_offline_player" onClick={() => setAddOpen(true)} />
        </Hero>
        <main className="content-wrap">
          <section className="members-list-section">
            <div className="members-toolbar offline-toolbar">
              <span />
              <label className="search-field member-search"><Search size={15} /><input aria-label={t("members.search_offline_players")} onChange={(event) => setSearch(event.target.value)} placeholder={t("members.search_offline_players")} value={search} /></label>
            </div>
            {error && <p className="form-error"><CircleAlert size={15} />{t(error)}</p>}
            {notice && <p className="address-validation address-valid"><Check size={14} />{t(notice)}</p>}
            {loading ? <LoadingSpinner /> : offline.length === 0 ? <p className="messages-empty">{t("members.no_offline_players")}</p> : <div className="members-table-wrap">
              <table className="members-table offline-table">
                <thead><tr><th>{t("members.member_column_heading")}</th><th>{t("profile.friend_code_column_heading")}</th><th>{t("profile.telegram_name_label")}</th><th>{t("profile.discord_name_label")}</th><th>{t("profile.platforms_column_heading")}</th><th>{t("profile.specialty_column_heading")}</th><th>{t("common.actions_column_heading")}</th></tr></thead>
                <tbody>
                  {offline.map((player) => <tr key={player.publicId}>
                    <td><strong>{player.nmsName}</strong></td>
                    <td className="member-code-cell">{formatNmsFriendCode(player.nmsCode)}</td>
                    <td>{player.telegramName || "-"}</td>
                    <td>{player.discordName || "-"}</td>
                    <td>{player.platforms.join(", ")}</td>
                    <td>{player.specialty ? t(specialtyLabels[player.specialty]) : ""}</td>
                    <td><div className="member-page-actions">
                      {memberActivity.missionOwnerIds.includes(player.publicId) && <Link aria-label={t("members.find_member_s_missions", { member: player.nmsName })} className="member-icon-action member-link-action" data-tooltip={t("members.user_missions")} href={`/missions?search=${encodeURIComponent(player.nmsName)}`}><Crosshair size={14} /></Link>}
                      {memberActivity.stationOwnerIds.includes(player.publicId) && <Link aria-label={t("stations.find_member_s_stations", { member: player.nmsName })} className="member-icon-action member-link-action member-station-filter" data-tooltip={t("stations.user_stations")} href={`/stations?search=${encodeURIComponent(player.nmsName)}`}><Orbit size={14} /></Link>}
                      <select aria-label={t("members.link_to_account")} defaultValue="" onChange={(event) => {
                        const target = targets.find((candidate) => candidate.publicId === event.target.value);
                        event.target.value = "";
                        if (target) void link(player, target);
                      }}>
                        <option value="">{t("members.link_to_account")}</option>
                        {targets.map((target) => <option key={target.publicId} value={target.publicId}>{target.nmsName || target.name} · {target.email}</option>)}
                      </select>
                      <button aria-label={t("members.edit_offline_player")} className="member-icon-action" data-tooltip={t("members.edit_offline_player")} onClick={() => setEditing(player)} type="button"><Pencil size={14} /></button>
                      <button aria-label={t("common.delete_email", { email: player.nmsName })} className="member-icon-action delete-member" data-tooltip={t("members.delete_user")} onClick={() => void remove(player)} type="button"><Trash2 size={14} /></button>
                    </div></td>
                  </tr>)}
                </tbody>
              </table>
            </div>}
          </section>
        </main>
      </section>
      {adminOpen && pageMember.role === "admin" && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setAllianceSettings} />}
      {profileOpen && <MemberProfilePanel member={pageMember} onClose={() => setProfileOpen(false)} onSaved={(profile) => setPageMember((current) => ({ ...current, nmsName: profile.nmsName, nmsCode: profile.nmsCode, telegramName: profile.telegramName, discordName: profile.discordName, platforms: profile.platforms, specialty: profile.specialty, simpleView: profile.simpleView }))} />}
      {editing && <MemberProfilePanel editOffline key={editing.publicId} member={editing} onClose={() => setEditing(null)} onSaved={(updated) => { setAll((current) => current.map((item) => item.publicId === updated.publicId ? updated : item)); setNotice("members.offline_player_updated"); }} />}
      {addOpen && <MemberProfilePanel createOffline member={{ ...pageMember, nmsName: "", nmsCode: "", telegramName: "", discordName: "", platforms: [], specialty: "" }} onClose={() => setAddOpen(false)} onSaved={(created) => { setAll((current) => [...current, created]); setNotice("members.offline_player_created"); }} />}
    </div>
  );
}
