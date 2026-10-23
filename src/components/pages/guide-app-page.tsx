"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AdminPanel } from "@/components/modals/admin-panel";
import { MemberProfilePanel } from "@/components/modals/member-profile-panel";
import type { AllianceMember, AllianceSettings } from "@/lib/members/access-store";

export function GuideAppPage({
  children,
  currentMember,
  alliance,
  missionCount,
  stationCount,
  userCount,
  offlineCount,
}: Readonly<{
  children: ReactNode;
  currentMember: AllianceMember;
  alliance: AllianceSettings;
  missionCount: number;
  stationCount: number;
  userCount?: number;
  offlineCount?: number;
}>) {
  const [member, setMember] = useState(currentMember);
  const [settings, setSettings] = useState(alliance);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <div className={`app-shell${member.pulseEffectsEnabled === false ? " pulse-effects-disabled" : ""}`}>
      <Sidebar
        activeSection="guida"
        currentMember={member}
        missionCount={missionCount}
        settings={settings}
        stationCount={stationCount}
        offlineCount={offlineCount}
        userCount={userCount}
      />
      <section className="main-panel">
        <Header
          currentMember={member}
          onAdminOpen={() => setAdminOpen(true)}
          onProfileOpen={() => setProfileOpen(true)}
          onProfileSaved={(profile) => setMember((current) => ({ ...current, ...profile }))}
          sectionTitle="navigation.guide"
          settings={settings}
        />
        {children}
      </section>
      {adminOpen && member.role === "admin" && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setSettings} />}
      {profileOpen && (
        <MemberProfilePanel
          member={member}
          onClose={() => setProfileOpen(false)}
          onSaved={(profile) => setMember((current) => ({ ...current, ...profile }))}
        />
      )}
    </div>
  );
}
