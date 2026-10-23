"use client";

import { useEffect } from "react";
import { Check, CircleAlert, X } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";

export function Toast({
  message,
  tone = "success",
  autoCloseMs,
  onClose,
}: Readonly<{ message: string; tone?: "success" | "error"; autoCloseMs?: number; onClose: () => void }>) {
  const { t } = useLocale();
  useEffect(() => {
    if (!autoCloseMs) return;
    const timer = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(timer);
  }, [autoCloseMs, message, onClose]);
  const Icon = tone === "error" ? CircleAlert : Check;
  const content = (
    <>
      <Icon aria-hidden="true" size={15} />
      <span>{t(message)}</span>
      <button aria-label={t("common.close_notification")} onClick={onClose} type="button">
        <X size={14} />
      </button>
    </>
  );
  return tone === "error" ? (
    <div className="toast toast-error" role="alert">
      {content}
    </div>
  ) : (
    <output aria-live="polite" className="toast">
      {content}
    </output>
  );
}
