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
          <h1>{t("Accesso bloccato")}<span>.</span></h1>
          <p>{t("Un moderatore o amministratore ha bloccato l’accesso a questa alleanza. Contattali per chiedere una verifica.")}</p>
          <div className="pending-status blocked-status"><CircleAlert size={16} /> {t("Account bloccato")}</div>
        </> : <>
          <h1>{t("Richiesta in attesa")}<span>.</span></h1>
          <p>{t("L’accesso alle missioni sarà disponibile dopo l’approvazione di un moderatore o amministratore.")}</p>
          <div className="pending-status"><CircleAlert size={16} /> {t("Approvazione richiesta")}</div>
          <button className="google-login-button" onClick={() => setProfileOpen(true)} type="button"><UserRound size={17} /> {t(complete ? "Modifica profilo NMS" : "Completa profilo NMS")}</button>
          <small>{profile.nmsName || member.name} · {t(complete ? "Profilo NMS completo" : "Nome, codice, piattaforma e specializzazione richiesti")}</small>
        </>}
        <button className="pending-signout" onClick={() => signOut({ callbackUrl: "/" })} type="button"><LogOut size={15} /> {t("Esci")}</button>
      </section>
      {profileOpen && member.membershipStatus === "pending" && <MemberProfilePanel member={profile} onClose={() => setProfileOpen(false)} onSaved={(updated) => setProfile((current) => ({ ...current, ...updated }))} />}
    </main>
  );
}