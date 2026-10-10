"use client";

import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

import { useLocale } from "@/components/providers/locale-provider";
import { LoadingSpinner } from "@/components/shared/loading-spinner";

export function MessageList({ loading, error, empty, emptyLabel, children }: Readonly<{
  loading: boolean;
  error: string;
  empty: boolean;
  emptyLabel: string;
  children: ReactNode;
}>) {
  const { t } = useLocale();

  return <>
    {error && <p className="form-error"><CircleAlert size={15} />{t(error)}</p>}
    {loading && <div className="messages-loading"><LoadingSpinner /></div>}
    {!loading && !error && empty && <p className="messages-empty">{emptyLabel}</p>}
    {!loading && !empty && <ul className="messages-list">{children}</ul>}
  </>;
}
