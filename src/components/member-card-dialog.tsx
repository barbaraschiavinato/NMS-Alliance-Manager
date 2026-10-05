"use client";

import { useEffect, useState } from "react";
import { CircleAlert, X } from "lucide-react";
import type { MemberRole, MemberSpecialty, NmsPlatform } from "@/lib/member-types";

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
  builder: "Costruttore",
  ranger: "Ranger",
  explorer: "Esploratore",
};

const roleLabels: Record<MemberRole, string> = {
  user: "Utente",
  moderator: "Moderatore",
  admin: "Admin",
};

export function MemberCardDialog({ email, onClose }: Readonly<{ email: string; onClose: () => void }>) {
  const [profile, setProfile] = useState<MemberCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/members?email=${encodeURIComponent(email)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Impossibile caricare il profilo.");
        setProfile(body as MemberCard);
      })
      .catch((error_: unknown) => {
        if (!controller.signal.aborted) setError(error_ instanceof Error ? error_.message : "Impossibile caricare il profilo.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [email]);

  return (
    <div className="dialog-backdrop">
      <dialog aria-labelledby="member-card-title" aria-modal="true" className="mission-dialog member-card-dialog" open>
        <div className="dialog-heading">
          <div><span className="eyebrow">SCHEDA MEMBRO</span><h2 id="member-card-title">Profilo NMS</h2></div>
          <button aria-label="Chiudi" className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        {loading && <p>Caricamento profilo…</p>}
        {error && <p className="form-error"><CircleAlert size={15} />{error}</p>}
        {profile && <>
          <div className="profile-identity">
            <span className="profile-google-avatar">{profile.image ? <span style={{ backgroundImage: `url("${profile.image}")` }} /> : (profile.nmsName || profile.name).slice(0, 1).toUpperCase()}</span>
            <span><strong>{profile.nmsName || profile.name}</strong><small>{profile.nmsName ? profile.name : "Membro dell’alleanza"}</small></span>
          </div>
          <dl className="member-card-details">
            <div><dt>Specializzazione</dt><dd>{profile.specialty ? specialtyLabels[profile.specialty] : "Non indicata"}</dd></div>
            <div><dt>Piattaforme</dt><dd>{profile.platforms.length ? profile.platforms.join(", ") : "Non indicate"}</dd></div>
            {profile.nmsCode && <div><dt>Codice amico NMS</dt><dd>{profile.nmsCode}</dd></div>}
            {profile.role && <div><dt>Ruolo</dt><dd>{roleLabels[profile.role]}</dd></div>}
            {profile.email && <div><dt>Email</dt><dd>{profile.email}</dd></div>}
          </dl>
        </>}
      </dialog>
    </div>
  );
}