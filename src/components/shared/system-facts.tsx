"use client";

import type { CSSProperties } from "react";
import { conflictLevels } from "@/components/cards/planet-destination-card";
import { useLocale } from "@/components/providers/locale-provider";
import type { AlmanacFact } from "@/lib/almanac/almanac-facts";

const raceIcons: Record<string, string> = {
  Gek: "/icons/nms-gek.svg",
  Korvax: "/icons/nms-korvax.svg",
  "Vy’keen": "/icons/nms-vykeen.svg",
};

// Star, economy (with stars), conflict (with dots) and race (with icon) of a system.
export function SystemFacts({
  facts,
  economyStars,
}: Readonly<{ facts: readonly AlmanacFact[]; economyStars?: number }>) {
  const { t, tv } = useLocale();
  if (facts.length === 0) return null;
  return (
    <div className="planet-station-facts">
      {facts.map((fact) => (
        <span key={fact.label}>
          <b>{t(fact.label)}</b>
          {fact.label === "common.race" && (
            <span
              aria-label={tv(fact.value)}
              className="planet-race"
              data-tooltip={tv(fact.value)}
              role="img"
              tabIndex={0}
            >
              {raceIcons[fact.value] ? (
                <span
                  aria-hidden="true"
                  className="planet-race-icon"
                  style={{ "--race-icon": `url(${raceIcons[fact.value]})` } as CSSProperties}
                />
              ) : (
                <span aria-hidden="true" className="planet-race-unknown">
                  -
                </span>
              )}
            </span>
          )}
          {fact.label !== "common.conflict" && fact.label !== "common.race" && <> {tv(fact.value)}</>}
          {fact.label === "common.economy" && economyStars !== undefined && (
            <span
              aria-label={t("planet.economy_level", { stars: economyStars })}
              className="planet-economy-stars"
              data-tooltip={t("planet.economy_level", { stars: economyStars })}
              role="img"
              tabIndex={0}
            >
              {" "}
              {"★".repeat(economyStars)}
              {"☆".repeat(3 - economyStars)}
            </span>
          )}
          {fact.label === "common.conflict" && conflictLevels[fact.value] !== undefined && (
            <span aria-label={tv(fact.value)} className="planet-conflict-dots" data-tooltip={tv(fact.value)} role="img">
              {[1, 2, 3].map((step) => (
                <i className={step <= conflictLevels[fact.value] ? "filled" : undefined} key={step} />
              ))}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
