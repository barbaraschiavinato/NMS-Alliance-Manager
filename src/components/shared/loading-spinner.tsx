"use client";

import { Orbit } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";

export function LoadingSpinner() {
  const { t } = useLocale();
  return (
    <div aria-label={t("common.loading")} aria-live="polite" className="loading-indicator" role="status">
      <Orbit aria-hidden="true" className="loading-spinner" size={36} />
    </div>
  );
}
