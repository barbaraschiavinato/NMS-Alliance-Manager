"use client";

import { useEffect, useMemo, useState } from "react";
import type { AllianceMember, AllianceSettings, MemberRole, MembershipStatus } from "@/lib/member-types";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Hero } from "@/components/layout/hero";
import { AdminPanel } from "@/components/modals/admin-panel";
import { MemberProfilePanel } from "@/components/modals/member-profile-panel";
import { MemberList, type ManagedMember, type MemberFilter } from "@/components/sections/member-list";
import { useLocale } from "@/components/providers/locale-provider";
import { useNavigationSearchState } from "@/components/shared/navigation-search-reset";

function updateNotice(update: { membershipStatus: MembershipStatus } | { role: MemberRole }) {
  if ("role" in update) {
    const role = update.role === "admin" ? "Administrator" : update.role === "moderator" ? "Moderator" : "Member";
    return `Role updated: ${role}.`;
  }
  if (update.membershipStatus === "approved") return "User approved.";
  if (update.membershipStatus === "blocked") return "User blocked.";
  return "User is pending approval.";
}

export function MembersPage({ memberActivity, currentMember, alliance, missionCount, sidebarOfflineCount, sidebarStationCount, sidebarUserCount }: Readonly<{
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
  const [members, setMembers] = useState<ManagedMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [search, setSearch] = useNavigationSearchState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<ManagedMember | null>(null);
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
    if (!window.confirm(t("auth.remove_member_from_the_alliance_signing_in_again_will_require_a_new_approval", { member: member.nmsName || member.name }))) return;
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
      <Sidebar activeSection="utenti" currentMember={pageMember} missionCount={missionCount} settings={allianceSettings} stationCount={sidebarStationCount} offlineCount={sidebarOfflineCount} userCount={loadingMembers ? sidebarUserCount : members.length} />
      <section className="main-panel">
        <Header currentMember={pageMember} onAdminOpen={() => setAdminOpen(true)} onProfileOpen={() => setProfileOpen(true)} sectionTitle="Users" settings={allianceSettings} />
        <Hero
          subtitle="Approve requests, manage access, and review NMS profiles."
          settings={allianceSettings}
          title="Users"
        />
        {!pageMember.simpleView && <section aria-label={t("members.user_status")} className="metrics-row">
          <div className="metrics-inner">
            <div className="metric"><span className="metric-label">{t("common.pending_requests")}</span><strong>{counts.pending}</strong></div>
            <div className="metric"><span className="metric-label">{t("auth.approved_members_metric")}</span><strong>{counts.approved}</strong></div>
            <div className="metric"><span className="metric-label">{t("common.blocked_members_metric")}</span><strong>{counts.blocked}</strong></div>
            <div className="metric"><span className="metric-label">{t("common.total")}</span><strong>{counts.all}</strong></div>
          </div>
        </section>}
        <main className="content-wrap">
          <MemberList
            canChangeRole={canChangeRole}
            counts={counts}
            currentMemberEmail={pageMember.email}
            error={error}
            filter={filter}
            loading={loadingMembers}
            memberActivity={memberActivity}
            members={members}
            notice={notice}
            onDelete={(target) => void deleteMember(target)}
            onEdit={setEditingMember}
            onFilterChange={setFilter}
            onRole={(email, role) => void patchMember(email, { role })}
            onSearchChange={setSearch}
            onStatus={(email, membershipStatus) => void patchMember(email, { membershipStatus })}
            search={search}
            simpleView={pageMember.simpleView === true}
          />
        </main>
      </section>
      {adminOpen && pageMember.role === "admin" && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setAllianceSettings} />}
      {editingMember && <MemberProfilePanel editMember key={editingMember.email} member={editingMember} onClose={() => setEditingMember(null)} onSaved={(updated) => { setMembers((current) => current.map((item) => item.email === updated.email ? { ...item, ...updated } : item)); setEditingMember(null); }} />}
      {profileOpen && <MemberProfilePanel member={pageMember} onClose={() => setProfileOpen(false)} onSaved={(profile) => setPageMember((current) => ({ ...current, nmsName: profile.nmsName, nmsCode: profile.nmsCode, telegramName: profile.telegramName, discordName: profile.discordName, platforms: profile.platforms, specialty: profile.specialty, simpleView: profile.simpleView }))} />}
    </div>
  );
}