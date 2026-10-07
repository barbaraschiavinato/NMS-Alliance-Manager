"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Ban, Check, CircleAlert, CircleX, Crosshair, LayoutGrid, List, Orbit, Search, Trash2, UserRoundCheck } from "lucide-react";
import { formatNmsFriendCode } from "@/lib/member-types";
import type { AllianceMember, AllianceSettings, MemberRole, MemberSpecialty, MembershipStatus } from "@/lib/member-types";
import { AllianceSidebar, DashboardTopbar, MissionHero } from "@/components/dashboard-chrome";
import { AdminPanel } from "@/components/admin-panel";
import { MemberProfilePanel } from "@/components/member-profile-panel";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useLocale } from "@/components/locale-provider";
import { useNavigationSearchState } from "@/components/navigation-search-reset";

type MemberFilter = "all" | MembershipStatus;
type ManagedMember = AllianceMember & { protectedAdmin: boolean };

const roleLabels: Record<MemberRole, string> = { user: "members.member_role_label", moderator: "common.moderator", admin: "admin.administrator" };
const statusLabels: Record<MembershipStatus, string> = { pending: "common.pending_status_label", approved: "auth.approved_status_label", blocked: "common.blocked_status_label" };
const specialtyLabels: Record<MemberSpecialty, string> = { builder: "common.builder", ranger: "common.ranger", explorer: "common.explorer" };

function updateNotice(update: { membershipStatus: MembershipStatus } | { role: MemberRole }) {
  if ("role" in update) {
    const role = update.role === "admin" ? "Administrator" : update.role === "moderator" ? "Moderator" : "Member";
    return `Role updated: ${role}.`;
  }
  if (update.membershipStatus === "approved") return "User approved.";
  if (update.membershipStatus === "blocked") return "User blocked.";
  return "User is pending approval.";
}

function MemberActions({ member, canChangeRole, currentMemberEmail, onStatus, onRole, onDelete }: Readonly<{
  member: ManagedMember;
  canChangeRole: boolean;
  currentMemberEmail: string;
  onStatus: (email: string, status: MembershipStatus) => void;
  onRole: (email: string, role: MemberRole) => void;
  onDelete: (member: AllianceMember) => void;
}>) {
  const { t } = useLocale();
  const canManage = canChangeRole || member.role === "user";
  const isCurrentMember = member.email.toLowerCase() === currentMemberEmail.toLowerCase();
  if (member.protectedAdmin || isCurrentMember || !canManage) return null;


  if (member.role === "admin") return <div className="member-page-actions">
    <select aria-label={t("members.role_for_email", { email: member.email })} onChange={(event) => onRole(member.email, event.target.value as MemberRole)} value={member.role}>
      {(Object.keys(roleLabels) as MemberRole[]).map((role) => <option key={role} value={role}>{t(roleLabels[role])}</option>)}
    </select>
    <button aria-label={t("common.delete_email", { email: member.email })} className="member-icon-action delete-member" data-tooltip={t("admin.delete_administrator")} onClick={() => onDelete(member)} type="button"><Trash2 size={14} /></button>
  </div>;

  return (
    <div className="member-page-actions">
      {canChangeRole && <select aria-label={t("members.role_for_email", { email: member.email })} onChange={(event) => onRole(member.email, event.target.value as MemberRole)} value={member.role}>{(Object.keys(roleLabels) as MemberRole[]).map((role) => <option key={role} value={role}>{t(roleLabels[role])}</option>)}</select>}
      {member.membershipStatus === "pending" && <button aria-label={t("common.approve_email", { email: member.email })} className="member-icon-action approval-button" data-tooltip={t("members.approve_user")} onClick={() => onStatus(member.email, "approved")} type="button"><Check size={14} /></button>}
      {member.membershipStatus === "approved" && <button aria-label={t("auth.revoke_approval_for_email", { email: member.email })} className="member-icon-action approval-button revoke-approval" data-tooltip={t("auth.revoke_approval")} onClick={() => onStatus(member.email, "pending")} type="button"><CircleX size={14} /></button>}
      {member.membershipStatus === "blocked"
        ? <button aria-label={t("common.unblock_email", { email: member.email })} className="member-icon-action approval-button" data-tooltip={t("members.unblock_user")} onClick={() => onStatus(member.email, "pending")} type="button"><UserRoundCheck size={14} /></button>
        : <button aria-label={t("common.block_email", { email: member.email })} className="member-icon-action block-member" data-tooltip={t("members.block_user")} onClick={() => onStatus(member.email, "blocked")} type="button"><Ban size={14} /></button>}
      <button aria-label={t("common.delete_email", { email: member.email })} className="member-icon-action delete-member" data-tooltip={t("members.delete_user")} onClick={() => onDelete(member)} type="button"><Trash2 size={14} /></button>
    </div>
  );
}

export function MembersPage({ currentMember, alliance, missionCount, sidebarStationCount, sidebarUserCount }: Readonly<{
  currentMember: AllianceMember;
  alliance: AllianceSettings;
  missionCount: number;
  sidebarStationCount: number;
  sidebarUserCount: number;
}>) {
  const { t } = useLocale();
  const [pageMember, setPageMember] = useState(currentMember);
  const [allianceSettings, setAllianceSettings] = useState(alliance);
  const [members, setMembers] = useState<ManagedMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [viewOverride, setViewOverride] = useState<"list" | "cards" | null>(null);
  const viewMode = viewOverride ?? allianceSettings.defaultTableView;
  const [search, setSearch] = useNavigationSearchState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const canChangeRole = pageMember.role === "admin";

  useEffect(() => {
    fetch("/api/admin/members", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load the user list.");
        setMembers((body as ManagedMember[]).filter((member) => !member.offline));
      })
      .catch((error_: unknown) => setError(error_ instanceof Error ? error_.message : t("errors.unable_to_load_the_user_list")))
      .finally(() => setLoadingMembers(false));
  }, [t]);

  const counts = useMemo(() => ({
    all: members.length,
    pending: members.filter((member) => member.membershipStatus === "pending").length,
    approved: members.filter((member) => member.membershipStatus === "approved").length,
    blocked: members.filter((member) => member.membershipStatus === "blocked").length,
  }), [members]);

  const visibleMembers = useMemo(() => members
    .filter((member) => filter === "all" || member.membershipStatus === filter)
    .filter((member) => `${member.name} ${member.nmsName} ${member.email} ${member.nmsCode} ${member.specialty ? t(specialtyLabels[member.specialty]) : ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [filter, members, search, t]);
  let emptyMessage = t("members.no_users_match_this_filter");
  if (counts.all === 0) emptyMessage = t("auth.no_registered_users_members_will_appear_after_their_first_google_sign_in");
  else if (filter === "pending") emptyMessage = t("auth.there_are_no_requests_awaiting_approval");

  async function patchMember(email: string, update: { membershipStatus: MembershipStatus } | { role: MemberRole }) {
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ...update }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Update failed.");
      setMembers((current) => current.map((member) => member.email === email ? { ...member, ...update } : member));
      setNotice(updateNotice(update));
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : t("errors.update_failed"));
    }
  }

  async function deleteMember(member: AllianceMember) {
    if (!window.confirm(t("auth.remove_member_from_the_alliance_signing_in_again_will_require_a_new_approval", { member: member.nmsName || member.email }))) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: member.email }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Deletion failed.");
      setMembers((current) => current.filter((item) => item.email !== member.email));
      setNotice("User removed from the alliance.");
    } catch (error_: unknown) {
      setError(error_ instanceof Error ? error_.message : t("errors.deletion_failed"));
    }
  }

  return (
    <div className="app-shell">
      <AllianceSidebar activeSection="utenti" currentMember={pageMember} missionCount={missionCount} settings={allianceSettings} stationCount={sidebarStationCount} userCount={loadingMembers ? sidebarUserCount : members.length} />
      <section className="main-panel">
        <DashboardTopbar currentMember={pageMember} onAdminOpen={() => setAdminOpen(true)} onProfileOpen={() => setProfileOpen(true)} sectionTitle="Users" settings={allianceSettings} />
        <MissionHero
          description="Approve requests, manage access, and review NMS profiles."
          settings={allianceSettings}
          showCreate={false}
          title="Users"
        />
        <section aria-label={t("members.user_status")} className="metrics-row">
          <div className="metrics-inner">
            <div className="metric"><span className="metric-label">{t("common.pending_requests")}</span><strong>{counts.pending}</strong></div>
            <div className="metric"><span className="metric-label">{t("auth.approved_members_metric")}</span><strong>{counts.approved}</strong></div>
            <div className="metric"><span className="metric-label">{t("common.blocked_members_metric")}</span><strong>{counts.blocked}</strong></div>
            <div className="metric"><span className="metric-label">{t("common.total")}</span><strong>{counts.all}</strong></div>
          </div>
        </section>
        <main className="content-wrap">
      <section className="members-list-section">
        <div className="members-toolbar">
          <div className="member-filter-tabs" role="tablist" aria-label={t("members.filter_users_by_status")}>
            {(["pending", "approved", "blocked", "all"] as MemberFilter[]).map((status) => <button aria-selected={filter === status} className={filter === status ? "member-filter-tab selected" : "member-filter-tab"} key={status} onClick={() => setFilter(status)} role="tab" type="button">{t(status === "all" ? "common.all" : statusLabels[status])}<span>{counts[status]}</span></button>)}
          </div>
          <label className="search-field member-search"><Search size={15} /><input aria-label={t("members.search_users")} onChange={(event) => setSearch(event.target.value)} placeholder={t("common.search_name_email_or_code")} value={search} /></label>
          <div aria-label={t("members.user_view")} className="view-toggle" role="group">
            <button aria-label={t("navigation.list_view")} aria-pressed={viewMode === "list"} className={viewMode === "list" ? "selected" : ""} onClick={() => setViewOverride("list")} title={t("navigation.list_view")} type="button"><List size={15} /></button>
            <button aria-label={t("navigation.card_view")} aria-pressed={viewMode === "cards"} className={viewMode === "cards" ? "selected" : ""} onClick={() => setViewOverride("cards")} title={t("navigation.card_view")} type="button"><LayoutGrid size={15} /></button>
          </div>
        </div>

        {error && <p className="form-error"><CircleAlert size={15} />{t(error)}</p>}
        {notice && <p className="address-validation address-valid"><Check size={14} />{t(notice)}</p>}

        {loadingMembers ? <LoadingSpinner /> : viewMode === "list" ? <div className="members-table-wrap">
          <table className="members-table">
            <thead><tr><th>{t("members.member_column_heading")}</th><th>{t("profile.friend_code_column_heading")}</th><th>{t("profile.platforms_column_heading")}</th><th>{t("profile.specialty_column_heading")}</th><th>{t("common.status_column_heading")}</th><th>{t("members.role_column_heading")}</th><th>{t("common.actions_column_heading")}</th></tr></thead>
            <tbody>
              {visibleMembers.map((member) => <tr key={member.email}>
                <td><div className="member-page-identity"><span className="member-admin-avatar">{member.image ? <span style={{ backgroundImage: `url("${member.image}")` }} /> : (member.nmsName || member.name).slice(0, 1).toUpperCase()}</span><span><strong>{member.nmsName || t("common.nms_name_incomplete_label")}</strong><small>{member.email}</small></span></div></td>
                <td className="member-code-cell">{member.nmsCode ? formatNmsFriendCode(member.nmsCode) : t("common.incomplete")}</td>
                <td>{member.platforms.length ? member.platforms.join(", ") : t("common.not_selected")}</td>
                <td>{member.specialty ? t(specialtyLabels[member.specialty]) : t("common.not_selected")}</td>
                <td>{member.protectedAdmin
                  ? <span className="badge badge--protected">{t("common.protected")}</span>
                  : <span className={`badge badge--member-status badge--member-status-${member.membershipStatus}`}>{t(statusLabels[member.membershipStatus])}</span>}</td>
                <td>{t(roleLabels[member.role])}</td>
                <td><MemberActions canChangeRole={canChangeRole} currentMemberEmail={pageMember.email} member={member} onDelete={(target) => void deleteMember(target)} onRole={(email, role) => void patchMember(email, { role })} onStatus={(email, membershipStatus) => void patchMember(email, { membershipStatus })} /></td>
              </tr>)}
              {visibleMembers.length === 0 && <tr><td className="members-empty" colSpan={7}>{emptyMessage}</td></tr>}
            </tbody>
          </table>
        </div> : <div className="member-card-grid">
          {visibleMembers.map((member) => <article className="member-card" key={member.email}>
            <div className="member-card-heading">
              <div className="member-page-identity">
                <span className="member-admin-avatar">{member.image ? <span style={{ backgroundImage: `url("${member.image}")` }} /> : (member.nmsName || member.name).slice(0, 1).toUpperCase()}</span>
                <span><strong>{member.nmsName || t("common.nms_name_incomplete_label")}</strong><small>{member.email}</small></span>
              </div>
              {member.protectedAdmin
                ? <span className="badge badge--protected">{t("common.protected")}</span>
                : <span className={`badge badge--member-status badge--member-status-${member.membershipStatus}`}>{t(statusLabels[member.membershipStatus])}</span>}
            </div>
            <dl className="member-card-details">
              <div><dt>{t("profile.friend_code_label")}</dt><dd>{member.nmsCode ? formatNmsFriendCode(member.nmsCode) : t("common.incomplete")}</dd></div>
              <div><dt>{t("profile.platforms_label")}</dt><dd>{member.platforms.length ? member.platforms.join(", ") : t("common.not_selected")}</dd></div>
              <div><dt>{t("profile.specialty_label")}</dt><dd>{member.specialty ? t(specialtyLabels[member.specialty]) : t("common.not_selected")}</dd></div>
              <div><dt>{t("members.role_label")}</dt><dd>{t(roleLabels[member.role])}</dd></div>
            </dl>
            <div className="member-card-actions">
              <div className="member-page-actions">
                <Link aria-label={t("members.find_member_s_missions", { member: member.nmsName || member.email })} className="member-icon-action" data-tooltip={t("members.user_missions")} href={`/?search=${encodeURIComponent(member.email)}`}><Crosshair size={14} /></Link>
                <Link aria-label={t("stations.find_member_s_stations", { member: member.nmsName || member.email })} className="member-icon-action" data-tooltip={t("stations.user_stations")} href={`/stations?search=${encodeURIComponent(member.email)}`}><Orbit size={14} /></Link>
              </div>
              <MemberActions canChangeRole={canChangeRole} currentMemberEmail={pageMember.email} member={member} onDelete={(target) => void deleteMember(target)} onRole={(email, role) => void patchMember(email, { role })} onStatus={(email, membershipStatus) => void patchMember(email, { membershipStatus })} />
            </div>
          </article>)}
          {visibleMembers.length === 0 && <p className="member-cards-empty">{emptyMessage}</p>}
        </div>}
        <footer className="members-list-footer">{loadingMembers ? t("members.loading_users") : t("members.showing_visible_of_total_users", { visible: visibleMembers.length, total: counts.all })}</footer>
      </section>
        </main>
      </section>
      {adminOpen && pageMember.role === "admin" && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setAllianceSettings} />}
      {profileOpen && <MemberProfilePanel member={pageMember} onClose={() => setProfileOpen(false)} onSaved={(profile) => setPageMember((current) => ({ ...current, nmsName: profile.nmsName, nmsCode: profile.nmsCode, platforms: profile.platforms, specialty: profile.specialty }))} />}
    </div>
  );
}