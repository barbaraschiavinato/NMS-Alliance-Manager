import { useEffect } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import {
  CirclePlus,
  Crosshair,
  Orbit,
  Settings2,
  LogOut,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { Mission } from "@/lib/missions";
import type { MissionFilter } from "@/components/mission-table";
import type { AllianceMember, AllianceSettings } from "@/lib/access-store";

export function AllianceSidebar({ missionCount, currentMember, settings, activeSection }: Readonly<{
  missionCount: number;
  currentMember: AllianceMember;
  settings: AllianceSettings;
  activeSection: "missioni" | "utenti" | "stazioni";
}>) {
  const displayName = currentMember.nmsName || currentMember.name;
  let roleLabel = "Utente";
  if (currentMember.role === "admin") roleLabel = "Amministratore";
  else if (currentMember.role === "moderator") roleLabel = "Moderatore";
  return (
    <aside className="sidebar">
      <a className="brand" href="#missioni">
        <span className="brand-mark" style={settings.logoUrl ? { backgroundImage: `url("${settings.logoUrl}")` } : undefined}>{!settings.logoUrl && <Orbit size={21} strokeWidth={1.8} />}</span>
        <span><strong>{settings.name}</strong></span>
      </a>
      <span className="nav-caption">GESTIONE</span>
      <nav className="side-nav" aria-label="Navigazione principale">
        <Link className={`nav-item ${activeSection === "missioni" ? "active" : ""}`} href="/"><Crosshair size={17} /><span>Missioni</span><span className="nav-count">{missionCount}</span></Link>
        <Link className={`nav-item ${activeSection === "stazioni" ? "active" : ""}`} href="/stazioni"><Orbit size={17} /><span>Stazioni</span></Link>
        {(currentMember.role === "admin" || currentMember.role === "moderator") && <Link className={`nav-item ${activeSection === "utenti" ? "active" : ""}`} href="/utenti"><UsersRound size={17} /><span>Utenti</span></Link>}
      </nav>
      <div className="sidebar-bottom">
        <div className="profile"><span className="avatar">{displayName.slice(0, 2).toUpperCase()}</span><span><strong>{displayName}</strong><small>{roleLabel}</small></span></div>
      </div>
    </aside>
  );
}

export function DashboardTopbar({ currentMember, settings, sectionTitle = "Missioni", onAdminOpen, onProfileOpen }: Readonly<{
  currentMember: AllianceMember;
  settings: AllianceSettings;
  sectionTitle?: string;
  onAdminOpen?: () => void;
  onProfileOpen?: () => void;
}>) {
  useEffect(() => {
    document.title = settings.name.trim() || "NMS Alliance Manager";
    if (!settings.logoUrl) return;

    let icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.append(icon);
    }
    icon.href = settings.logoUrl;
    icon.removeAttribute("type");
    icon.removeAttribute("sizes");
  }, [settings.logoUrl, settings.name]);

  let roleLabel = "Utente";
  if (currentMember.role === "admin") roleLabel = "Admin";
  else if (currentMember.role === "moderator") roleLabel = "Moderatore";
  return (
    <header className="topbar">
      <div className="breadcrumb"><span>OPERAZIONI</span><span className="breadcrumb-slash">/</span><strong>{sectionTitle}</strong></div>
      <div className="topbar-tools">
        <span className="account-label">{currentMember.nmsName || currentMember.name} · {roleLabel}</span>
        {onProfileOpen && <button aria-label="Il mio profilo" className="square-button" onClick={onProfileOpen} title="Il mio profilo" type="button"><UserRound size={16} /></button>}
        {currentMember.role === "admin" && onAdminOpen && <button aria-label="Gestione alleanza" className="square-button" onClick={onAdminOpen} title="Gestione alleanza" type="button"><Settings2 size={16} /></button>}
        {currentMember.role === "moderator" && <Link aria-label="Gestione utenti" className="square-button" href="/utenti" title="Gestione utenti"><UsersRound size={16} /></Link>}
        <button aria-label="Esci" className="square-button" onClick={() => signOut({ callbackUrl: "/" })} title="Esci" type="button"><LogOut size={16} /></button>
        <span className="top-avatar">
          {currentMember.image
            ? <span style={{ backgroundImage: `url("${currentMember.image}")` }} />
            : (currentMember.nmsName || currentMember.name).slice(0, 2).toUpperCase()}
        </span>
      </div>
    </header>
  );
}

export function MissionHero({ onCreate, showCreate, settings }: Readonly<{ onCreate: () => void; showCreate: boolean; settings: AllianceSettings }>) {
  return (
    <section className="mission-banner" id="riepilogo" style={settings.bannerUrl ? { backgroundImage: `linear-gradient(90deg, #294c3fe8 0%, #385c49c9 56%, #1f483b80 100%), url("${settings.bannerUrl}")` } : undefined}>
      <div className="banner-grid" aria-hidden="true" />
      <div className="banner-copy">
        <span className="eyebrow"><span className="live-dot" /> CENTRO OPERATIVO <span className="banner-coord">45.08° · 12.61°</span></span>
        <h1>Registro missioni<span>.</span></h1>
        <p>Coordina la prossima frontiera, una spedizione alla volta.</p>
      </div>
      <div className="banner-orbit" aria-hidden="true"><span className="orbit-ring ring-one" /><span className="orbit-ring ring-two" /><span className="orbit-core"><Orbit size={33} /></span><span className="orbit-pin" /></div>
      {showCreate && <button className="banner-add" onClick={onCreate} type="button"><CirclePlus size={17} /> Nuova missione</button>}
    </section>
  );
}

export function MissionMetrics({ missions, counts }: Readonly<{
  missions: Mission[];
  counts: Record<MissionFilter, number>;
}>) {
  const highPriorityCount = missions.filter((mission) =>
    mission.status !== "Completata" && (mission.priority === "Urgente" || mission.priority === "Alta"),
  ).length;
  const completedShare = missions.length > 0 ? Math.round((counts.Completata / missions.length) * 100) : 0;

  return (
    <section aria-label="Riepilogo missioni" className="metrics-row">
      <div className="metric"><span className="metric-label">MISSIONI ATTIVE</span><strong>{counts["In corso"]}<small> / {missions.length}</small></strong><span className="metric-foot"><span className="metric-marker marker-green" />{counts["In attesa"]} in attesa</span></div>
      <div className="metric"><span className="metric-label">COMPLETATE</span><strong>{counts.Completata}</strong><span className="metric-foot"><span className="metric-marker marker-coral" />{completedShare}% del totale</span></div>
      <div className="metric"><span className="metric-label">PRIORITÀ ALTA / URGENTE</span><strong>{highPriorityCount}</strong><span className="metric-foot"><span className="metric-marker marker-yellow" />Richiedono attenzione</span></div>
      <div className="metric"><span className="metric-label">DA ASSEGNARE</span><strong>{counts["Attesa non assegnate"]}</strong><span className="metric-foot"><span className="metric-marker marker-coral" />In attesa senza assegnatario</span></div>
    </section>
  );
}

export function DashboardFooter() {
  return <footer className="app-footer"><span><Orbit size={14} /> NMS ALLIANCE NETWORK</span><span>SETTORE EUCLIDE <span className="footer-separator">/</span> CANALE SICURO</span></footer>;
}
