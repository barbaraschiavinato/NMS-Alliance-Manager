"use client";

import type { Mission } from "@/lib/missions";
import type { MissionFilter } from "@/components/sections/mission-list";
import { useLocale } from "@/components/providers/locale-provider";

export function MissionMetrics({ missions, counts }: Readonly<{
  missions: Mission[];
  counts: Record<MissionFilter, number>;
}>) {
  const { t } = useLocale();
  const highPriorityCount = missions.filter((mission) =>
    mission.status !== "completed" && (mission.priority === "urgent" || mission.priority === "high"),
  ).length;
  const completedShare = missions.length > 0 ? Math.round((counts.completed / missions.length) * 100) : 0;

  return (
    <section aria-label={t("admin.mission_overview")} className="metrics-row">
      <div className="metrics-inner">
        <div className="metric"><span className="metric-label">{t("missions.active_missions_metric")}</span><strong>{counts.in_progress}<small> / {missions.length}</small></strong><span className="metric-foot"><span className="metric-marker marker-green" />{counts.pending} {t("common.pending_status_label")}</span></div>
        <div className="metric"><span className="metric-label">{t("common.completed_missions_metric")}</span><strong>{counts.completed}</strong><span className="metric-foot"><span className="metric-marker marker-coral" />{completedShare}% {t("common.of_total")}</span></div>
        <div className="metric"><span className="metric-label">{t("missions.high_urgent_priority")}</span><strong>{highPriorityCount}</strong><span className="metric-foot"><span className="metric-marker marker-yellow" />{t("missions.need_attention")}</span></div>
        <div className="metric"><span className="metric-label">{t("missions.unassigned_metric")}</span><strong>{counts.pending_unassigned}</strong><span className="metric-foot"><span className="metric-marker marker-coral" />{t("missions.pending_without_an_assignee")}</span></div>
      </div>
    </section>
  );
}
