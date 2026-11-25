"use client";

import { useEffect, useState } from "react";
import { AtlasIcon, BlackHoleIcon, GasGiantIcon } from "@/components/shared/icons";
import { useLocale } from "@/components/providers/locale-provider";
import { systemFeature, type SystemFeature } from "@/lib/planets/system-feature";

const features = {
  "black-hole": { label: "system.black_hole", Icon: BlackHoleIcon },
  atlas: { label: "system.atlas_interface", Icon: AtlasIcon },
  "gas-giant": { label: "system.gas_giant", Icon: GasGiantIcon },
} as const;

export function SystemFeatureBadge({ portal, galaxy }: Readonly<{ portal: string; galaxy: number }>) {
  const { t } = useLocale();
  const [result, setResult] = useState<{ key: string; feature: SystemFeature | null } | null>(null);
  const key = `${portal}:${galaxy}`;

  useEffect(() => {
    let active = true;
    systemFeature(portal, galaxy)
      .then((feature) => {
        if (active) setResult({ key, feature });
      })
      .catch((error: unknown) => {
        console.error("Unable to calculate the system feature with nms-core", error);
      });
    return () => {
      active = false;
    };
  }, [galaxy, key, portal]);

  if (result?.key !== key || !result.feature) return null;
  const { label, Icon } = features[result.feature];
  return (
    <span className={`system-feature system-feature-${result.feature}`}>
      <Icon aria-hidden="true" size={11} />
      {t(label)}
    </span>
  );
}
