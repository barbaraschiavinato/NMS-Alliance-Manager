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
      <button
        aria-label={t("common.previous_page")}
        className="pagination-button"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
        type="button"
      >
        <ChevronLeft aria-hidden="true" size={16} />
        <span aria-hidden="true" className="pagination-label">
          {t("common.previous_page")}
        </span>
      </button>
      <span aria-live="polite" className="pagination-status">
        {t("common.page_of_total", { page, total: pageCount })}
      </span>
      <button
        aria-label={t("common.next_page")}
        className="pagination-button"
        disabled={page === pageCount}
        onClick={() => onPageChange(page + 1)}
        type="button"
      >
        <span aria-hidden="true" className="pagination-label">
          {t("common.next_page")}
        </span>
        <ChevronRight aria-hidden="true" size={16} />
      </button>
    </nav>
  );
}
