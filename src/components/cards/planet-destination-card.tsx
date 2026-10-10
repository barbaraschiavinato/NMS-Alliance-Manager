"use client";

import Image from "next/image";
import { Droplet, Globe2, Moon } from "lucide-react";
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
  plants: string[];
  minerals: string[];
  valuables: string[];
  dissonant: boolean;
  paradise: boolean;
  blackMarket: boolean;
  station?: Readonly<{
    id: string;
    portal: string;
    galaxy: number;
    name?: string;
    createdAt?: string;
    hasMissions?: boolean;
  }>;
}>;

const planetSizeLevels: Record<string, number> = { Small: 1, Medium: 2, Large: 3, Huge: 3 };

function PlanetSizeIndicator({ size, label }: Readonly<{ size?: string; label: (value: string) => string }>) {
  if (!size) return null;
  if (size === "Moon") {
    return <span aria-label={label(size)} className="planet-size-indicator" data-tooltip={label(size)} role="img"><Moon aria-hidden="true" size={14} /></span>;
  }
  const level = planetSizeLevels[size];
  if (!level) return null;
  return <span aria-label={label(size)} className="planet-size-indicator" data-tooltip={label(size)} role="img">
    {[1, 2, 3].map((step) => <i className={step === level ? "active" : undefined} data-step={step} key={step} />)}
  </span>;
}

export const conflictLevels: Record<string, number> = { None: 0, Low: 1, Medium: 2, High: 3, Outlaw: 3 };

function PlanetWaterIndicator({ water, label }: Readonly<{ water?: string; label: (value: string) => string }>) {
  if (!water || water === "None") return null;
  return <span aria-label={label(water)} className="planet-water-indicator has-water" data-tooltip={label(water)} role="img"><Droplet aria-hidden="true" size={14} /></span>;
}

export function PlanetDestinationCard({ planet, onOpen }: Readonly<{ planet: PlanetDestination; onOpen: (planet: PlanetDestination) => void }>) {
  const { t, tv } = useLocale();
  return <li>
                {planet.dissonant && <span className="planet-ribbon-clip"><span className="planet-dissonant-ribbon">{t("planet.dissonant")}</span></span>}
                {planet.paradise && <span className="planet-ribbon-clip planet-ribbon-clip-left"><span className="planet-paradise-ribbon">{t("planet.paradise")}</span></span>}
                <button className="planet-mission-card" onClick={() => onOpen(planet)} type="button">
                  {planet.imageUrl
                    ? <Image alt="" className="planet-mission-image" height={96} src={planet.imageUrl} unoptimized width={96} />
                    : <Globe2 aria-hidden="true" className="planet-mission-icon" size={19} />}
                  <span className="planet-mission-card-copy">
                    <strong>{planet.almanacName || t("planet.planet_number", { number: planet.planetNumber })}</strong>
                    <GlyphStrip address={planet.planetPortal} />
                    <code>{planet.planetPortal}</code>
                    {planet.almanacFacts.some((fact) => !["planet.size", "planet.water"].includes(fact.label)) && <span className="planet-mission-facts">{planet.almanacFacts.filter((fact) => !["planet.size", "planet.water"].includes(fact.label)).map((fact) =>
                      <span key={fact.label}><b>{t(fact.label)}</b> {tv(fact.value)}</span>,
                    )}</span>}
                  </span>
                  <PlanetWaterIndicator label={tv} water={planet.almanacFacts.find((fact) => fact.label === "planet.water")?.value} />
                  <PlanetSizeIndicator size={planet.almanacFacts.find((fact) => fact.label === "planet.size")?.value} label={tv} />
                </button>
              </li>;
}
