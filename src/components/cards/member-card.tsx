"use client";

import Link from "next/link";
import { Ban, Check, CircleX, Crosshair, Orbit, Pencil, Trash2, UserRoundCheck } from "lucide-react";
import { formatNmsFriendCode } from "@/lib/member-types";
import type { AllianceMember, MemberRole, MemberSpecialty, MembershipStatus } from "@/lib/member-types";
import { useLocale } from "@/components/providers/locale-provider";

export type ManagedMember = AllianceMember & { protectedAdmin: boolean };

export const roleLabels: Record<MemberRole, string> = { user: "members.member_role_label", moderator: "common.moderator", admin: "admin.administrator" };
export const statusLabels: Record<MembershipStatus, string> = { pending: "common.pending_status_label", approved: "auth.approved_status_label", blocked: "common.blocked_status_label" };
export const specialtyLabels: Record<MemberSpecialty, string> = { builder: "common.builder", ranger: "common.ranger", explorer: "common.explorer" };

function MemberActions({ member, canChangeRole, currentMemberEmail, onStatus, onRole, onDelete, onEdit }: Readonly<{
  member: ManagedMember;
  canChangeRole: boolean;
  currentMemberEmail: string;
  onStatus: (email: string, status: MembershipStatus) => void;
  onRole: (email: string, role: MemberRole) => void;
  onDelete: (member: AllianceMember) => void;
  onEdit: (member: AllianceMember) => void;
}>) {
  const { t } = useLocale();
  const canManage = canChangeRole || member.role === "user";
  const isCurrentMember = member.email.toLowerCase() === currentMemberEmail.toLowerCase();
  if (member.protectedAdmin || isCurrentMember || !canManage) return null;


  const editButton = <button aria-label={t("members.edit_member_profile")} className="member-icon-action" data-tooltip={t("members.edit_member_profile")} onClick={() => onEdit(member)} type="button"><Pencil size={14} /></button>;

  if (member.role === "admin") return <div className="member-page-actions">
    <select aria-label={t("members.role_for_email", { email: member.email })} onChange={(event) => onRole(member.email, event.target.value as MemberRole)} value={member.role}>
      {(Object.keys(roleLabels) as MemberRole[]).map((role) => <option key={role} value={role}>{t(roleLabels[role])}</option>)}
    </select>
    {editButton}
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
      {editButton}
      <button aria-label={t("common.delete_email", { email: member.email })} className="member-icon-action delete-member" data-tooltip={t("members.delete_user")} onClick={() => onDelete(member)} type="button"><Trash2 size={14} /></button>
    </div>
  );
}

export function MemberCard({ member, memberActivity, canChangeRole, currentMemberEmail, onStatus, onRole, onDelete, onEdit }: Readonly<{
  member: ManagedMember;
  memberActivity: { missionOwnerIds: string[]; stationOwnerIds: string[] };
  canChangeRole: boolean;
  currentMemberEmail: string;
  onStatus: (email: string, status: MembershipStatus) => void;
  onRole: (email: string, role: MemberRole) => void;
  onDelete: (member: AllianceMember) => void;
  onEdit: (member: ManagedMember) => void;
}>) {
  const { t } = useLocale();
  return (
          <article className="member-card">
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
              <div><dt>{t("profile.telegram_name_label")}</dt><dd>{member.telegramName || "-"}</dd></div>
              <div><dt>{t("profile.discord_name_label")}</dt><dd>{member.discordName || "-"}</dd></div>
              <div><dt>{t("profile.platforms_label")}</dt><dd>{member.platforms.length ? member.platforms.join(", ") : t("common.not_selected")}</dd></div>
              <div><dt>{t("profile.specialty_label")}</dt><dd>{member.specialty ? t(specialtyLabels[member.specialty]) : t("common.not_selected")}</dd></div>
              <div><dt>{t("members.role_label")}</dt><dd>{t(roleLabels[member.role])}</dd></div>
            </dl>
            <div className="member-card-actions">
              <div className="member-page-actions">
                {member.nmsName && memberActivity.missionOwnerIds.includes(member.publicId) && <Link aria-label={t("members.find_member_s_missions", { member: member.nmsName || member.name })} className="member-icon-action member-link-action" data-tooltip={t("members.user_missions")} href={`/missions?search=${encodeURIComponent(member.nmsName)}`}><Crosshair size={14} /></Link>}
                {member.nmsName && memberActivity.stationOwnerIds.includes(member.publicId) && <Link aria-label={t("stations.find_member_s_stations", { member: member.nmsName || member.name })} className="member-icon-action member-link-action member-station-filter" data-tooltip={t("stations.user_stations")} href={`/stations?search=${encodeURIComponent(member.nmsName)}`}><Orbit size={14} /></Link>}
              </div>
              <MemberActions onEdit={(target) => onEdit(target as ManagedMember)} canChangeRole={canChangeRole} currentMemberEmail={currentMemberEmail} member={member} onDelete={onDelete} onRole={onRole} onStatus={onStatus} />
            </div>
          </article>
  );
}
