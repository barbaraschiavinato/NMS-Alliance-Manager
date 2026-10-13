"use client";

import { HeroAddButton } from "@/components/layout/hero";

const noop = () => undefined;

export function AddStationButtonExample() {
  return (
    <div className="guide-example guide-add-station-button-example" inert>
      <HeroAddButton className="station-header-add-pulse" label="stations.add_station" onClick={noop} />
    </div>
  );
}
