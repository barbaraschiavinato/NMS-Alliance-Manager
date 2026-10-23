"use client";

import { GlyphStrip } from "@/components/shared/portal-address-field";
import { useLocale } from "@/components/providers/locale-provider";
import { galaxyLabel } from "@/lib/planets/galaxies";

type Sample = Readonly<{ portal: string; galaxy: number; response: Record<string, unknown> }>;

export function StationFormExample({ sample }: Readonly<{ sample: Sample }>) {
  const { t } = useLocale();
  const name = typeof sample.response.name === "string" ? sample.response.name : "";
  const nameSystem = `${name} System`;
  return (
    <div className="guide-example guide-form-example" inert>
      <dialog className="mission-dialog station-dialog" open>
        <div className="dialog-heading">
          <div>
            <h2>{t("stations.add_station")}</h2>
          </div>
        </div>
        <form className="station-add-form">
          <label className="field station-galaxy-select">
            <span>{t("stations.galaxy")}</span>
            <select defaultValue={sample.galaxy} disabled>
              <option value={sample.galaxy}>{galaxyLabel(sample.galaxy)}</option>
            </select>
          </label>
          <div className="portal-field full-field">
            <div className="portal-field-heading">
              <span>
                {t("stations.system_portal_code")} <b>{sample.portal.length}/12</b>
              </span>
              <span>{t("stations.nms_glyphs_hex_address")}</span>
            </div>
            <GlyphStrip address={sample.portal} large />
            <div className="address-input-row">
              <input readOnly value={sample.portal} />
            </div>
          </div>
          <label className="field full-field station-name-field">
            <span>
              {t("stations.station_name")} <small>{t("common.editable_max_80_characters")}</small>
            </span>
            <input readOnly value={nameSystem} />
          </label>
          <label className="field full-field">
            <span>
              {t("stations.station_notes")} <small>{t("stations.optional_max_1000_characters")}</small>
            </span>
            <textarea readOnly rows={3} value="" />
          </label>
          <div className="dialog-actions">
            <span className="action-spacer" />
            <button className="quiet-button" type="button">
              {t("common.cancel")}
            </button>
            <button className="primary-button" type="button">
              {t("common.add")}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
