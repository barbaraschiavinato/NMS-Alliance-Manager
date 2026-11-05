"use client";

import { ImagePlus, Search, Send, SlidersHorizontal } from "lucide-react";
import { HeroAddButton } from "@/components/layout/hero";
import { PetCard, type PetEntry } from "@/components/cards/pet-card";
import { GlyphStrip } from "@/components/shared/portal-address-field";
import { PetTypeIcon } from "@/components/shared/pet-type-icon";
import { useLocale } from "@/components/providers/locale-provider";
import { galaxyLabel } from "@/lib/planets/galaxies";
import { petClassKeys } from "@/lib/pets/pets";

const noop = () => undefined;

const petExample: PetEntry = {
  id: "guide-pet",
  name: "Pelo di Brina",
  petType: "frost",
  activity: "nocturnal",
  habitat: "mountain",
  rarity: "rare",
  eggTradeAvailable: true,
  classes: { combat: "S", agility: "A", health: "B" },
  portal: "1234F5E6D7C8",
  galaxy: 0,
  planetName: "Ardente Prime",
  coordinates: "+12.34, -56.78",
  note: "Trovato vicino al lago ghiacciato: scambio volentieri le uova.",
  ownerId: "guide-member",
  ownerName: "Viaggiatore",
  createdAt: "2026-01-01T00:00:00.000Z",
  stationHref: "/stations",
  canMessageOwner: true,
  canManage: true,
};

function PetFormExample() {
  const { t } = useLocale();
  return (
    <div className="guide-form-example" inert>
      <dialog className="mission-dialog station-dialog pet-dialog" open>
        <div className="dialog-heading">
          <div>
            <h2>{t("pets.add_pet")}</h2>
          </div>
        </div>
        <form className="station-add-form pet-form">
          <label className="field full-field">
            <span>
              {t("pets.pet_name")} <small>{t("farms.max_80_characters")}</small>
            </span>
            <input readOnly value={petExample.name} />
          </label>
          <div className="pet-field-row full-field">
            {petClassKeys.map((key) => (
              <label className="field" key={key}>
                <span>{t(`pets.${key}`)}</span>
                <select defaultValue={petExample.classes[key]} disabled>
                  <option value={petExample.classes[key]}>{petExample.classes[key]}</option>
                </select>
              </label>
            ))}
          </div>
          <div className="pet-field-row full-field">
            <label className="field">
              <span>
                {t("pets.pet_type")}
                <PetTypeIcon size={16} type={petExample.petType} />
              </span>
              <select defaultValue={petExample.petType} disabled>
                <option value={petExample.petType}>{t(`pets.type_${petExample.petType}`)}</option>
              </select>
            </label>
            <label className="pet-toggle-field">
              <span>{t("pets.egg_trade")}</span>
              <div className="pet-toggle">
                <input aria-label={t("pets.egg_trade")} checked readOnly role="switch" type="checkbox" />
                <strong>{t("pets.egg_trade_yes")}</strong>
              </div>
            </label>
          </div>
          <div className="pet-field-row full-field">
            {[
              ["pets.activity", `pets.activity_${petExample.activity}`],
              ["pets.habitat", `pets.habitat_${petExample.habitat}`],
              ["pets.rarity", `pets.rarity_${petExample.rarity}`],
            ].map(([label, value]) => (
              <label className="field" key={label}>
                <span>{t(label)}</span>
                <select defaultValue={value} disabled>
                  <option value={value}>{t(value)}</option>
                </select>
              </label>
            ))}
          </div>
          <div className="upload-field full-field pet-image-field">
            <span>
              {t("pets.image")} <small>{t("pets.image_hint")}</small>
            </span>
            <span className="image-preview pet-image-preview pet-image-preview-empty">
              <ImagePlus aria-hidden="true" size={20} />
            </span>
          </div>
          <label className="field full-field">
            <span>
              {t("pets.notes")} <small>{t("stations.optional_max_1000_characters")}</small>
            </span>
            <textarea readOnly rows={3} value={petExample.note} />
          </label>
          <label className="field station-galaxy-select">
            <span>{t("stations.galaxy")}</span>
            <select defaultValue={petExample.galaxy} disabled>
              <option value={petExample.galaxy}>{galaxyLabel(petExample.galaxy)}</option>
            </select>
          </label>
          <div className="portal-field full-field">
            <div className="portal-field-heading">
              <span>
                {t("stations.system_portal_code")} <b>{petExample.portal.length}/12</b>
              </span>
              <span>{t("stations.nms_glyphs_hex_address")}</span>
            </div>
            <GlyphStrip address={petExample.portal} large />
            <div className="address-input-row">
              <input readOnly value={petExample.portal} />
            </div>
          </div>
          <label className="field full-field">
            <span>
              {t("farms.planet_name")} <small>{t("farms.planet_name_hint")}</small>
            </span>
            <input readOnly value={petExample.planetName} />
          </label>
          <label className="field full-field">
            <span>
              {t("farms.coordinates")} <small>{t("farms.coordinates_hint")}</small>
            </span>
            <input readOnly value={petExample.coordinates} />
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

function PetMessageExample() {
  const { t } = useLocale();
  return (
    <div className="mission-dialog member-card-dialog guide-message-form-example" inert>
      <div className="dialog-heading">
        <div>
          <h2>{t("pets.message_discoverer")}</h2>
        </div>
      </div>
      <div className="member-message-form">
        <p>{t("profile.message_recipient", { recipient: petExample.ownerName })}</p>
        <p className="member-message-subject">
          <strong>{t("profile.message_subject")}</strong>
          {petExample.name}
        </p>
        <label className="field">
          <span>{t("profile.message_text")}</span>
          <textarea readOnly rows={3} value="Ciao! Ti va di scambiare un uovo con me?" />
        </label>
        <label className="message-acknowledgement">
          <input checked readOnly type="checkbox" />
          <span>{t("messages.pet_only_notice")}</span>
        </label>
        <div className="dialog-actions">
          <button className="quiet-button" type="button">
            {t("common.cancel")}
          </button>
          <button className="primary-button" type="button">
            {t("profile.send_message")}
            <Send aria-hidden="true" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function PetExamples() {
  return (
    <div className="guide-pet-examples">
      <figure className="guide-example">
        <figcaption>Aggiungi un pet</figcaption>
        <div className="guide-add-station-button-example" inert>
          <HeroAddButton label="pets.add_pet" onClick={noop} />
        </div>
      </figure>
      <figure className="guide-example">
        <figcaption>Modulo per aggiungere un pet</figcaption>
        <PetFormExample />
      </figure>
      <figure className="guide-example">
        <figcaption>Ricerca e filtri</figcaption>
        <div className="guide-pet-toolbar-example" inert>
          <label className="search-field member-search station-search">
            <Search size={15} />
            <input placeholder="Cerca pet" readOnly value="" />
          </label>
          <button aria-expanded="true" aria-label="Filtri" className="planet-filters-toggle" data-active type="button">
            <SlidersHorizontal aria-hidden="true" size={14} />
          </button>
        </div>
        <div className="planet-controls guide-pet-filters-example" inert>
          <label className="planet-filter">
            <span>Tipo di pet</span>
            <select defaultValue="frost">
              <option value="">Tutti i tipi</option>
              <option value="frost">Gelo</option>
            </select>
          </label>
          <label className="planet-filter">
            <span>Rarità</span>
            <select defaultValue="">
              <option value="">Tutte le rarità</option>
            </select>
          </label>
        </div>
      </figure>
      <figure className="guide-example">
        <figcaption>
          Un pet: tipo, classi, scopritore con il pulsante dell&apos;uovo, glifi, coordinate e note; in basso la
          stazione del sistema, modifica ed eliminazione
        </figcaption>
        <ul className="pet-list guide-pet-card-example" inert>
          <PetCard
            currentMemberId="guide-viewer"
            hideDetailLink
            onEdit={noop}
            onMessageOwner={noop}
            onRemove={noop}
            pet={petExample}
          />
        </ul>
      </figure>
      <figure className="guide-example">
        <figcaption>Messaggio allo scopritore per lo scambio uova</figcaption>
        <PetMessageExample />
      </figure>
    </div>
  );
}
