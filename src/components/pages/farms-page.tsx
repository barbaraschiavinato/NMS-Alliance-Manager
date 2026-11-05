"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Search, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import type { AllianceMember, AllianceSettings } from "@/lib/members/member-types";
import { galaxyNames } from "@/lib/planets/galaxies";
import { plantResourceLabel, plantResourceSearchText } from "@/lib/planets/plant-products";
import { listPageSize } from "@/lib/navigation/pagination";
import { isFarmPlant, type FarmStationName } from "@/lib/farms/farms";
import { emptyPlanetFilterValues, PlanetActiveFilters } from "@/components/forms/planet-filters";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Hero, HeroAddButton } from "@/components/layout/hero";
import { Tabs } from "@/components/layout/tabs";
import { AdminPanel } from "@/components/modals/admin-panel";
import { MemberProfilePanel } from "@/components/modals/member-profile-panel";
import { FarmForm, type FarmFormValues } from "@/components/modals/farm-form";
import { FarmCard, type FarmEntry } from "@/components/cards/farm-card";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { Toast } from "@/components/shared/toast";
import { useNavigationSearchState } from "@/components/shared/navigation-search-reset";
import { useLocale } from "@/components/providers/locale-provider";
import { AlmanacCacheOnly } from "@/components/providers/almanac-cache-policy";
import { PlanetsPage } from "@/components/pages/planets-page";
import type { PlanetDestination } from "@/components/cards/planet-destination-card";
import { DetailBackLink, DetailSection, useDetailReturn } from "@/components/shared/detail-page";
import { StationsPage, type StationDetail } from "@/components/pages/stations-page";
import { detailOrigins, stationId, type DetailOrigin } from "@/lib/navigation/detail-links";

type FarmTab = "all" | "mine";
type FarmFilterValues = Readonly<{ plant: string; mineral: string }>;
const emptyFarmFilters: FarmFilterValues = { plant: "", mineral: "" };
type ToastState = Readonly<{ message: string; tone: "success" | "error" }>;
export type FarmDetail = Readonly<{
  id: string;
  origin: DetailOrigin;
  stationDetail?: StationDetail;
  planetDataUnavailable?: boolean;
  planet?: PlanetDestination;
}>;

async function farmRequest(
  method: string,
  body?: unknown,
  detailId?: string,
  samePlanet = false,
): Promise<FarmEntry[]> {
  const url = detailId
    ? `/api/farms?${new URLSearchParams({ detailFarm: detailId, ...(samePlanet ? { samePlanet: "1" } : {}) })}`
    : "/api/farms";
  const response = await fetch(url, {
    method,
    cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const payload = (await response.json().catch(() => ({}))) as { farms?: FarmEntry[]; error?: string };
  if (!response.ok || !Array.isArray(payload.farms)) throw new Error(payload.error ?? "errors.request_failed");
  return payload.farms;
}

export function FarmsPage({
  currentMember,
  alliance,
  missionCount,
  stationCount,
  stationNames,
  userCount,
  offlineCount,
  detail,
}: Readonly<{
  currentMember: AllianceMember;
  alliance: AllianceSettings;
  missionCount: number;
  stationCount: number;
  stationNames: readonly FarmStationName[];
  userCount?: number;
  offlineCount?: number;
  detail?: FarmDetail;
}>) {
  const router = useRouter();
  const returnDestination = useDetailReturn(detailOrigins[detail?.origin ?? "farms"].href);
  const detailId = detail?.id;
  const detailStationKey = detail?.stationDetail?.station ? stationId(detail.stationDetail.station) : "";
  const { t, tv } = useLocale();
  const [member, setMember] = useState(currentMember);
  const [settings, setSettings] = useState(alliance);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [farms, setFarms] = useState<FarmEntry[]>([]);
  const [members, setMembers] = useState<AllianceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FarmTab>("all");
  const [search, setSearch] = useNavigationSearchState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState(emptyFarmFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dialog, setDialog] = useState<{ farm: FarmEntry | null } | null>(null);
  const canChooseOwner = member.role === "admin" || member.role === "moderator";
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    let active = true;
    farmRequest("GET", undefined, detailId, detail?.origin === "planets")
      .then((entries) => {
        if (active) setFarms(entries);
      })
      .catch((error_: unknown) => {
        if (active)
          setToast({ message: error_ instanceof Error ? error_.message : "farms.error_unable_to_read", tone: "error" });
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
        console.error("Unable to load farm owners", error);
        setMembers([]);
        setToast({ message: "errors.unable_to_load_members", tone: "error" });
      });
  }, [canChooseOwner]);

  const ownFarms = useMemo(() => farms.filter((farm) => farm.ownerId === member.publicId), [farms, member.publicId]);
  const visibleFarms = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const source = (tab === "mine" ? ownFarms : farms).filter(
      (farm) =>
        (!filters.plant || farm.resources.some((resource) => resource === filters.plant)) &&
        (!filters.mineral || farm.resources.some((resource) => resource === filters.mineral)),
    );
    const filtered = query
      ? source.filter((farm) =>
          [
            farm.name,
            farm.systemName ?? "",
            farm.planetName,
            farm.portal,
            farm.ownerId === null ? t("farms.unassigned") : farm.ownerName,
            farm.coordinates ?? "",
            farm.note ?? "",
            galaxyNames[farm.galaxy],
            ...farm.resources.map((resource) => plantResourceSearchText(resource, tv)),
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query),
        )
      : source;
    return [...filtered].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [farms, filters, ownFarms, search, t, tab, tv]);
  const filterOptions = useMemo(() => {
    const resources = [...new Set(farms.flatMap((farm) => farm.resources))];
    return {
      plants: resources
        .filter((resource) => isFarmPlant(resource))
        .sort((left, right) => plantResourceLabel(left, tv).localeCompare(plantResourceLabel(right, tv))),
      minerals: resources
        .filter((resource) => !isFarmPlant(resource))
        .sort((left, right) => tv(left).localeCompare(tv(right))),
    };
  }, [farms, tv]);
  const hasActiveFilters = Boolean(filters.plant || filters.mineral);
  // Only the plant and mineral filters exist here, so they are the only keys that can change.
  const updateFilter = (key: string, value: unknown) => setFilters((current) => ({ ...current, [key]: String(value) }));
  const pagination = usePagination(visibleFarms, listPageSize, JSON.stringify([tab, search, filters]));
  const selectedFarm = detail ? farms.find((farm) => farm.id === detail.id) : undefined;
  // Arriving from a planet card shows every farm of that planet, the opened one first and the others newest first.
  const detailFarms = useMemo(() => {
    if (!selectedFarm) return [];
    if (detail?.origin !== "planets") return [selectedFarm];
    const others = farms
      .filter(
        (farm) =>
          farm.id !== selectedFarm.id &&
          farm.portal.toUpperCase() === selectedFarm.portal.toUpperCase() &&
          farm.galaxy === selectedFarm.galaxy,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return [selectedFarm, ...others];
  }, [detail?.origin, farms, selectedFarm]);
  const stationDetail = detail?.stationDetail;
  const showStationDetail = Boolean(
    selectedFarm &&
    stationDetail?.featuredPlanet?.planetPortal === selectedFarm.portal &&
    stationDetail.featuredPlanet.galaxy === selectedFarm.galaxy,
  );

  async function save(values: FarmFormValues) {
    const editing = dialog?.farm ?? null;
    const payload = {
      ...(editing ? { id: editing.id } : {}),
      name: values.name,
      portal: values.portal,
      galaxy: values.galaxy,
      systemName: values.systemName,
      planetName: values.planetName,
      resources: values.resources,
      coordinates: values.coordinates,
      note: values.note,
      ...(canChooseOwner ? { ownerId: values.ownerId || null } : {}),
    };
    setFarms(await farmRequest(editing ? "PATCH" : "POST", payload));
    if (!editing) window.dispatchEvent(new Event("farms-changed"));
    setDialog(null);
    setToast({ message: editing ? "farms.farm_updated" : "farms.farm_added", tone: "success" });
    if (detail) router.refresh();
  }

  async function remove(farm: FarmEntry) {
    if (!window.confirm(t("farms.delete_farm_confirm", { farm: farm.name }))) return;
    try {
      setFarms(await farmRequest("DELETE", { id: farm.id }));
      window.dispatchEvent(new Event("farms-changed"));
      if (detail?.id === farm.id) {
        router.replace(returnDestination);
        return;
      }
      setToast({ message: "farms.farm_deleted", tone: "success" });
    } catch (error_: unknown) {
      setToast({ message: error_ instanceof Error ? error_.message : "farms.error_unable_to_remove", tone: "error" });
    }
  }

  async function exportFarms() {
    setExporting(true);
    try {
      const response = await fetch("/api/farms/export", { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "farms.error_unable_to_export");
      }
      const blob = await response.blob();
      const filename =
        /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ??
        `farm-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error_: unknown) {
      setToast({ message: error_ instanceof Error ? error_.message : "farms.error_unable_to_export", tone: "error" });
    } finally {
      setExporting(false);
    }
  }

  const cards = (
    <ul className={`farm-list${detail ? " farm-detail-list" : ""}`}>
      {(detail ? detailFarms : pagination.items).map((farm) => (
        <FarmCard
          currentMemberId={member.publicId}
          farm={farm}
          detailOrigin={detail ? "planets" : undefined}
          hideDetailLink={Boolean(detail) && farm.id === detail?.id}
          key={farm.id}
          onEdit={(selected) => setDialog({ farm: selected })}
          onRemove={(selected) => void remove(selected)}
        />
      ))}
    </ul>
  );

  return (
    <div className={`app-shell${member.pulseEffectsEnabled === false ? " pulse-effects-disabled" : ""}`}>
      <Sidebar
        activeSection="farm"
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
          sectionTitle="farms.title"
          settings={settings}
        />
        {!detail && (
          <Hero settings={settings} subtitle={t("farms.description")} title="farms.title">
            <HeroAddButton label="farms.add_farm" onClick={() => setDialog({ farm: null })} />
          </Hero>
        )}
        <main className="content-wrap farms-page">
          {detail ? (
            <AlmanacCacheOnly>
              <DetailBackLink {...detailOrigins[detail.origin]} />
              <DetailSection title={detailFarms.length > 1 ? "details.farms_on_planet" : "details.farm"}>
                {loading ? (
                  <LoadingSpinner />
                ) : selectedFarm ? (
                  cards
                ) : (
                  <p className="form-error">{t("farms.error_unable_to_read")}</p>
                )}
              </DetailSection>
              {selectedFarm &&
                detail.planet?.planetPortal === selectedFarm.portal &&
                detail.planet.galaxy === selectedFarm.galaxy && (
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
                    alliance={settings}
                    currentMember={member}
                    detail={stationDetail}
                    initialStation={stationDetail.station}
                    key={`${detailStationKey}:${selectedFarm?.portal}`}
                    missionCount={missionCount}
                    sidebarStationCount={stationCount}
                  />
                </>
              )}
            </AlmanacCacheOnly>
          ) : (
            <section aria-label={t("farms.title")} className="station-list-section farm-list-section">
              <div className="toolbar members-toolbar station-toolbar sticky-list-controls">
                <Tabs
                  className="member-filter-tabs"
                  items={[
                    {
                      key: "all",
                      label: t("farms.filter_all"),
                      count: farms.length,
                      selected: tab === "all",
                      onSelect: () => setTab("all"),
                    },
                    {
                      key: "mine",
                      label: t("farms.my_farms"),
                      count: ownFarms.length,
                      selected: tab === "mine",
                      onSelect: () => setTab("mine"),
                    },
                  ]}
                  label={t("farms.filter_farms")}
                />
                <div className="toolbar-actions station-toolbar-actions">
                  <label className="search-field member-search station-search">
                    <Search size={15} />
                    <input
                      aria-label={t("farms.search_farms")}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={t("farms.search_farms")}
                      value={search}
                    />
                  </label>
                  <button
                    aria-controls="farm-filters-panel"
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
                  {canChooseOwner && (
                    <button
                      aria-label={t(exporting ? "farms.exporting" : "farms.export_to_excel")}
                      className="station-export-button"
                      data-tooltip={t(exporting ? "farms.exporting" : "farms.export_to_excel")}
                      disabled={exporting}
                      onClick={() => void exportFarms()}
                      title={t(exporting ? "farms.exporting" : "farms.export_to_excel")}
                      type="button"
                    >
                      <FileSpreadsheet aria-hidden="true" size={15} />
                    </button>
                  )}
                </div>
              </div>
              {filtersOpen && (
                <div className="planet-controls farm-controls" id="farm-filters-panel">
                  <label className="planet-filter">
                    <span>{t("common.plants")}</span>
                    <select
                      aria-label={t("planet.filter_plants")}
                      onChange={(event) => updateFilter("plant", event.target.value)}
                      value={filters.plant}
                    >
                      <option value="">{t("planet.all_plants")}</option>
                      {filterOptions.plants.map((value) => (
                        <option key={value} value={value}>
                          {plantResourceLabel(value, tv)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="planet-filter">
                    <span>{t("common.minerals")}</span>
                    <select
                      aria-label={t("planet.filter_minerals")}
                      onChange={(event) => updateFilter("mineral", event.target.value)}
                      value={filters.mineral}
                    >
                      <option value="">{t("planet.all_minerals")}</option>
                      {filterOptions.minerals.map((value) => (
                        <option key={value} value={value}>
                          {tv(value)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <PlanetActiveFilters
                onChange={updateFilter}
                onReset={() => setFilters(emptyFarmFilters)}
                values={{ ...emptyPlanetFilterValues, ...filters }}
              />
              {loading ? (
                <div className="station-list-empty station-list-loading">
                  <LoadingSpinner />
                </div>
              ) : visibleFarms.length === 0 ? (
                <p className="station-list-empty">
                  {t(
                    farms.length === 0
                      ? "farms.no_farms"
                      : hasActiveFilters && !search.trim()
                        ? "farms.no_farms_match_filters"
                        : "farms.no_farms_found",
                  )}
                </p>
              ) : (
                cards
              )}
              <Pagination {...pagination} />
            </section>
          )}
        </main>
      </section>
      {dialog && (
        <FarmForm
          canChooseOwner={canChooseOwner}
          currentMember={member}
          farm={dialog.farm}
          members={members}
          onClose={() => setDialog(null)}
          onSave={save}
          stationNames={stationNames}
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
