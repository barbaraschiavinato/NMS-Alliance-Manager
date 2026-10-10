"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { CircleAlert, LogOut, Orbit, UserRound } from "lucide-react";
import { MemberProfilePanel } from "@/components/modals/member-profile-panel";
import { isValidNmsFriendCode, type AllianceMember } from "@/lib/member-types";
import { useLocale } from "@/components/providers/locale-provider";
import { LanguageSelector } from "@/components/shared/language-selector";

export function PendingApproval({ member }: Readonly<{ member: AllianceMember }>) {
  const { t } = useLocale();
  const [profile, setProfile] = useState(member);
  const [profileOpen, setProfileOpen] = useState(false);
  const complete = Boolean(profile.nmsName && isValidNmsFriendCode(profile.nmsCode) && profile.specialty);

  return (
    <main className="login-screen">
      <section className="login-panel pending-panel">
        <LanguageSelector />
        <span className="login-mark"><Orbit size={28} /></span>
        <span className="eyebrow login-eyebrow">NMS ALLIANCE · NETWORK</span>
        {member.membershipStatus === "blocked" ? <>
          <h1>{t("auth.access_blocked")}<span>.</span></h1>
          <p>{t("admin.a_moderator_or_administrator_has_blocked_your_access_to_this_alliance_contact_them_to_request_a_review")}</p>
          <div className="pending-status blocked-status"><CircleAlert size={16} /> {t("auth.account_blocked")}</div>
        </> : <>
          <h1>{t("auth.request_pending")}<span>.</span></h1>
          <p>{t("auth.mission_access_will_be_available_after_a_moderator_or_administrator_approves_your_account")}</p>
          <div className="pending-status"><CircleAlert size={16} /> {t("auth.approval_pending")}</div>
          <button className="google-login-button" onClick={() => setProfileOpen(true)} type="button"><UserRound size={17} /> {t(complete ? "profile.edit_nms_profile" : "profile.complete_nms_profile")}</button>
          <small>{profile.nmsName || member.name} · {t(complete ? "profile.nms_profile_complete" : "profile.name_friend_code_platform_and_specialty_required")}</small>
        </>}
        <button className="pending-signout" onClick={() => signOut({ callbackUrl: "/" })} type="button"><LogOut size={15} /> {t("navigation.sign_out")}</button>
      </section>
      {profileOpen && member.membershipStatus === "pending" && <MemberProfilePanel member={profile} onClose={() => setProfileOpen(false)} onSaved={(updated) => setProfile((current) => ({ ...current, ...updated }))} />}
    </main>
  );
}