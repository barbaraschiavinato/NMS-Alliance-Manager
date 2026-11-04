"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { HeroAddButton } from "@/components/layout/hero";
import { FarmCard, type FarmEntry } from "@/components/cards/farm-card";
import { GlyphStrip } from "@/components/shared/portal-address-field";
import { useLocale } from "@/components/providers/locale-provider";
import { galaxyLabel } from "@/lib/planets/galaxies";
import { plantResourceLabel, plantResourceProduct } from "@/lib/planets/plant-products";

const noop = () => undefined;

const farmExample: FarmEntry = {
  id: "guide-farm",
  name: "Serra di Solanium",
  portal: "1234F5E6D7C8",
  galaxy: 0,
  systemName: "Sistema Esempio",
  planetName: "Ardente Prime",
  resources: ["Copper", "Activated Copper", "Solanium", "Frost Crystal"],
  coordinates: "+12.34, -56.78",
  note: "Raccoglitori automatici vicino all'avamposto; prendi pure il Solanium in eccesso.",
  ownerId: "guide-member",
  ownerName: "Viaggiatore",
  createdAt: "2026-01-01T00:00:00.000Z",
  stationHref: "/stations",
  canManage: true,
};

const formMaterials = ["Copper", "Activated Copper"] as const;
const formPlants = ["Solanium", "Frost Crystal"] as const;

function FarmFormExample() {
  const { t, tv } = useLocale();
  return (
    <div className="guide-form-example" inert>
      <dialog className="mission-dialog station-dialog farm-dialog" open>
        <div className="dialog-heading">
          <div>
            <h2>{t("farms.add_farm")}</h2>
          </div>
        </div>
        <form className="station-add-form farm-form">
          <label className="field full-field">
            <span>
              {t("farms.farm_name")} <small>{t("farms.max_80_characters")}</small>
            </span>
            <input readOnly value={farmExample.name} />
          </label>
          <label className="field station-galaxy-select">
            <span>{t("stations.galaxy")}</span>
            <select defaultValue={farmExample.galaxy} disabled>
              <option value={farmExample.galaxy}>{galaxyLabel(farmExample.galaxy)}</option>
            </select>
          </label>
          <div className="portal-field full-field">
            <div className="portal-field-heading">
              <span>
                {t("stations.system_portal_code")} <b>{farmExample.portal.length}/12</b>
              </span>
              <span>{t("stations.nms_glyphs_hex_address")}</span>
            </div>
            <GlyphStrip address={farmExample.portal} large />
            <div className="address-input-row">
              <input readOnly value={farmExample.portal} />
            </div>
          </div>
          <label className="field full-field">
            <span>
              {t("farms.system_name")} <small>{t("farms.system_name_hint")}</small>
            </span>
            <input readOnly value={farmExample.systemName} />
          </label>
          <label className="field full-field">
            <span>
              {t("farms.planet_name")} <small>{t("farms.planet_name_hint")}</small>
            </span>
            <input readOnly value={farmExample.planetName} />
          </label>
          <fieldset className="farm-resource-picker full-field">
            <legend>
              {t("farms.resources")} <small>{t("farms.selected_count", { count: farmExample.resources.length })}</small>
            </legend>
            <div className="farm-resource-groups">
              {[
                { key: "materials", title: "farms.materials", items: formMaterials },
                { key: "plants", title: "farms.plants", items: formPlants },
              ].map((group) => (
                <div className={`farm-resource-group farm-resource-group-${group.key}`} key={group.key}>
                  <strong>{t(group.title)}</strong>
                  <div className="platform-options farm-resource-options">
                    {group.items.map((resource) => (
                      <label className="platform-option" key={resource}>
                        <input checked readOnly type="checkbox" />
                        <span>{tv(group.key === "plants" ? plantResourceProduct(resource) : resource)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
          <label className="field full-field">
            <span>
              {t("farms.coordinates")} <small>{t("farms.coordinates_hint")}</small>
            </span>
            <input readOnly value={farmExample.coordinates} />
          </label>
          <label className="field full-field">
            <span>
              {t("farms.notes")} <small>{t("stations.optional_max_1000_characters")}</small>
            </span>
            <textarea readOnly rows={3} value={farmExample.note} />
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

export function FarmExamples() {
  const { tv } = useLocale();
  return (
    <div className="guide-farm-examples">
      <figure className="guide-example">
        <figcaption>Aggiungi una farm</figcaption>
        <div className="guide-add-station-button-example" inert>
          <HeroAddButton label="farms.add_farm" onClick={noop} />
        </div>
      </figure>
      <figure className="guide-example">
        <figcaption>Modulo per aggiungere una farm</figcaption>
        <FarmFormExample />
      </figure>
      <figure className="guide-example">
        <figcaption>Ricerca e filtri per piante e materiali</figcaption>
        <div className="guide-farm-toolbar-example" inert>
          <label className="search-field member-search station-search">
            <Search size={15} />
            <input placeholder="Cerca farm" readOnly value="" />
          </label>
          <button aria-expanded="true" aria-label="Filtri" className="planet-filters-toggle" data-active type="button">
            <SlidersHorizontal aria-hidden="true" size={14} />
          </button>
        </div>
        <div className="planet-controls guide-farm-filters-example" inert>
          <label className="planet-filter">
            <span>Piante</span>
            <select defaultValue="Solanium">
              <option value="">Tutte le piante</option>
              <option value="Solanium">{plantResourceLabel("Solanium", tv)}</option>
            </select>
          </label>
          <label className="planet-filter">
            <span>Materiali</span>
            <select defaultValue="">
              <option value="">Tutti i materiali</option>
            </select>
          </label>
        </div>
      </figure>
      <figure className="guide-example">
        <figcaption>
          Una farm: proprietario, glifi, materiali, piante, coordinate e note; in basso la stazione del sistema,
          modifica ed eliminazione
        </figcaption>
        <ul className="farm-list guide-farm-card-example" inert>
          <FarmCard currentMemberId="guide-member" farm={farmExample} hideDetailLink onEdit={noop} onRemove={noop} />
        </ul>
      </figure>
    </div>
  );
}
