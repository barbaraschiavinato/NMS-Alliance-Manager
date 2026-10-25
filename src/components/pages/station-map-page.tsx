"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Minus, Plus, Scan, X } from "lucide-react";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Hero } from "@/components/layout/hero";
import { AdminPanel } from "@/components/modals/admin-panel";
import { MemberProfilePanel } from "@/components/modals/member-profile-panel";
import { useLocale } from "@/components/providers/locale-provider";
import { DetailLink } from "@/components/shared/detail-page";
import type { AllianceMember, AllianceSettings } from "@/lib/members/access-store";
import { stationDetailHref } from "@/lib/navigation/detail-links";
import { galaxyLabel } from "@/lib/planets/galaxies";
import {
  fullMapView,
  galaxyExtent,
  panMapView,
  euclidGalaxy,
  stationMapGalaxies,
  stationMapMarkerKind,
  stationMapMarkers,
  stationMapRegionKey,
  zoomMapView,
  type StationMapMarker,
  type StationMapMarkerKind,
  type StationMapStation,
  type StationMapView,
} from "@/lib/stations/station-map";

const zoomStep = 1.6;
const dragThresholdPx = 4;
const fallbackMapPx = 800;
const guideRings = [512, 1024, 1536, 2048];
const markerOrder: Record<StationMapMarkerKind | "highlight", number> = {
  other: 0,
  mine: 1,
  available: 2,
  hub: 3,
  highlight: 4,
};
const legendKinds: readonly (StationMapMarkerKind | "highlight")[] = ["highlight", "hub", "available", "mine", "other"];

export function StationMapPage({
  currentMember,
  alliance,
  stations,
  highlight,
  missionCount,
  stationCount,
  userCount,
  offlineCount,
}: Readonly<{
  currentMember: AllianceMember;
  alliance: AllianceSettings;
  stations: readonly StationMapStation[];
  highlight?: Readonly<{ portal: string; galaxy: number }>;
  missionCount: number;
  stationCount: number;
  userCount?: number;
  offlineCount?: number;
}>) {
  const { t } = useLocale();
  const [member, setMember] = useState(currentMember);
  const [settings, setSettings] = useState(alliance);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const hub = useMemo(
    () =>
      /^[0-9A-F]{12}$/i.test(settings.portalCode) ? { portal: settings.portalCode, galaxy: settings.galaxy } : null,
    [settings.portalCode, settings.galaxy],
  );
  const galaxies = useMemo(() => stationMapGalaxies(stations), [stations]);
  const [galaxy, setGalaxy] = useState(
    highlight && galaxies.includes(highlight.galaxy) ? highlight.galaxy : euclidGalaxy,
  );
  const highlightKey = highlight && highlight.galaxy === galaxy ? stationMapRegionKey(highlight.portal) : null;
  const { markers: placedMarkers, hidden } = useMemo(() => stationMapMarkers(stations, galaxy), [stations, galaxy]);
  // Painted last means on top: the hub and the member's own stations stay visible over the others.
  const markers = useMemo(
    () =>
      placedMarkers
        .map((marker) => ({
          marker,
          kind:
            marker.key === highlightKey ? ("highlight" as const) : stationMapMarkerKind(marker, member.publicId, hub),
        }))
        .sort((a, b) => markerOrder[a.kind] - markerOrder[b.kind]),
    [placedMarkers, member.publicId, hub, highlightKey],
  );
  const [view, setView] = useState<StationMapView>(fullMapView);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = placedMarkers.find((marker) => marker.key === selectedKey) ?? null;
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);

  function pixelSize() {
    return svgRef.current?.getBoundingClientRect().width || fallbackMapPx;
  }

  // React registers wheel listeners as passive, so the page-scroll guard needs a native listener.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const rect = svg!.getBoundingClientRect();
      const width = rect.width || fallbackMapPx;
      setView((current) =>
        zoomMapView(current, event.deltaY < 0 ? zoomStep : 1 / zoomStep, {
          x: current.x + ((event.clientX - rect.left) / width) * current.size,
          y: current.y + ((event.clientY - rect.top) / width) * current.size,
        }),
      );
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (!selectedKey) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setSelectedKey(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedKey]);

  function changeGalaxy(value: number) {
    setGalaxy(value);
    setSelectedKey(null);
    setView(fullMapView);
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.moved && Math.hypot(dx, dy) < dragThresholdPx) return;
    // Capturing the pointer earlier would redirect the click of a marker to the map itself.
    if (!current.moved) event.currentTarget.setPointerCapture?.(event.pointerId);
    current.moved = true;
    current.x = event.clientX;
    current.y = event.clientY;
    const scale = view.size / pixelSize();
    setView((previous) => panMapView(previous, -dx * scale, -dy * scale));
  }

  function onPointerEnd() {
    // The click that follows a drag must not select the marker under the pointer.
    window.setTimeout(() => {
      drag.current = null;
    }, 0);
  }

  function selectMarker(marker: StationMapMarker) {
    if (drag.current?.moved) return;
    setSelectedKey(marker.key);
  }

  function onMarkerKeyDown(event: KeyboardEvent<SVGGElement>, marker: StationMapMarker) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setSelectedKey(marker.key);
  }

  const markerRadius = view.size * 0.0075;

  return (
    <div className={`app-shell${member.pulseEffectsEnabled === false ? " pulse-effects-disabled" : ""}`}>
      <Sidebar
        activeSection="mappa"
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
          sectionTitle="map.title"
          settings={settings}
        />
        <Hero settings={settings} subtitle={t("map.description")} title="map.title" />
        <main className="content-wrap station-map-page">
          {placedMarkers.length === 0 && <p className="messages-empty">{t("map.empty")}</p>}
          <div className="station-map-layout">
            <div className="station-map-frame">
              <div className="station-map-controls">
                <button
                  aria-label={t("map.zoom_in")}
                  className="member-icon-action"
                  data-tooltip={t("map.zoom_in")}
                  onClick={() => setView((current) => zoomMapView(current, zoomStep))}
                  type="button"
                >
                  <Plus size={15} />
                </button>
                <button
                  aria-label={t("map.zoom_out")}
                  className="member-icon-action"
                  data-tooltip={t("map.zoom_out")}
                  onClick={() => setView((current) => zoomMapView(current, 1 / zoomStep))}
                  type="button"
                >
                  <Minus size={15} />
                </button>
                <button
                  aria-label={t("map.reset_view")}
                  className="member-icon-action"
                  data-tooltip={t("map.reset_view")}
                  onClick={() => setView(fullMapView)}
                  type="button"
                >
                  <Scan size={15} />
                </button>
              </div>
              <svg
                aria-label={t("map.aria_label")}
                className="station-map"
                onPointerCancel={onPointerEnd}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                ref={svgRef}
                role="group"
                viewBox={`${view.x} ${view.y} ${view.size} ${view.size}`}
              >
                <rect
                  className="station-map-bounds"
                  height={galaxyExtent * 2}
                  vectorEffect="non-scaling-stroke"
                  width={galaxyExtent * 2}
                  x={-galaxyExtent}
                  y={-galaxyExtent}
                />
                {guideRings.map((radius) => (
                  <circle
                    className="station-map-ring"
                    cx={0}
                    cy={0}
                    key={radius}
                    r={radius}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                <g className="station-map-centre">
                  <title>{t("map.galactic_centre")}</title>
                  <line vectorEffect="non-scaling-stroke" x1={-markerRadius * 2} x2={markerRadius * 2} y1={0} y2={0} />
                  <line vectorEffect="non-scaling-stroke" x1={0} x2={0} y1={-markerRadius * 2} y2={markerRadius * 2} />
                </g>
                {markers.map(({ marker, kind }) => (
                  <g
                    aria-label={t("map.marker_label", { count: marker.stations.length, x: marker.x, z: marker.z })}
                    aria-pressed={marker.key === selectedKey}
                    className={`station-map-marker station-map-marker-${kind}${marker.key === selectedKey ? " selected" : ""}`}
                    key={marker.key}
                    onClick={() => selectMarker(marker)}
                    onKeyDown={(event) => onMarkerKeyDown(event, marker)}
                    role="button"
                    tabIndex={0}
                  >
                    {kind === "highlight" && (
                      <circle className="station-map-pulse" cx={marker.x} cy={marker.z} r={markerRadius * 1.6} />
                    )}
                    <circle cx={marker.x} cy={marker.z} r={markerRadius * (marker.stations.length > 1 ? 1.5 : 1)} />
                    {marker.stations.length > 1 && (
                      <text dy="0.35em" fontSize={markerRadius * 1.5} x={marker.x} y={marker.z}>
                        {marker.stations.length}
                      </text>
                    )}
                  </g>
                ))}
              </svg>
            </div>
            <aside className="station-map-side">
              <label className="planet-filter station-map-galaxy">
                <span>{t("stations.galaxy")}</span>
                <select onChange={(event) => changeGalaxy(Number(event.target.value))} value={galaxy}>
                  {galaxies.map((value) => (
                    <option key={value} value={value}>
                      {galaxyLabel(value)}
                    </option>
                  ))}
                </select>
              </label>
              <h3>{t("map.legend")}</h3>
              <ul aria-label={t("map.legend")} className="station-map-legend">
                {legendKinds
                  .filter((kind) => (kind !== "hub" || hub) && (kind !== "highlight" || highlightKey))
                  .map((kind) => (
                    <li key={kind}>
                      <span aria-hidden="true" className={`station-map-legend-dot station-map-marker-${kind}`} />
                      {t(`map.legend_${kind}`)}
                    </li>
                  ))}
              </ul>
              <p className="station-map-hint">{t("map.select_hint")}</p>
              {hidden > 0 && (
                <p className="station-map-hint">
                  {t(hidden === 1 ? "map.hidden_station" : "map.hidden_stations", { count: hidden })}
                </p>
              )}
            </aside>
          </div>
        </main>
      </section>
      {selected && (
        <div className="dialog-backdrop" onClick={() => setSelectedKey(null)}>
          <dialog
            aria-labelledby="station-map-dialog-title"
            aria-modal="true"
            className="mission-dialog station-map-dialog"
            onClick={(event) => event.stopPropagation()}
            open
          >
            <div className="dialog-heading">
              <div>
                <span className="eyebrow">
                  {t("map.region_coordinates", { x: selected.x, z: selected.z, y: selected.y })}
                </span>
                <h2 id="station-map-dialog-title">
                  {selected.stations.length === 1
                    ? selected.stations[0].name || selected.stations[0].portal
                    : t("map.stations_in_region", { count: selected.stations.length })}
                </h2>
              </div>
              <button
                aria-label={t("common.close")}
                className="icon-button"
                onClick={() => setSelectedKey(null)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <ul className="station-map-stations">
              {selected.stations.map((station) => (
                <li key={`${station.ownerId}:${station.portal}`}>
                  <DetailLink
                    href={stationDetailHref(
                      { portal: station.portal, galaxy: station.galaxy, ownerId: station.ownerId },
                      "map",
                    )}
                  >
                    <strong>{station.name || station.portal}</strong>
                  </DetailLink>
                  <code>{station.portal}</code>
                  <small>{station.ownerName}</small>
                </li>
              ))}
            </ul>
          </dialog>
        </div>
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
