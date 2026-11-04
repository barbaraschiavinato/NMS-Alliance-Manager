"use client";

import { Compass, Orbit, Search } from "lucide-react";
import { useId } from "react";
import { useLocale } from "@/components/providers/locale-provider";
import {
  applicableSystemStatuses,
  systemStatusCoveredBy,
  missionSystemStatuses,
  missionSystemStatusRoles,
  systemStatusLockedBy,
  type MissionSystemStatus,
  type SystemStatusAuthors,
} from "@/lib/planets/planet-system-status";
import { systemTaskTooltip } from "@/lib/planets/system-task-tooltip";

const allProgressStatuses = missionSystemStatuses.filter((status) => status !== "data_error");

const statusRoles = missionSystemStatusRoles;

export const roleOrder = ["ranger", "explorer", "builder"];

const coverIcons = { explorer: Search, ranger: Compass, discoverer: Orbit } as const;

export function MissionSystemProgress({
  statuses,
  editable,
  editableRoles = null,
  pulseRoles = editableRoles,
  disabled = false,
  authors,
  currentMemberId,
  allianceName,
  onToggle,
}: Readonly<{
  statuses: MissionSystemStatus[];
  authors?: SystemStatusAuthors;
  currentMemberId?: string;
  allianceName?: string;
  editable: boolean;
  editableRoles?: readonly string[] | null;
  pulseRoles?: readonly string[] | null;
  disabled?: boolean;
  onToggle: (status: MissionSystemStatus, checked: boolean) => void;
}>) {
  const { locale, t } = useLocale();
  const tooltipId = useId();
  const hasDataError = statuses.includes("data_error");
  const progressStatuses = applicableSystemStatuses(statuses).filter((status) => status !== "data_error");
  const showLabels = editable && editableRoles !== null;
  return (
    <span
      aria-label={
        hasDataError
          ? t("errors.system_progress_data_error")
          : t("missions.system_progress_current_of_total_complete", {
              current: progressStatuses.filter((status) => statuses.includes(status)).length,
              total: progressStatuses.length,
            })
      }
      className="mission-system-progress"
      role="group"
    >
      {roleOrder.map((role) =>
        editable && editableRoles && !editableRoles.includes(role) ? null : (
          <span className="mission-system-progress-group" key={role}>
            {allProgressStatuses
              .filter((status) => statusRoles[status] === role)
              .map((status) => {
                const itemEditable = editable && (!editableRoles || editableRoles.includes(statusRoles[status]));
                if (editable && !itemEditable) return null;
                const crossCoveredBy = hasDataError ? null : systemStatusCoveredBy(status, statuses);
                // Full moderators/admins (editableRoles === null) may always change a task checked by someone else.
                const lockedBy =
                  hasDataError || crossCoveredBy || !itemEditable || editableRoles === null
                    ? null
                    : systemStatusLockedBy(status, statuses, authors, currentMemberId);
                const coveredBy = crossCoveredBy ?? lockedBy;
                const covered = coveredBy !== null;
                if (!editable && covered) return null;
                const CoveredIcon = coveredBy ? coverIcons[coveredBy] : Search;
                const isChecked = covered || statuses.includes(status);
                const shouldPulse =
                  itemEditable && pulseRoles?.includes(statusRoles[status]) && !disabled && !isChecked;
                const label = t(`system.${hasDataError ? "data_error" : status}`);
                const description =
                  itemEditable && !covered && !hasDataError ? systemTaskTooltip(status, locale, allianceName) : null;
                const accessibleLabel = covered
                  ? t(`system.${lockedBy === "ranger" ? "done_by_assigned_ranger" : `done_by_${coveredBy}`}`, {
                      task: label,
                    })
                  : label;
                const tooltip = description ? (showLabels ? description : `${label}\n${description}`) : accessibleLabel;
                const descriptionId = description ? `${tooltipId}-${status}` : undefined;
                const tooltipRole = hasDataError ? "error" : (coveredBy ?? statusRoles[status]);
                return (
                  <label
                    aria-describedby={descriptionId}
                    aria-label={accessibleLabel}
                    className={`mission-system-progress-item system-task-tooltip-${tooltipRole}${description ? " mission-system-progress-item-description" : ""}${itemEditable && !covered ? " mission-system-progress-item-editable" : ""}${covered ? " mission-system-progress-item-covered" : ""}${shouldPulse ? " mission-system-progress-item-pulse" : ""}${showLabels ? " mission-system-progress-item-labeled" : ""}`}
                    data-tooltip={tooltip}
                    key={status}
                    tabIndex={!itemEditable || disabled || covered ? 0 : undefined}
                  >
                    {itemEditable && (
                      <input
                        aria-describedby={descriptionId}
                        aria-label={accessibleLabel}
                        checked={isChecked}
                        disabled={disabled || covered}
                        onChange={(event) => onToggle(status, event.target.checked)}
                        type="checkbox"
                      />
                    )}
                    <span
                      aria-hidden="true"
                      className={
                        hasDataError
                          ? "mission-system-progress-square mission-system-progress-square-error"
                          : covered
                            ? `mission-system-progress-square mission-system-progress-square-${coveredBy} mission-system-progress-square-done mission-system-progress-square-covered`
                            : `mission-system-progress-square mission-system-progress-square-${statusRoles[status]}${isChecked ? " mission-system-progress-square-done" : ""}`
                      }
                    >
                      {covered && <CoveredIcon strokeWidth={3} />}
                    </span>
                    {description && (
                      <span className="sr-only" id={descriptionId}>
                        {description}
                      </span>
                    )}
                    {showLabels && (
                      <span aria-hidden="true" className="mission-system-progress-label">
                        {label}
                      </span>
                    )}
                  </label>
                );
              })}
          </span>
        ),
      )}
    </span>
  );
}
