"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { CircleAlert, LogOut, Orbit, UserRound } from "lucide-react";
import { MemberProfilePanel } from "@/components/member-profile-panel";
import { isValidNmsFriendCode, type AllianceMember } from "@/lib/member-types";
import { useLocale } from "@/components/locale-provider";
import { LanguageSelector } from "@/components/language-selector";

export function PendingApproval({ member }: Readonly<{ member: AllianceMember }>) {
  const { t } = useLocale();
  const [profile, setProfile] = useState(member);
  const [profileOpen, setProfileOpen] = useState(false);
  const complete = Boolean(profile.nmsName && isValidNmsFriendCode(profile.nmsCode) && profile.platforms.length && profile.specialty);

  return (
    <main className="login-screen">
      <section className="login-panel pending-panel">
        <LanguageSelector />
        <span className="login-mark"><Orbit size={28} /></span>
        <span className="eyebrow login-eyebrow">NMS ALLIANCE · NETWORK</span>
        {member.membershipStatus === "blocked" ? <>
          <h1>{t("Access blocked")}<span>.</span></h1>
          <p>{t("A moderator or administrator has blocked your access to this alliance. Contact them to request a review.")}</p>
          <div className="pending-status blocked-status"><CircleAlert size={16} /> {t("Account blocked")}</div>
        </> : <>
          <h1>{t("Request pending")}<span>.</span></h1>
          <p>{t("Mission access will be available after a moderator or administrator approves your account.")}</p>
          <div className="pending-status"><CircleAlert size={16} /> {t("Approval pending")}</div>
          <button className="google-login-button" onClick={() => setProfileOpen(true)} type="button"><UserRound size={17} /> {t(complete ? "Edit NMS profile" : "Complete NMS profile")}</button>
          <small>{profile.nmsName || member.name} · {t(complete ? "NMS profile complete" : "Name, friend code, platform, and specialty required")}</small>
        </>}
        <button className="pending-signout" onClick={() => signOut({ callbackUrl: "/" })} type="button"><LogOut size={15} /> {t("Sign out")}</button>
      </section>
      {profileOpen && member.membershipStatus === "pending" && <MemberProfilePanel member={profile} onClose={() => setProfileOpen(false)} onSaved={(updated) => setProfile((current) => ({ ...current, ...updated }))} />}
    </main>
  );
}