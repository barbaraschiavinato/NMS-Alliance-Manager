"use client";

import { useEffect, useMemo, useState } from "react";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { listPageSize } from "@/lib/navigation/pagination";
import { FarmCard, type FarmEntry } from "@/components/cards/farm-card";
import { DetailSection } from "@/components/shared/detail-page";
import { useLocale } from "@/components/providers/locale-provider";
import type { DetailOrigin, SystemIdentity } from "@/lib/navigation/detail-links";

type LinkedFarmsState = Readonly<{ key: string; farms: FarmEntry[]; error: string }>;

// Read-only farms registered in the same system (any planet), shown in station and mission details.
export function LinkedFarms({
  system,
  currentMemberId,
  origin,
}: Readonly<{ system: SystemIdentity; currentMemberId: string; origin: DetailOrigin }>) {
  const { t } = useLocale();
  const systemKey = `${system.portal.toUpperCase()}:${system.galaxy}`;
  const [state, setState] = useState<LinkedFarmsState | null>(null);
  const sortedFarms = useMemo(
    () =>
      state?.key === systemKey
        ? [...state.farms].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        : [],
    [state, systemKey],
  );
  const pagination = usePagination(sortedFarms, listPageSize, systemKey);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ systemPortal: system.portal, galaxy: String(system.galaxy) });
    fetch(`/api/farms?${params}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { farms?: FarmEntry[]; error?: string };
        if (!response.ok || !Array.isArray(body.farms)) throw new Error(body.error ?? "farms.error_unable_to_read");
        if (active) setState({ key: systemKey, farms: body.farms, error: "" });
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            key: systemKey,
            farms: [],
            error: error instanceof Error ? error.message : "farms.error_unable_to_read",
          });
      });
    return () => {
      active = false;
    };
  }, [system.portal, system.galaxy, systemKey]);

  if (!state || state.key !== systemKey) return null;
  if (state.error)
    return (
      <DetailSection title="details.linked_farms">
        <p className="form-error">{t(state.error)}</p>
      </DetailSection>
    );
  if (state.farms.length === 0) return null;
  return (
    <DetailSection title="details.linked_farms">
      <ul className="farm-list farm-linked-list">
        {pagination.items.map((farm) => (
          <FarmCard currentMemberId={currentMemberId} detailOrigin={origin} farm={farm} hideStationLink key={farm.id} />
        ))}
      </ul>
      <Pagination {...pagination} />
    </DetailSection>
  );
}
