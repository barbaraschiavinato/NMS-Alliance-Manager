"use client";

import Image from "next/image";
import { useId } from "react";
import { AudioWaveform, Globe2, Moon, Palmtree, Siren } from "lucide-react";
import type { SystemFeature } from "@/lib/planets/system-feature";
import type { AlmanacDiscoveryCounts } from "@/lib/almanac/almanac-discovery-counts";
import { PlanetDiscoveryCounts } from "@/components/shared/planet-discovery-counts";
import { GlyphStrip } from "@/components/shared/portal-address-field";
import { useLocale } from "@/components/providers/locale-provider";

export type PlanetDestination = Readonly<{
  id: string;
  portal: string;
  planetPortal: string;
  planetNumber: number;
  createdAt?: string;
  galaxy: number;
  title?: string;
  description?: string;
  system?: string;
  systemLabelFromAlmanac?: boolean;
  imageUrl?: string;
  almanacName?: string;
  almanacSearchIndex: string;
  almanacFacts: { label: string; value: string }[];
  systemFacts: { label: string; value: string }[];
  planetType?: string;
  economyStars?: number;
  wealth?: string;
  discoveryCounts?: AlmanacDiscoveryCounts;
  plants: string[];
  minerals: string[];
  valuables: string[];
  dissonant: boolean;
  paradise: boolean;
  blackMarket: boolean;
  systemFeature?: SystemFeature;
  canMarkVisited?: boolean;
  visited?: boolean;
  station?: Readonly<{
    id: string;
    portal: string;
    galaxy: number;
    name?: string;
    createdAt?: string;
    hasMissions?: boolean;
    canCreateMission?: boolean;
  }>;
}>;

const planetSizeLevels: Record<string, number> = { Small: 1, Medium: 2, Large: 3, Huge: 3 };

function PlanetSizeIndicator({ size, label }: Readonly<{ size?: string; label: (value: string) => string }>) {
  if (!size) return null;
  if (size === "Moon") {
    return (
      <span aria-label={label(size)} className="planet-size-indicator" data-tooltip={label(size)} role="img">
        <Moon aria-hidden="true" size={14} />
      </span>
    );
  }
  const level = planetSizeLevels[size];
  if (!level) return null;
  return (
    <span aria-label={label(size)} className="planet-size-indicator" data-tooltip={label(size)} role="img">
      {[1, 2, 3].map((step) => (
        <i className={step === level ? "active" : undefined} data-step={step} key={step} />
      ))}
    </span>
  );
}

export const conflictLevels: Record<string, number> = { None: 0, Low: 1, Medium: 2, High: 3, Outlaw: 3 };

// One drop that fills up with the amount of water: empty when dry, a third for Shallow, two thirds for Ocean and full
// for Deep. An unknown word shows a third, so a planet with some water never looks dry.
const planetWaterLevels: Record<string, number> = { None: 0, Shallow: 1, Ocean: 2, Deep: 3 };
const dropPath =
  "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z";

function PlanetWaterIndicator({ water, label }: Readonly<{ water?: string; label: (value: string) => string }>) {
  const clipId = `water-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (!water) return null;
  const level = planetWaterLevels[water] ?? 1;
  return (
    <span
      aria-label={label(water)}
      className={`planet-water-indicator${level > 0 ? " has-water" : ""}`}
      data-tooltip={label(water)}
      role="img"
    >
      <svg aria-hidden="true" height={14} viewBox="0 0 24 24" width={14}>
        {level > 0 && (
          <>
            <clipPath id={clipId}>
              <rect height="24" width="24" x="0" y={22 - (20 * level) / 3} />
            </clipPath>
            <path className="planet-water-fill" clipPath={`url(#${clipId})`} d={dropPath} />
          </>
        )}
        <path className="planet-water-outline" d={dropPath} />
      </svg>
    </span>
  );
}

export type PlanetVisitControls = Readonly<{
  isVisited: (planet: PlanetDestination) => boolean;
  isSaving: (planet: PlanetDestination) => boolean;
  onToggle: (planet: PlanetDestination, visited: boolean) => void;
  onRequestHelp: (planet: PlanetDestination) => void;
}>;

export function PlanetDestinationCard({
  planet,
  onOpen,
  visits,
}: Readonly<{
  planet: PlanetDestination;
  onOpen: (planet: PlanetDestination) => void;
  visits?: PlanetVisitControls;
}>) {
  const { t, tv } = useLocale();
  return (
    <div className={planet.canMarkVisited && visits ? "planet-card-with-visit planet-card-with-help" : undefined}>
      <button className="planet-mission-card" onClick={() => onOpen(planet)} type="button">
        {planet.imageUrl ? (
          <Image alt="" className="planet-mission-image" height={96} src={planet.imageUrl} unoptimized width={96} />
        ) : (
          <Globe2 aria-hidden="true" className="planet-mission-icon" size={19} />
        )}
        <span className="planet-mission-card-copy">
          <strong>{planet.almanacName || t("planet.planet_number", { number: planet.planetNumber })}</strong>
          <GlyphStrip address={planet.planetPortal} />
          <code>{planet.planetPortal}</code>
          {planet.almanacFacts.some((fact) => !["planet.size", "planet.water"].includes(fact.label)) && (
            <span className="planet-mission-facts">
              {planet.almanacFacts
                .filter((fact) => !["planet.size", "planet.water"].includes(fact.label))
                .map((fact) => (
                  <span key={fact.label}>
                    <b>{t(fact.label)}</b> {tv(fact.value)}
                  </span>
                ))}
            </span>
          )}
          <PlanetDiscoveryCounts counts={planet.discoveryCounts} />
        </span>
        <span className="planet-card-indicators">
          {planet.paradise && (
            <span
              aria-label={t("planet.paradise")}
              className="planet-paradise-indicator"
              data-tooltip={t("planet.paradise")}
              role="img"
            >
              <Palmtree aria-hidden="true" size={14} />
            </span>
          )}
          {planet.dissonant && (
            <span
              aria-label={t("planet.dissonant")}
              className="planet-dissonant-indicator"
              data-tooltip={t("planet.dissonant")}
              role="img"
            >
              <AudioWaveform aria-hidden="true" size={14} />
            </span>
          )}
          <PlanetSizeIndicator
            size={planet.almanacFacts.find((fact) => fact.label === "planet.size")?.value}
            label={tv}
          />
          <PlanetWaterIndicator
            label={tv}
            water={planet.almanacFacts.find((fact) => fact.label === "planet.water")?.value}
          />
        </span>
      </button>
      {planet.canMarkVisited && visits && (
        <button
          aria-label={t("help.request_help")}
          className="member-icon-action planet-card-help"
          data-tooltip={t("help.request_help")}
          onClick={() => visits.onRequestHelp(planet)}
          type="button"
        >
          <Siren aria-hidden="true" size={14} />
        </button>
      )}
      {planet.canMarkVisited && visits && (
        <label className="planet-visited-check">
          <span>{t("planet.visited")}</span>
          <input
            checked={visits.isVisited(planet)}
            disabled={visits.isSaving(planet)}
            onChange={(event) => visits.onToggle(planet, event.target.checked)}
            type="checkbox"
          />
        </label>
      )}
    </div>
  );
}
