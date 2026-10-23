"use client";

import { Gem, Leaf, PawPrint } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import type { AlmanacDiscoveryCounts } from "@/lib/almanac/almanac-discovery-counts";

export function PlanetDiscoveryCounts({ counts = {} }: Readonly<{ counts?: AlmanacDiscoveryCounts }>) {
  const { t } = useLocale();
  if (Object.keys(counts).length === 0) return null;

  return (
    <span className="planet-discovery-counts">
      {(
        [
          { key: "flora", label: "planet.flora", Icon: Leaf },
          { key: "fauna", label: "planet.fauna", Icon: PawPrint },
          { key: "minerals", label: "planet.minerals", Icon: Gem },
        ] as const
      ).map(({ key, label, Icon }) => {
        const count = counts[key];
        return count !== undefined ? (
          <span aria-label={`${t(label)}: ${count}`} data-tooltip={`${t(label)}: ${count}`} key={key} role="img">
            <Icon aria-hidden="true" size={13} />
            {count}
          </span>
        ) : null;
      })}
    </span>
  );
}
