"use client";

import { Tabs } from "@/components/layout/tabs";
import { useMemo } from "react";
import { Check, CircleAlert, Search } from "lucide-react";
import type { AllianceMember, MemberRole, MembershipStatus } from "@/lib/member-types";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { useLocale } from "@/components/providers/locale-provider";

export type MemberFilter = "all" | MembershipStatus;
import { MemberCard, specialtyLabels, statusLabels, type ManagedMember } from "@/components/cards/member-card";

export type { ManagedMember };

export function MemberList({ members, counts, filter, onFilterChange, search, onSearchChange, loading, error, notice, memberActivity, canChangeRole, currentMemberEmail, simpleView, onStatus, onRole, onDelete, onEdit }: Readonly<{
  members: ManagedMember[];
  counts: Record<MemberFilter, number>;
  filter: MemberFilter;
  onFilterChange: (filter: MemberFilter) => void;
  search: string;
  onSearchChange: (search: string) => void;
  loading: boolean;
  error: string;
  notice: string;
  memberActivity: { missionOwnerIds: string[]; stationOwnerIds: string[] };
  canChangeRole: boolean;
  currentMemberEmail: string;
  simpleView: boolean;
  onStatus: (email: string, status: MembershipStatus) => void;
  onRole: (email: string, role: MemberRole) => void;
  onDelete: (member: AllianceMember) => void;
  onEdit: (member: ManagedMember) => void;
}>) {
  const { t } = useLocale();
  const visibleMembers = useMemo(() => members
    .filter((member) => filter === "all" || member.membershipStatus === filter)
    .filter((member) => `${member.name} ${member.nmsName} ${member.email} ${member.nmsCode} ${member.specialty ? t(specialtyLabels[member.specialty]) : ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [filter, members, search, t]);
  let emptyMessage = t("members.no_users_match_this_filter");
  if (counts.all === 0) emptyMessage = t("auth.no_registered_users_members_will_appear_after_their_first_google_sign_in");
  else if (filter === "pending") emptyMessage = t("auth.there_are_no_requests_awaiting_approval");
  return (
      <section className="members-list-section">
        <div className="toolbar members-toolbar">
          <Tabs className="member-filter-tabs" items={(["pending", "approved", "blocked", "all"] as MemberFilter[]).filter((status) => status === "all" || status === filter || counts[status] > 0).map((status) => ({ key: status, label: t(status === "all" ? "common.all" : statusLabels[status]), count: counts[status], selected: filter === status, onSelect: () => onFilterChange(status) }))} label={t("members.filter_users_by_status")} />
          <div className="toolbar-actions member-toolbar-actions">
            <label className="search-field member-search"><Search size={15} /><input aria-label={t("members.search_users")} onChange={(event) => onSearchChange(event.target.value)} placeholder={t("common.search_name_email_or_code")} value={search} /></label>
          </div>
        </div>

        {error && <p className="form-error"><CircleAlert size={15} />{t(error)}</p>}
        {notice && <p className="address-validation address-valid"><Check size={14} />{t(notice)}</p>}

        {loading ? <LoadingSpinner /> : visibleMembers.length === 0 ? <p className="messages-empty">{emptyMessage}</p> : <div className="member-card-grid">
          {visibleMembers.map((member) => <MemberCard canChangeRole={canChangeRole} currentMemberEmail={currentMemberEmail} key={member.email} member={member} memberActivity={memberActivity} onDelete={onDelete} onEdit={onEdit} onRole={onRole} onStatus={onStatus} />)}
        </div>}
        {!simpleView && <footer className="members-list-footer">{loading ? t("members.loading_users") : t("members.showing_visible_of_total_users", { visible: visibleMembers.length, total: counts.all })}</footer>}
      </section>
  );
}
