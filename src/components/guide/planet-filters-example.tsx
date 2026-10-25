"use client";

import { useState } from "react";
import {
  PlanetActiveFilters,
  PlanetFilters,
  emptyPlanetFilterOptions,
  emptyPlanetFilterValues,
  hasActivePlanetFilters,
  type PlanetFilterValues,
} from "@/components/forms/planet-filters";

// The example lists the filters whose options depend on the data: the special systems and the visited filter.
const exampleOptions = {
  ...emptyPlanetFilterOptions,
  features: ["gas-giant", "atlas", "black-hole"],
  visitable: true,
} as const satisfies typeof emptyPlanetFilterOptions;

export function PlanetFiltersExample({
  initiallyOpen = false,
  initialFilters = emptyPlanetFilterValues,
}: Readonly<{ initiallyOpen?: boolean; initialFilters?: PlanetFilterValues }>) {
  const [open, setOpen] = useState(initiallyOpen);
  const [filters, setFilters] = useState(initialFilters);
  const updateFilter = <K extends keyof PlanetFilterValues>(key: K, value: PlanetFilterValues[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const hasActiveFilters = hasActivePlanetFilters(filters);
  const resetFilters = () => setFilters(emptyPlanetFilterValues);

  return (
    <div className="guide-example">
      <PlanetFilters
        hasActiveFilters={hasActiveFilters}
        onChange={updateFilter}
        onSearchChange={() => undefined}
        onToggle={() => setOpen((current) => !current)}
        open={open}
        options={exampleOptions}
        search=""
        values={filters}
      />
      <PlanetActiveFilters onChange={updateFilter} onReset={resetFilters} values={filters} />
    </div>
  );
}
