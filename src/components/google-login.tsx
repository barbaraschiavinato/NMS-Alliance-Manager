"use client";

import { signIn } from "next-auth/react";
import { Orbit } from "lucide-react";

export function GoogleLogin({ allianceName, allianceLogoUrl, missingConfiguration = [] }: Readonly<{ allianceName?: string; allianceLogoUrl?: string; missingConfiguration?: string[] }>) {
  const ready = missingConfiguration.length === 0;
  const displayAllianceName = allianceName?.trim() || "NMS ALLIANCE";
  const hasAllianceLogo = Boolean(allianceLogoUrl?.trim());
  return (
    <main className="login-screen">
      <div className="login-panel">
        <span aria-hidden="true" className={`login-mark${hasAllianceLogo ? " login-mark--custom" : ""}`} style={hasAllianceLogo ? { backgroundImage: `url("${allianceLogoUrl}")` } : undefined}>
          {!hasAllianceLogo && <Orbit size={28} />}
        </span>
        <span className="eyebrow login-eyebrow">{displayAllianceName}</span>
        <h1>Accedi alle operazioni<span>.</span></h1>
        <p>Entra con Google per visualizzare e coordinare le missioni dell’alleanza.</p>
        {ready ? <button className="google-login-button" onClick={() => signIn("google")} type="button"><GoogleMark /> Continua con Google</button> : <div className="auth-setup-note"><CircleSetupIcon /> Accesso da configurare nel progetto</div>}
        {!ready && <ul className="auth-config-list">{missingConfiguration.map((key) => <li key={key}>{key}</li>)}</ul>}
        <small>Account verificati · Accesso protetto</small>
      </div>
    </main>
  );
}

function CircleSetupIcon() {
  return <span aria-hidden="true" className="setup-marker">!</span>;
}

function GoogleMark() {
  return <svg aria-hidden="true" height="18" viewBox="0 0 48 48" width="18"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z"/><path fill="#34A853" d="M24 44c5.6 0 10.3-1.9 13.7-5.1L31 33.8c-1.9 1.3-4.2 2.1-7 2.1-5.4 0-10-3.7-11.6-8.6H5.5v5.3A20.7 20.7 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.4 27.3a12.4 12.4 0 0 1 0-7.9v-5.3H5.5a20.5 20.5 0 0 0 0 18.5l6.9-5.3Z"/><path fill="#EA4335" d="M24 10.8c3 0 5.7 1 7.8 3l5.9-5.8A19.8 19.8 0 0 0 24 2a20.7 20.7 0 0 0-18.5 12.1l6.9 5.3c1.6-4.9 6.2-8.6 11.6-8.6Z"/></svg>;
}