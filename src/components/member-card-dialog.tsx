"use client";

import { useEffect, useState } from "react";
import { CircleAlert, X } from "lucide-react";
import type { MemberRole, MemberSpecialty, NmsPlatform } from "@/lib/member-types";
import { useLocale } from "@/components/locale-provider";

type MemberCard = {
  name: string;
  image: string;
  nmsName: string;
  platforms: NmsPlatform[];
  specialty: MemberSpecialty | "";
  email?: string;
  nmsCode?: string;
  role?: MemberRole;
};

const specialtyLabels: Record<MemberSpecialty, string> = {
  builder: "Builder",
  ranger: "Ranger",
  explorer: "Explorer",
};

const roleLabels: Record<MemberRole, string> = {
  user: "Member",
  moderator: "Moderator",
  admin: "Administrator",
};

export function MemberCardDialog({ email, onClose }: Readonly<{ email: string; onClose: () => void }>) {
  const { t } = useLocale();
  const [profile, setProfile] = useState<MemberCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/members?email=${encodeURIComponent(email)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load the profile.");
        setProfile(body as MemberCard);
      })
      .catch((error_: unknown) => {
        if (!controller.signal.aborted) setError(error_ instanceof Error ? error_.message : t("Unable to load the profile."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [email, t]);

  return (
    <div className="dialog-backdrop">
      <dialog aria-labelledby="member-card-title" aria-modal="true" className="mission-dialog member-card-dialog" open>
        <div className="dialog-heading">
          <div><span className="eyebrow">{t("MEMBER PROFILE")}</span><h2 id="member-card-title">{t("NMS profile")}</h2></div>
          <button aria-label={t("Close")} className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        {loading && <p>{t("Loading profile")}</p>}
        {error && <p className="form-error"><CircleAlert size={15} />{t(error)}</p>}
        {profile && <>
          <div className="profile-identity">
            <span className="profile-google-avatar">{profile.image ? <span style={{ backgroundImage: `url("${profile.image}")` }} /> : (profile.nmsName || profile.name).slice(0, 1).toUpperCase()}</span>
            <span><strong>{profile.nmsName || profile.name}</strong><small>{profile.nmsName ? profile.name : t("Alliance member")}</small></span>
          </div>
          <dl className="member-card-details">
            <div><dt>{t("Specialty")}</dt><dd>{profile.specialty ? t(specialtyLabels[profile.specialty]) : t("No specialty specified")}</dd></div>
            <div><dt>{t("Platforms")}</dt><dd>{profile.platforms.length ? profile.platforms.join(", ") : t("No platforms specified")}</dd></div>
            {profile.nmsCode && <div><dt>{t("NMS friend code")}</dt><dd>{profile.nmsCode}</dd></div>}
            {profile.role && <div><dt>{t("Role")}</dt><dd>{t(roleLabels[profile.role])}</dd></div>}
            {profile.email && <div><dt>{t("Email")}</dt><dd>{profile.email}</dd></div>}
          </dl>
        </>}
      </dialog>
    </div>
  );
}