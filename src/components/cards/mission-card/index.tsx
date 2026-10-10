import { MissionCardExtended } from "@/components/cards/mission-card/extended";
import { MissionCardSimple } from "@/components/cards/mission-card/simple";
import type { MissionCardProps } from "@/components/cards/mission-card/parts";

export function MissionCard(props: MissionCardProps) {
  return props.currentMember.simpleView === true ? <MissionCardSimple {...props} /> : <MissionCardExtended {...props} />;
}
