"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";

export function usePagination<T>(items: readonly T[], pageSize: number, resetKey: string) {
  const [selection, setSelection] = useState({ key: resetKey, page: 1 });
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = selection.key === resetKey ? Math.min(selection.page, pageCount) : 1;
  if (selection.key !== resetKey || selection.page !== page) {
    setSelection({ key: resetKey, page });
  }
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageCount,
    onPageChange: (next: number) => setSelection({ key: resetKey, page: next }),
  };
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
}: Readonly<{ page: number; pageCount: number; onPageChange: (page: number) => void }>) {
  const { t } = useLocale();
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={t("common.pagination")} className="list-pagination">
      <button className="pagination-button" disabled={page === 1} onClick={() => onPageChange(page - 1)} type="button">
        <ChevronLeft aria-hidden="true" size={16} />
        {t("common.previous_page")}
      </button>
      <span aria-live="polite">{t("common.page_of_total", { page, total: pageCount })}</span>
      <button
        className="pagination-button"
        disabled={page === pageCount}
        onClick={() => onPageChange(page + 1)}
        type="button"
      >
        {t("common.next_page")}
        <ChevronRight aria-hidden="true" size={16} />
      </button>
    </nav>
  );
}
