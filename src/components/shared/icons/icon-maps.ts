import { Compass, Crosshair, Eclipse, Factory, Hammer, Orbit, PawPrint, Search } from "lucide-react";
import { MapIcon } from "./custom-icons";

// Icons picked by key. `sectionIcons` uses the keys of `sectionAccents` (lib/navigation/section-accents.ts),
// so a section's icon and colour can be looked up together. These maps are the only definition of the
// section and specialty icons: index.ts derives `StationIcon`, `RangerIcon` and the others from them.
export const sectionIcons = {
  stations: Orbit,
  missions: Crosshair,
  planets: Eclipse,
  map: MapIcon,
  farms: Factory,
  pets: PawPrint,
} as const;

export const specialtyIcons = {
  ranger: Compass,
  explorer: Search,
  builder: Hammer,
} as const;
