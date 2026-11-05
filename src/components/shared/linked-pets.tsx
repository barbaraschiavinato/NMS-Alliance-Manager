"use client";

import { useEffect, useMemo, useState } from "react";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { listPageSize } from "@/lib/navigation/pagination";
import { PetCard, type PetEntry } from "@/components/cards/pet-card";
import { DetailSection } from "@/components/shared/detail-page";
import { useLocale } from "@/components/providers/locale-provider";
import type { DetailOrigin, SystemIdentity } from "@/lib/navigation/detail-links";

type LinkedPetsState = Readonly<{ key: string; pets: PetEntry[]; error: string }>;

// Read-only pets found in the same system (any planet), shown in station and mission details.
export function LinkedPets({
  system,
  currentMemberId,
  origin,
}: Readonly<{ system: SystemIdentity; currentMemberId: string; origin: DetailOrigin }>) {
  const { t } = useLocale();
  const systemKey = `${system.portal.toUpperCase()}:${system.galaxy}`;
  const [state, setState] = useState<LinkedPetsState | null>(null);
  const sortedPets = useMemo(
    () =>
      state?.key === systemKey
        ? [...state.pets].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        : [],
    [state, systemKey],
  );
  const pagination = usePagination(sortedPets, listPageSize, systemKey);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ systemPortal: system.portal, galaxy: String(system.galaxy) });
    fetch(`/api/pets?${params}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { pets?: PetEntry[]; error?: string };
        if (!response.ok || !Array.isArray(body.pets)) throw new Error(body.error ?? "pets.error_unable_to_read");
        if (active) setState({ key: systemKey, pets: body.pets, error: "" });
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            key: systemKey,
            pets: [],
            error: error instanceof Error ? error.message : "pets.error_unable_to_read",
          });
      });
    return () => {
      active = false;
    };
  }, [system.portal, system.galaxy, systemKey]);

  if (!state || state.key !== systemKey) return null;
  if (state.error)
    return (
      <DetailSection title="details.linked_pets">
        <p className="form-error">{t(state.error)}</p>
      </DetailSection>
    );
  if (state.pets.length === 0) return null;
  return (
    <DetailSection title="details.linked_pets">
      <ul className="pet-list pet-linked-list">
        {pagination.items.map((pet) => (
          <PetCard currentMemberId={currentMemberId} detailOrigin={origin} hideStationLink key={pet.id} pet={pet} />
        ))}
      </ul>
      <Pagination {...pagination} />
    </DetailSection>
  );
}
