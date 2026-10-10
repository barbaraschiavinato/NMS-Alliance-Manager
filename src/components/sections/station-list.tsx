"use client";

import { Tabs } from "@/components/layout/tabs";
import { StationCard } from "@/components/cards/station-card";
import type { StationEntry, StationFilter } from "@/components/cards/station-card/parts";

import { FileSpreadsheet, Search } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { type MemberMessageContext } from "@/components/modals/member-card-dialog";
import type { AllianceMember } from "@/lib/access-store";
import { type MissionSystemStatus, type PlanetSystemStatuses } from "@/lib/planet-system-status";
import { useLocale } from "@/components/providers/locale-provider";

export function StationList({ stations, visibleStations, loading, member, canSeeAll, canCreateMissions, canChooseStationView, renderedAt, activeStationTab, onTabChange, stationFilter, onFilterChange, stationCounts, visibleStationFilters, ownStationCount, search, onSearchChange, exportingStations, onExport, planetStatuses, planetStatusesLoaded, savingStatusKeys, onToggleStatus, onOpenStation, onOpenProfile, onCreateMission, onEdit, onRemove, onViewNote }: Readonly<{
  stations: StationEntry[];
  visibleStations: StationEntry[];
  loading: boolean;
  member: AllianceMember;
  canSeeAll: boolean;
  canCreateMissions: boolean;
  canChooseStationView: boolean;
  renderedAt: number;
  activeStationTab: "all" | "mine";
  onTabChange: (tab: "all" | "mine") => void;
  stationFilter: StationFilter;
  onFilterChange: (filter: StationFilter) => void;
  stationCounts: Record<StationFilter, number>;
  visibleStationFilters: StationFilter[];
  ownStationCount: number;
  search: string;
  onSearchChange: (search: string) => void;
  exportingStations: boolean;
  onExport: () => void;
  planetStatuses: PlanetSystemStatuses;
  planetStatusesLoaded: boolean;
  savingStatusKeys: string[];
  onToggleStatus: (station: StationEntry, status: MissionSystemStatus, checked: boolean) => void;
  onOpenStation: (station: StationEntry) => void;
  onOpenProfile: (target: { memberId: string; messageContext: MemberMessageContext }) => void;
  onCreateMission: (station: StationEntry) => void;
  onEdit: (station: StationEntry) => void;
  onRemove: (station: StationEntry) => void;
  onViewNote: (station: StationEntry) => void;
}>) {
  const { t } = useLocale();
  return (
          <section aria-label={t("stations.my_space_stations")} className="station-list-section">
            <div className="toolbar members-toolbar station-toolbar">
                <Tabs className="member-filter-tabs" items={[
                  { key: "all", label: t("stations.filter_all"), count: stationCounts.all, selected: activeStationTab === "all" && stationFilter === "all", onSelect: () => { onTabChange("all"); onFilterChange("all"); } },
                  ...(canChooseStationView ? [{ key: "mine", label: t("stations.my_stations"), count: ownStationCount, selected: activeStationTab === "mine", onSelect: () => onTabChange("mine") }] : []),
                  ...visibleStationFilters.filter((status) => status !== "all").map((status) => ({
                    key: status,
                    label: t(status === "pending" ? "common.pending_status_label" : status === "in_progress" ? "stations.filter_in_mission" : status === "completed" ? "stations.filter_mission_completed" : "stations.filter_with_notes"),
                    count: stationCounts[status],
                    selected: activeStationTab === "all" && stationFilter === status,
                    onSelect: () => { onTabChange("all"); onFilterChange(status); },
                  })),
                ]} label={t("stations.filter_stations_by_mission_status")} />
                {<div className="toolbar-actions station-toolbar-actions">
                  <label className="search-field member-search station-search"><Search size={15} /><input aria-label={t("stations.search_stations_by_portal_owner_or_galaxy_or_notes")} onChange={(event) => onSearchChange(event.target.value)} placeholder={t("stations.search_portal_username_galaxy_or_notes")} value={search} /></label>
                  {canSeeAll && <button
                    aria-label={t(exportingStations ? "stations.exporting_stations" : "stations.export_stations_to_excel")}
                    className="station-export-button"
                    data-tooltip={t(exportingStations ? "stations.exporting_stations" : "stations.export_stations_to_excel")}
                    disabled={exportingStations}
                    onClick={onExport}
                    title={t(exportingStations ? "stations.exporting_stations" : "stations.export_stations_to_excel")}
                    type="button"
                  ><FileSpreadsheet aria-hidden="true" size={15} /></button>}
                </div>}
            </div>
            {loading && <div className="station-list-empty station-list-loading"><LoadingSpinner /></div>}
            {!loading && visibleStations.length === 0 && <p className={`station-list-empty${stations.length === 0 ? " station-list-empty-no-saved" : ""}`}>{t(stations.length === 0 ? "stations.no_saved_portals" : "stations.no_stations_found")}</p>}
            {visibleStations.length > 0 && <ul className="station-list station-list-cards">{visibleStations.map((station) => <StationCard
              canCreateMissions={canCreateMissions}
              canSeeAll={canSeeAll}
              key={`${station.portal}:${station.galaxy}:${station.ownerId}`}
              member={member}
              onCreateMission={onCreateMission}
              onEdit={onEdit}
              onOpenProfile={onOpenProfile}
              onOpenStation={onOpenStation}
              onRemove={onRemove}
              onToggleStatus={onToggleStatus}
              onViewNote={onViewNote}
              planetStatuses={planetStatuses}
              planetStatusesLoaded={planetStatusesLoaded}
              renderedAt={renderedAt}
              savingStatusKeys={savingStatusKeys}
              station={station}
            />)}</ul>}
          </section>
  );
}
