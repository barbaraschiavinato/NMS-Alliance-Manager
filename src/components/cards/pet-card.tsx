"use client";

import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Egg, FileText, MapPin, Orbit, Pencil, Trash2 } from "lucide-react";
import { DetailLink } from "@/components/shared/detail-page";
import { GlyphStrip } from "@/components/shared/portal-address-field";
import { PetImageDialog } from "@/components/modals/pet-image-dialog";
import { PetTypeIcon } from "@/components/shared/pet-type-icon";
import { MemberProfileLink } from "@/components/shared/member-profile-link";
import { GalaxyLabel } from "@/components/cards/station-card/parts";
import { useLocale } from "@/components/providers/locale-provider";
import { petTypeIcons } from "@/lib/pets/pet-type-icons";
import { petClassColors, petClassKeys, type Pet } from "@/lib/pets/pets";
import { petDetailHref, type DetailOrigin } from "@/lib/navigation/detail-links";

export type PetEntry = Omit<Pet, "imagePath"> &
  Readonly<{
    imageUrl?: string;
    stationHref?: string;
    ownerName: string;
    ownerMemberId?: string;
    // Egg trade is available and the discoverer is a real member other than the viewer.
    canMessageOwner?: boolean;
    canManage: boolean;
  }>;

export function PetCard({
  pet,
  currentMemberId,
  onEdit,
  onRemove,
  hideStationLink = false,
  hideDetailLink = false,
  detailOrigin,
  onMessageOwner,
}: Readonly<{
  pet: PetEntry;
  currentMemberId: string;
  // Without both handlers the card is read-only, even for pets the member can manage.
  onEdit?: (pet: PetEntry) => void;
  onRemove?: (pet: PetEntry) => void;
  hideStationLink?: boolean;
  hideDetailLink?: boolean;
  detailOrigin?: DetailOrigin;
  // Opens the egg trade message to the discoverer; without it the egg is only an indicator.
  onMessageOwner?: (pet: PetEntry) => void;
}>) {
  const { t } = useLocale();
  const [imageOpen, setImageOpen] = useState(false);
  const stationHref = hideStationLink ? undefined : pet.stationHref;
  const actions = pet.canManage && onEdit && onRemove ? { onEdit, onRemove } : null;
  // Unknown values are left out of the card.
  const traits = [
    pet.activity !== "unknown" && t(`pets.activity_${pet.activity}`),
    pet.habitat !== "unknown" && t(`pets.habitat_${pet.habitat}`),
    pet.rarity !== "unknown" && t(`pets.rarity_${pet.rarity}`),
  ].filter((trait): trait is string => Boolean(trait));

  return (
    <li className="pet-card">
      <div className="pet-card-heading">
        {pet.imageUrl && (
          <button
            aria-label={t("pets.enlarge_image", { name: pet.name })}
            className="pet-card-image-button"
            data-tooltip={t("pets.enlarge_image", { name: pet.name })}
            onClick={() => setImageOpen(true)}
            type="button"
          >
            <Image alt="" className="pet-card-image" height={112} src={pet.imageUrl} unoptimized width={112} />
          </button>
        )}
        <span className="pet-card-title-copy">
          <GalaxyLabel galaxy={pet.galaxy} />
          {hideDetailLink ? (
            <strong className="pet-card-title">{pet.name}</strong>
          ) : (
            <DetailLink className="pet-card-title" href={petDetailHref(pet.id, detailOrigin)} prefetch={false}>
              {pet.name}
            </DetailLink>
          )}
          <span className="pet-card-planet">{pet.planetName}</span>
          <code>{pet.portal}</code>
        </span>
        <span className="pet-card-owner">
          <small>{t("pets.discoverer")}</small>
          <span className="pet-card-owner-line">
            <MemberProfileLink
              current={pet.ownerId === currentMemberId}
              memberId={pet.ownerMemberId}
              name={pet.ownerId === null ? t("pets.unassigned") : pet.ownerName || t("pets.former_member")}
            />
            {pet.eggTradeAvailable &&
              (pet.canMessageOwner && onMessageOwner ? (
                <button
                  aria-label={t("pets.message_discoverer_named", { name: pet.ownerName })}
                  className="member-icon-action pet-card-egg-button"
                  data-tooltip={t("pets.message_discoverer")}
                  onClick={() => onMessageOwner(pet)}
                  type="button"
                >
                  <Egg aria-hidden="true" size={15} />
                </button>
              ) : (
                <span
                  aria-label={t("pets.egg_trade")}
                  className="pet-card-egg-indicator"
                  data-tooltip={t("pets.egg_trade")}
                  role="img"
                >
                  <Egg aria-hidden="true" size={13} />
                </span>
              ))}
          </span>
        </span>
      </div>
      <div className="pet-card-glyphs">
        <GlyphStrip address={pet.portal} />
      </div>
      <ul aria-label={t("pets.classes")} className="pet-card-classes">
        {petClassKeys.map((key) => (
          <li
            data-grade={pet.classes[key]}
            key={key}
            style={{ "--pet-grade-color": petClassColors[pet.classes[key]] } as CSSProperties}
          >
            <span>{t(`pets.${key}`)}</span>
            <strong>{pet.classes[key]}</strong>
          </li>
        ))}
      </ul>
      <ul aria-label={t("pets.traits")} className="pet-card-traits">
        <li className="pet-card-type" style={{ "--pet-type-color": petTypeIcons[pet.petType].color } as CSSProperties}>
          <PetTypeIcon size={13} type={pet.petType} />
          {t(`pets.type_${pet.petType}`)}
        </li>
        {traits.map((trait, index) => (
          <li key={index}>{trait}</li>
        ))}
      </ul>
      {pet.coordinates && (
        <p className="pet-card-coordinates">
          <MapPin aria-hidden="true" size={12} />
          <span>{t("farms.coordinates")}:</span> <code>{pet.coordinates}</code>
        </p>
      )}
      {pet.note && (
        <div className="pet-card-note">
          <span className="pet-card-label">
            <FileText aria-hidden="true" size={12} />
            {t("pets.notes")}
          </span>
          <p>{pet.note}</p>
        </div>
      )}
      {(stationHref || actions) && (
        <div className="station-card-footer pet-card-footer">
          <span />
          <div className="station-actions">
            {stationHref && (
              <DetailLink
                aria-label={t("missions.open_linked_station")}
                className="member-icon-action member-station-filter"
                data-tooltip={t("missions.open_linked_station")}
                href={stationHref}
                prefetch={false}
              >
                <Orbit aria-hidden="true" size={14} />
              </DetailLink>
            )}
            {actions && (
              <>
                <button
                  aria-label={t("pets.edit_pet_named", { pet: pet.name })}
                  className="member-icon-action"
                  data-tooltip={t("pets.edit_pet")}
                  onClick={() => actions.onEdit(pet)}
                  type="button"
                >
                  <Pencil size={14} />
                </button>
                <button
                  aria-label={t("pets.delete_pet_named", { pet: pet.name })}
                  className="member-icon-action delete-member"
                  data-tooltip={t("pets.delete_pet")}
                  onClick={() => actions.onRemove(pet)}
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {imageOpen &&
        pet.imageUrl &&
        createPortal(
          <PetImageDialog imageUrl={pet.imageUrl} name={pet.name} onClose={() => setImageOpen(false)} />,
          document.body,
        )}
    </li>
  );
}
