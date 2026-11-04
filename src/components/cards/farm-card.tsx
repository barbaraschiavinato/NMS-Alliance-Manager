"use client";

import Image from "next/image";
import { FileText, MapPin, Orbit, Pencil, Sprout, Trash2, Pickaxe } from "lucide-react";
import { DetailLink } from "@/components/shared/detail-page";
import { GlyphStrip } from "@/components/shared/portal-address-field";
import { MemberProfileLink } from "@/components/shared/member-profile-link";
import { GalaxyLabel } from "@/components/cards/station-card/parts";
import { useLocale } from "@/components/providers/locale-provider";
import { isFarmPlant, type Farm } from "@/lib/farms/farms";
import { farmDetailHref, type DetailOrigin } from "@/lib/navigation/detail-links";

export type FarmEntry = Farm &
  Readonly<{
    ownerName: string;
    ownerMemberId?: string;
    planetImageUrl?: string;
    stationHref?: string;
    canManage: boolean;
  }>;

export function FarmCard({
  farm,
  currentMemberId,
  onEdit,
  onRemove,
  hideDetailLink = false,
  detailOrigin,
  hideStationLink = false,
}: Readonly<{
  farm: FarmEntry;
  currentMemberId: string;
  // Without both handlers the card is read-only, even for farms the member can manage.
  onEdit?: (farm: FarmEntry) => void;
  onRemove?: (farm: FarmEntry) => void;
  hideDetailLink?: boolean;
  detailOrigin?: DetailOrigin;
  hideStationLink?: boolean;
}>) {
  const stationHref = hideStationLink ? undefined : farm.stationHref;
  const actions = farm.canManage && onEdit && onRemove ? { onEdit, onRemove } : null;
  const { t, tv } = useLocale();
  const materials = farm.resources.filter((resource) => !isFarmPlant(resource));
  const plants = farm.resources.filter((resource) => isFarmPlant(resource));
  const resourceGroups = [
    { key: "materials", title: "farms.materials", items: materials, Icon: Pickaxe },
    { key: "plants", title: "farms.plants", items: plants, Icon: Sprout },
  ].filter((group) => group.items.length > 0);

  return (
    <li className="farm-card">
      <div className="farm-card-heading">
        {farm.planetImageUrl && (
          <Image
            alt=""
            className="station-card-planet-image"
            height={112}
            src={farm.planetImageUrl}
            unoptimized
            width={112}
          />
        )}
        <span className="farm-card-title-copy">
          <GalaxyLabel galaxy={farm.galaxy} />
          {hideDetailLink ? (
            <strong className="farm-card-title">{farm.name}</strong>
          ) : (
            <DetailLink className="farm-card-title" href={farmDetailHref(farm.id, detailOrigin)} prefetch={false}>
              {farm.name}
            </DetailLink>
          )}
          {farm.systemName && (
            <span className="farm-card-system">
              {t("system.system_label")}: {farm.systemName}
            </span>
          )}
          <span className="farm-card-planet">{farm.planetName}</span>
          <code>{farm.portal}</code>
        </span>
        <span className="farm-card-owner">
          <small>{t("farms.owner")}</small>
          <MemberProfileLink
            current={farm.ownerId === currentMemberId}
            memberId={farm.ownerMemberId}
            name={farm.ownerId === null ? t("farms.unassigned") : farm.ownerName || t("farms.former_member")}
          />
        </span>
      </div>
      <div className="farm-card-glyphs">
        <GlyphStrip address={farm.portal} />
      </div>
      {resourceGroups.map(({ key, title, items, Icon }) => (
        <div className={`farm-card-resources farm-card-resources-${key}`} key={key}>
          <span className="farm-card-label">
            <Icon aria-hidden="true" size={12} />
            {t(title)}
          </span>
          <ul aria-label={t(title)}>
            {items.map((resource) => (
              <li key={resource}>{tv(resource)}</li>
            ))}
          </ul>
        </div>
      ))}
      {farm.coordinates && (
        <p className="farm-card-coordinates">
          <MapPin aria-hidden="true" size={12} />
          <span>{t("farms.coordinates")}:</span> <code>{farm.coordinates}</code>
        </p>
      )}
      {farm.note && (
        <div className="farm-card-note">
          <span className="farm-card-label">
            <FileText aria-hidden="true" size={12} />
            {t("farms.notes")}
          </span>
          <p>{farm.note}</p>
        </div>
      )}
      {(stationHref || actions) && (
        <div className="station-card-footer farm-card-footer">
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
                  aria-label={t("farms.edit_farm_named", { farm: farm.name })}
                  className="member-icon-action"
                  data-tooltip={t("farms.edit_farm")}
                  onClick={() => actions.onEdit(farm)}
                  type="button"
                >
                  <Pencil size={14} />
                </button>
                <button
                  aria-label={t("farms.delete_farm_named", { farm: farm.name })}
                  className="member-icon-action delete-member"
                  data-tooltip={t("farms.delete_farm")}
                  onClick={() => actions.onRemove(farm)}
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
