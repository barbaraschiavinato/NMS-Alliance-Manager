"use client";

import { useEffect, useState } from "react";
import { Aperture } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { systemFeature, type SystemFeature } from "@/lib/planets/system-feature";

// No Man's Sky logo, drawn with the same stroke style as the lucide icons.
function AtlasIcon({ size }: Readonly<{ size: number }>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={3}
      viewBox="0 0 48 48"
      width={size}
    >
      <path d="M11.466 18.784L24 13.689M24 44.5l12.535-25.716L24 3.5L11.466 18.784zm12.535-25.716L24 13.689M24 3.5v41" />
      <path d="M24 24.45a5.666 5.666 0 0 0 4.698-8.834" />
    </svg>
  );
}

function BlackHoleIcon({ size }: Readonly<{ size: number }>) {
  return <Aperture aria-hidden="true" size={size} />;
}

function GasGiantIcon({ size }: Readonly<{ size: number }>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={size}
    >
      <circle cx="12" cy="12" r="5.5" />
      <ellipse cx="12" cy="12" rx="10.5" ry="3.2" transform="rotate(-20 12 12)" />
    </svg>
  );
}

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
      <Icon size={11} />
      {t(label)}
    </span>
  );
}
