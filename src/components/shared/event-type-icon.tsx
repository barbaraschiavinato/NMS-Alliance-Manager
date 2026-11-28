import { GatheringIcon, MarketIcon, OtherEventIcon } from "@/components/shared/icons";
import type { EventType } from "@/lib/events/events";

const icons = { market: MarketIcon, gathering: GatheringIcon, other: OtherEventIcon } as const;

export function EventTypeIcon({ type, size = 14 }: Readonly<{ type: EventType; size?: number }>) {
  const Icon = icons[type];
  return <Icon aria-hidden="true" size={size} />;
}
