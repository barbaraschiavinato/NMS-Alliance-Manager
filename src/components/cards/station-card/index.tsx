import { StationCardExtended } from "@/components/cards/station-card/extended";
import { StationCardSimple } from "@/components/cards/station-card/simple";
import type { StationCardProps } from "@/components/cards/station-card/parts";

export function StationCard(props: StationCardProps) {
  return props.member.simpleView === true ? <StationCardSimple {...props} /> : <StationCardExtended {...props} />;
}
