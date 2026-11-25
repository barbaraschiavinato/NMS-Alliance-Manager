"use client";

import { useState } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { AllianceLogoIcon, GoogleIcon } from "@/components/shared/icons";
import { useLocale } from "@/components/providers/locale-provider";
import { LanguageSelector } from "@/components/shared/language-selector";
import type { LocalAccountOption } from "@/lib/auth/local-auth";

export function GoogleLogin({
  allianceName,
  allianceLogoUrl,
  missingConfiguration = [],
  localAccounts,
}: Readonly<{
  allianceName?: string;
  allianceLogoUrl?: string;
  missingConfiguration?: string[];
  localAccounts?: LocalAccountOption[];
}>) {
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const { t } = useLocale();
  const ready = missingConfiguration.length === 0;
  const localMode = Boolean(localAccounts?.length);
  const displayAllianceName = allianceName?.trim() || "NMS ALLIANCE";
  const hasAllianceLogo = Boolean(allianceLogoUrl?.trim()) && !logoLoadFailed;
  return (
    <main className="login-screen">
      <div className="login-panel">
        <LanguageSelector />
        <span aria-hidden="true" className={`login-mark${hasAllianceLogo ? " login-mark--custom" : ""}`}>
          {hasAllianceLogo && (
            <Image
              alt=""
              height={52}
              onError={() => setLogoLoadFailed(true)}
              src="/api/alliance/login-logo"
              unoptimized
              width={52}
            />
          )}
          {!hasAllianceLogo && <AllianceLogoIcon size={28} />}
        </span>
        <span className="eyebrow login-eyebrow">{displayAllianceName}</span>
        <h1>
          {t("auth.sign_in_to_operations")}
          <span>.</span>
        </h1>
        <p>{t("auth.sign_in_with_google_to_view_and_coordinate_alliance_missions")}</p>
        {localMode && (
          <div className="local-login">
            <span className="local-login-note">{t("auth.local_development_accounts")}</span>
            {localAccounts?.map((account) => (
              <button
                className="google-login-button"
                data-testid={`local-login-${account.email}`}
                key={account.email}
                onClick={() => signIn("local", { email: account.email })}
                type="button"
              >
                {account.label}
              </button>
            ))}
          </div>
        )}
        {!localMode &&
          (ready ? (
            <button className="google-login-button" onClick={() => signIn("google")} type="button">
              <GoogleIcon /> {t("auth.continue_with_google")}
            </button>
          ) : (
            <div className="auth-setup-note">
              <CircleSetupIcon /> {t("common.sign_in_needs_to_be_configured_for_this_project")}
            </div>
          ))}
        {!ready && (
          <ul className="auth-config-list">
            {missingConfiguration.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
        )}
        <small>{t("auth.verified_accounts_secure_access")}</small>
      </div>
    </main>
  );
}

function CircleSetupIcon() {
  return (
    <span aria-hidden="true" className="setup-marker">
      !
    </span>
  );
}
