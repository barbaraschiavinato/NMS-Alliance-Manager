"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import type { AllianceMember, AllianceSettings } from "@/lib/members/member-types";
import { galaxyNames } from "@/lib/planets/galaxies";
import { listPageSize } from "@/lib/navigation/pagination";
import { detailOrigins, stationId, type DetailOrigin } from "@/lib/navigation/detail-links";
import { emptyPetFilters, hasActivePetFilters, petMatchesFilters, type PetFilterValues } from "@/lib/pets/pets";
import { PetActiveFilters, PetFilters } from "@/components/forms/pet-filters";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Hero, HeroAddButton } from "@/components/layout/hero";
import { Tabs } from "@/components/layout/tabs";
import { AdminPanel } from "@/components/modals/admin-panel";
import { MemberProfilePanel } from "@/components/modals/member-profile-panel";
import { PetForm, type PetFormValues } from "@/components/modals/pet-form";
import { PetMessageDialog } from "@/components/modals/pet-message-dialog";
import { PetCard, type PetEntry } from "@/components/cards/pet-card";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { Toast } from "@/components/shared/toast";
import { useNavigationSearchState } from "@/components/shared/navigation-search-reset";
import { useLocale } from "@/components/providers/locale-provider";
import { AlmanacCacheOnly } from "@/components/providers/almanac-cache-policy";
import { PlanetsPage } from "@/components/pages/planets-page";
import { StationsPage, type StationDetail } from "@/components/pages/stations-page";
import type { PlanetDestination } from "@/components/cards/planet-destination-card";
import { DetailBackLink, DetailSection, useDetailReturn } from "@/components/shared/detail-page";

type PetTab = "all" | "mine";
type ToastState = Readonly<{ message: string; tone: "success" | "error" }>;
export type PetDetail = Readonly<{
  id: string;
  origin: DetailOrigin;
  stationDetail?: StationDetail;
  planetDataUnavailable?: boolean;
  planet?: PlanetDestination;
}>;

async function petRequest(
  method: string,
  body?: unknown,
  image?: File | null,
  detailId?: string,
  samePlanet = false,
): Promise<PetEntry[]> {
  let init: RequestInit;
  if (method === "DELETE" || body === undefined) {
    init = body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  } else {
    const form = new FormData();
    form.set("payload", JSON.stringify(body));
    if (image) form.set("image", image);
    init = { body: form };
  }
  const url = detailId
    ? `/api/pets?${new URLSearchParams({ detailPet: detailId, ...(samePlanet ? { samePlanet: "1" } : {}) })}`
    : "/api/pets";
  const response = await fetch(url, { method, cache: "no-store", ...init });
  const payload = (await response.json().catch(() => ({}))) as { pets?: PetEntry[]; error?: string };
  if (!response.ok || !Array.isArray(payload.pets)) throw new Error(payload.error ?? "errors.request_failed");
  return payload.pets;
}

export function PetsPage({
  currentMember,
  alliance,
  missionCount,
  stationCount,
  userCount,
  offlineCount,
  detail,
}: Readonly<{
  currentMember: AllianceMember;
  alliance: AllianceSettings;
  missionCount: number;
  stationCount: number;
  userCount?: number;
  offlineCount?: number;
  detail?: PetDetail;
}>) {
  const router = useRouter();
  const returnDestination = useDetailReturn(detailOrigins[detail?.origin ?? "pets"].href);
  const detailId = detail?.id;
  const detailStationKey = detail?.stationDetail?.station ? stationId(detail.stationDetail.station) : "";
  const { t } = useLocale();
  const [member, setMember] = useState(currentMember);
  const [settings, setSettings] = useState(alliance);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pets, setPets] = useState<PetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PetTab>("all");
  const [search, setSearch] = useNavigationSearchState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [filters, setFilters] = useState<PetFilterValues>(emptyPetFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [members, setMembers] = useState<AllianceMember[]>([]);
  const [dialog, setDialog] = useState<{ pet: PetEntry | null } | null>(null);
  const [messagePet, setMessagePet] = useState<PetEntry | null>(null);
  const canChooseOwner = member.role === "admin" || member.role === "moderator";
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    let active = true;
    petRequest("GET", undefined, undefined, detailId, detail?.origin === "planets")
      .then((entries) => {
        if (active) setPets(entries);
      })
      .catch((error_: unknown) => {
        if (active)
          setToast({ message: error_ instanceof Error ? error_.message : "pets.error_unable_to_read", tone: "error" });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [detailId, detailStationKey, detail?.origin]);

  useEffect(() => {
    if (!canChooseOwner) return;
    fetch("/api/members", { cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok || !Array.isArray(body)) throw new Error("errors.unable_to_load_members");
        setMembers(body as AllianceMember[]);
      })
      .catch((error: unknown) => {
        console.error("Unable to load pet discoverers", error);
        setMembers([]);
        setToast({ message: "errors.unable_to_load_members", tone: "error" });
      });
  }, [canChooseOwner]);

  const ownPets = useMemo(() => pets.filter((pet) => pet.ownerId === member.publicId), [pets, member.publicId]);
  const visiblePets = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const source = (tab === "mine" ? ownPets : pets).filter((pet) => petMatchesFilters(pet, filters));
    const filtered = query
      ? source.filter((pet) =>
          [
            pet.name,
            pet.planetName,
            pet.portal,
            pet.ownerId === null ? t("pets.unassigned") : pet.ownerName,
            pet.coordinates ?? "",
            pet.note ?? "",
            galaxyNames[pet.galaxy],
            t(`pets.type_${pet.petType}`),
            t(`pets.activity_${pet.activity}`),
            t(`pets.habitat_${pet.habitat}`),
            t(`pets.rarity_${pet.rarity}`),
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query),
        )
      : source;
    return [...filtered].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [filters, ownPets, pets, search, t, tab]);
  const hasActiveFilters = hasActivePetFilters(filters);
  const updateFilter = (key: keyof PetFilterValues, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const pagination = usePagination(visiblePets, listPageSize, JSON.stringify([tab, search, filters]));

  const selectedPet = detail ? pets.find((pet) => pet.id === detail.id) : undefined;
  // Arriving from a planet card shows every pet of that planet, the opened one first and the others newest first.
  const detailPets = useMemo(() => {
    if (!selectedPet) return [];
    if (detail?.origin !== "planets") return [selectedPet];
    const others = pets
      .filter(
        (pet) =>
          pet.id !== selectedPet.id &&
          pet.portal.toUpperCase() === selectedPet.portal.toUpperCase() &&
          pet.galaxy === selectedPet.galaxy,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return [selectedPet, ...others];
  }, [detail?.origin, pets, selectedPet]);
  const stationDetail = detail?.stationDetail;
  const showStationDetail = Boolean(
    selectedPet &&
    stationDetail?.featuredPlanet?.planetPortal === selectedPet.portal &&
    stationDetail.featuredPlanet.galaxy === selectedPet.galaxy,
  );

  async function save(values: PetFormValues) {
    const editing = dialog?.pet ?? null;
    const { image, removeImage, ownerId, ...fields } = values;
    const payload = {
      ...(editing ? { id: editing.id } : {}),
      ...fields,
      ...(canChooseOwner ? { ownerId: ownerId || null } : {}),
      ...(removeImage ? { removeImage: true } : {}),
    };
    setPets(await petRequest(editing ? "PATCH" : "POST", payload, image));
    setDialog(null);
    setToast({ message: editing ? "pets.pet_updated" : "pets.pet_added", tone: "success" });
    if (detail) router.refresh();
  }

  async function remove(pet: PetEntry) {
    if (!window.confirm(t("pets.delete_pet_confirm", { pet: pet.name }))) return;
    try {
      setPets(await petRequest("DELETE", { id: pet.id }));
      if (detail?.id === pet.id) {
        router.replace(returnDestination);
        return;
      }
      setToast({ message: "pets.pet_deleted", tone: "success" });
    } catch (error_: unknown) {
      setToast({ message: error_ instanceof Error ? error_.message : "pets.error_unable_to_remove", tone: "error" });
    }
  }

  return (
    <div className={`app-shell${member.pulseEffectsEnabled === false ? " pulse-effects-disabled" : ""}`}>
      <Sidebar
        activeSection="pet"
        currentMember={member}
        missionCount={missionCount}
        settings={settings}
        stationCount={stationCount}
        offlineCount={offlineCount}
        userCount={userCount}
      />
      <section className="main-panel">
        <Header
          currentMember={member}
          onAdminOpen={() => setAdminOpen(true)}
          onProfileOpen={() => setProfileOpen(true)}
          onProfileSaved={(profile) => setMember((current) => ({ ...current, ...profile }))}
          sectionTitle="pets.title"
          settings={settings}
        />
        {!detail && (
          <Hero settings={settings} subtitle={t("pets.description")} title="pets.title">
            <HeroAddButton label="pets.add_pet" onClick={() => setDialog({ pet: null })} />
          </Hero>
        )}
        <main className="content-wrap pets-page">
          {detail ? (
            <AlmanacCacheOnly>
              <DetailBackLink {...detailOrigins[detail.origin]} />
              <DetailSection title={detailPets.length > 1 ? "details.pets_on_planet" : "details.pet"}>
                {loading ? (
                  <LoadingSpinner />
                ) : selectedPet ? (
                  <ul className="pet-list pet-detail-list">
                    {detailPets.map((pet) => (
                      <PetCard
                        currentMemberId={member.publicId}
                        detailOrigin="planets"
                        hideDetailLink={pet.id === detail.id}
                        key={pet.id}
                        onEdit={(selected) => setDialog({ pet: selected })}
                        onMessageOwner={setMessagePet}
                        onRemove={(selected) => void remove(selected)}
                        pet={pet}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="form-error">{t("pets.error_unable_to_read")}</p>
                )}
              </DetailSection>
              {selectedPet &&
                detail.planet?.planetPortal === selectedPet.portal &&
                detail.planet.galaxy === selectedPet.galaxy && (
                  <PlanetsPage
                    embedded
                    featuredOnly
                    alliance={settings}
                    currentMember={member}
                    planets={[]}
                    featuredPlanet={detail.planet}
                    almanacLookupFailed={false}
                    missionCount={missionCount}
                    stationCount={stationCount}
                  />
                )}
              {showStationDetail && stationDetail && (
                <>
                  {detail.planetDataUnavailable && (
                    <p className="form-error" role="status">
                      {t("farms.planet_data_unavailable")}
                    </p>
                  )}
                  <StationsPage
                    embedded
                    embeddedOrigin="pets"
                    alliance={settings}
                    currentMember={member}
                    detail={stationDetail}
                    initialStation={stationDetail.station}
                    key={`${detailStationKey}:${selectedPet?.portal}`}
                    missionCount={missionCount}
                    sidebarStationCount={stationCount}
                  />
                </>
              )}
            </AlmanacCacheOnly>
          ) : (
            <section aria-label={t("pets.title")} className="station-list-section pet-list-section">
              <div className="toolbar members-toolbar station-toolbar sticky-list-controls">
                <Tabs
                  className="member-filter-tabs"
                  items={[
                    {
                      key: "all",
                      label: t("pets.filter_all"),
                      count: pets.length,
                      selected: tab === "all",
                      onSelect: () => setTab("all"),
                    },
                    {
                      key: "mine",
                      label: t("pets.my_pets"),
                      count: ownPets.length,
                      selected: tab === "mine",
                      onSelect: () => setTab("mine"),
                    },
                  ]}
                  label={t("pets.filter_pets")}
                />
                <div className="toolbar-actions station-toolbar-actions">
                  <label className="search-field member-search station-search">
                    <Search size={15} />
                    <input
                      aria-label={t("pets.search_pets")}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={t("pets.search_pets")}
                      value={search}
                    />
                  </label>
                  <button
                    aria-controls="pet-filters-panel"
                    aria-expanded={filtersOpen}
                    aria-label={t("planet.filters")}
                    className="planet-filters-toggle"
                    data-active={hasActiveFilters || undefined}
                    data-tooltip={t("planet.filters")}
                    onClick={() => setFiltersOpen((open) => !open)}
                    type="button"
                  >
                    <SlidersHorizontal aria-hidden="true" size={14} />
                  </button>
                </div>
              </div>
              {filtersOpen && <PetFilters onChange={updateFilter} values={filters} />}
              <PetActiveFilters onChange={updateFilter} onReset={() => setFilters(emptyPetFilters)} values={filters} />
              {loading ? (
                <div className="station-list-empty station-list-loading">
                  <LoadingSpinner />
                </div>
              ) : visiblePets.length === 0 ? (
                <p className="station-list-empty">
                  {t(
                    pets.length === 0
                      ? "pets.no_pets"
                      : hasActiveFilters && !search.trim()
                        ? "pets.no_pets_match_filters"
                        : "pets.no_pets_found",
                  )}
                </p>
              ) : (
                <ul className="pet-list">
                  {pagination.items.map((pet) => (
                    <PetCard
                      currentMemberId={member.publicId}
                      key={pet.id}
                      onEdit={(selected) => setDialog({ pet: selected })}
                      onMessageOwner={setMessagePet}
                      onRemove={(selected) => void remove(selected)}
                      pet={pet}
                    />
                  ))}
                </ul>
              )}
              <Pagination {...pagination} />
            </section>
          )}
        </main>
      </section>
      {dialog && (
        <PetForm
          canChooseOwner={canChooseOwner}
          currentMember={member}
          members={members}
          onClose={() => setDialog(null)}
          onSave={save}
          pet={dialog.pet}
        />
      )}
      {messagePet && (
        <PetMessageDialog
          onClose={() => setMessagePet(null)}
          onSent={() => {
            setMessagePet(null);
            setToast({ message: "profile.message_sent", tone: "success" });
          }}
          pet={messagePet}
        />
      )}
      {toast && (
        <Toast
          autoCloseMs={toast.tone === "success" ? 5000 : undefined}
          message={toast.message}
          onClose={dismissToast}
          tone={toast.tone}
        />
      )}
      {adminOpen && member.role === "admin" && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setSettings} />}
      {profileOpen && (
        <MemberProfilePanel
          member={member}
          onClose={() => setProfileOpen(false)}
          onSaved={(profile) => setMember((current) => ({ ...current, ...profile }))}
        />
      )}
    </div>
  );
}
