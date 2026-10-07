"use client";

import { useLocale } from "@/components/locale-provider";
import { missionSystemStatuses, type MissionSystemStatus } from "@/lib/planet-system-status";

const progressStatuses = missionSystemStatuses.filter((status) => status !== "data_error");

export function MissionSystemProgress({ statuses, editable, disabled = false, onToggle }: Readonly<{
  statuses: MissionSystemStatus[];
  editable: boolean;
  disabled?: boolean;
  onToggle: (status: MissionSystemStatus, checked: boolean) => void;
}>) {
  const { t } = useLocale();
  const hasDataError = statuses.includes("data_error");
  return <span
    aria-label={hasDataError
      ? t("errors.system_progress_data_error")
      : t("missions.system_progress_current_of_total_complete", {
        current: progressStatuses.filter((status) => statuses.includes(status)).length,
        total: progressStatuses.length,
      })}
    className="mission-system-progress"
    role="group"
  >
    {progressStatuses.map((status) => {
      const tooltip = t(hasDataError ? "system.data_error" : status);
      return <label aria-label={tooltip} className={`mission-system-progress-item${editable ? " mission-system-progress-item-editable" : ""}`} key={status} title={tooltip}>
        {editable && <input
          aria-label={tooltip}
          checked={statuses.includes(status)}
          disabled={disabled}
          onChange={(event) => onToggle(status, event.target.checked)}
          type="checkbox"
        />}
        <span
          aria-hidden="true"
          className={hasDataError
            ? "mission-system-progress-square mission-system-progress-square-error"
            : `mission-system-progress-square${statuses.includes(status) ? " mission-system-progress-square-done" : ""}`}
        />
        <span aria-hidden="true" className="mission-system-progress-tooltip">{tooltip}</span>
      </label>;
    })}
  </span>;
}
