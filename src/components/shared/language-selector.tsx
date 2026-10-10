"use client";

import { Languages } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import type { Locale } from "@/lib/translations";

export function LanguageSelector() {
  const { locale, setLocale, t } = useLocale();
  return (
    <label className="language-selector">
      <Languages aria-hidden="true" size={14} />
      <span className="sr-only">{t("navigation.language")}</span>
      <select aria-label={t("navigation.language")} onChange={(event) => setLocale(event.target.value as Locale)} value={locale}>
        <option value="it">IT</option>
        <option value="en">EN</option>
      </select>
    </label>
  );
}
