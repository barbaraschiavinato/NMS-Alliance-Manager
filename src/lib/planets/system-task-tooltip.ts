import type { MissionSystemStatus } from "@/lib/planets/planet-system-status";
import { translate, type Locale } from "@/lib/translations";

const tooltipKeys: Record<Exclude<MissionSystemStatus, "data_error">, string> = {
  station_claimed: "system.station_claimed_tooltip",
  system_scanned: "system.scanned_tooltip",
  mapped: "system.scanned_tooltip",
  planets_classified: "system.explored_tooltip",
  data_uploaded: "system.uploaded_tooltip",
  buildings_built: "system.buildings_tooltip",
  bases_uploaded: "system.bases_tooltip",
  renamed: "system.renamed_tooltip",
  system_data_uploaded: "system.uploaded_tooltip",
};

export function systemTaskTooltip(status: MissionSystemStatus, locale: Locale, allianceName = ""): string | null {
  if (status === "data_error") return null;
  const alliance = allianceName.trim();
  const key =
    !alliance && status === "station_claimed"
      ? "system.station_claimed_generic_tooltip"
      : !alliance && status === "renamed"
        ? "system.renamed_generic_tooltip"
        : tooltipKeys[status];
  return translate(locale, key, { alliance });
}
