"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/providers/locale-provider";

type SystemSummary = Readonly<{ planetCount: number; moonCount: number; starType: number }>;

const starTypeLabels = [
  "system.star_yellow_white",
  "system.star_green",
  "system.star_blue",
  "system.star_red",
  "system.star_purple",
] as const;

export function StationSystemCoreInfo({ portal, galaxy }: Readonly<{ portal: string; galaxy: number }>) {
  const { t } = useLocale();
  const [summary, setSummary] = useState<SystemSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    if (!/^[0-9A-F]{12}$/i.test(portal) || !Number.isInteger(galaxy) || galaxy < 0 || galaxy > 255) return;

    async function loadSystemSummary() {
      try {
        const { systemAttributes, planetSeeds } = await import("@/lib/nms-core/system.js");
        const address = BigInt(`0x${portal}`);
        const attributes = systemAttributes(address, galaxy);
        const { planet_count: planetCount, moon_count: moonCount } = planetSeeds(address, galaxy);
        if (
          !Number.isInteger(planetCount) ||
          planetCount < 1 ||
          planetCount > 6 ||
          !Number.isInteger(moonCount) ||
          moonCount < 0 ||
          moonCount > 12 ||
          typeof attributes.star_type !== "number" ||
          !Number.isInteger(attributes.star_type) ||
          attributes.star_type < 0 ||
          attributes.star_type >= starTypeLabels.length
        ) {
          throw new Error("Invalid nms-core system attributes.");
        }
        if (active) setSummary({ planetCount, moonCount, starType: attributes.star_type });
      } catch (error_: unknown) {
        console.error("Unable to calculate station system details with nms-core", error_);
        if (active) setError(true);
      }
    }

    void loadSystemSummary();
    return () => {
      active = false;
    };
  }, [galaxy, portal]);

  if (error) return <span className="station-card-system-core">{t("system.system_data_unavailable")}</span>;
  if (!summary) return null;

  return (
    <span className="station-card-system-core">
      {t(summary.planetCount === 1 ? "system.planet_count_one" : "system.planets_count", {
        count: summary.planetCount,
      })}{" "}
      ·{" "}
      {summary.moonCount > 0 && (
        <>
          {t(summary.moonCount === 1 ? "system.moon_count_one" : "system.moons_count", { count: summary.moonCount })}{" "}
          ·{" "}
        </>
      )}
      {t("system.star_type_label", {
        type: t(starTypeLabels[summary.starType]),
      })}
    </span>
  );
}
