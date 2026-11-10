"use client";

import Link from "next/link";
import { BackIcon, NotFoundIcon, StationIcon } from "@/components/shared/icons";
import { useLocale } from "@/components/providers/locale-provider";
import { LanguageSelector } from "@/components/shared/language-selector";

export default function NotFound() {
  const { t } = useLocale();

  return (
    <main className="not-found-page">
      <LanguageSelector />
      <div className="not-found-grid" aria-hidden="true" />
      <section className="not-found-panel">
        <div className="not-found-mark">
          <NotFoundIcon size={34} strokeWidth={1.4} />
          <span>
            <StationIcon size={15} />
          </span>
        </div>
        <p className="not-found-code">404 · {t("errors.signal_lost")}</p>
        <h1>{t("errors.page_not_found")}</h1>
        <p>{t("errors.page_not_found_description")}</p>
        <Link className="not-found-action" href="/stations">
          <BackIcon size={16} />
          {t("errors.return_to_first_page")}
        </Link>
      </section>
    </main>
  );
}
