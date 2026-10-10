"use client";

import { useLocale } from "@/components/locale-provider";
import { missionSystemStatuses, missionSystemStatusRoles, type MissionSystemStatus } from "@/lib/planet-system-status";

const progressStatuses = missionSystemStatuses.filter((status) => status !== "data_error");

const statusRoles = missionSystemStatusRoles;

export const roleOrder = ["ranger", "explorer", "builder"];

export function MissionSystemProgress({ statuses, editable, editableRoles = null, disabled = false, onToggle }: Readonly<{
  statuses: MissionSystemStatus[];
  editable: boolean;
  editableRoles?: readonly string[] | null;
  disabled?: boolean;
  onToggle: (status: MissionSystemStatus, checked: boolean) => void;
}>) {
  const { t } = useLocale();
  const hasDataError = statuses.includes("data_error");
  const showLabels = editable && editableRoles !== null;
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
    {roleOrder.map((role) => editable && editableRoles && !editableRoles.includes(role) ? null : <span className="mission-system-progress-group" key={role}>
    {progressStatuses.filter((status) => statusRoles[status] === role).map((status) => {
      const itemEditable = editable && (!editableRoles || editableRoles.includes(statusRoles[status]));
      if (editable && !itemEditable) return null;
      const tooltip = t(hasDataError ? "system.data_error" : status);
      return <label aria-label={tooltip} className={`mission-system-progress-item${itemEditable ? " mission-system-progress-item-editable" : ""}${showLabels ? " mission-system-progress-item-labeled" : ""}`} key={status} title={tooltip}>
        {itemEditable && <input
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
            : `mission-system-progress-square mission-system-progress-square-${statusRoles[status]}${statuses.includes(status) ? " mission-system-progress-square-done" : ""}`}
        />
        <span aria-hidden="true" className="mission-system-progress-tooltip">{tooltip}</span>
        {showLabels && <span aria-hidden="true" className="mission-system-progress-label">{tooltip}</span>}
      </label>;
    })}
    </span>)}
  </span>;
}
