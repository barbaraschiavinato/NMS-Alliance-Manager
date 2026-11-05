"use client";

import { RotateCcw, X } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import {
  petActivities,
  petClassGrades,
  petClassKeys,
  petHabitats,
  petRarities,
  petTypes,
  type PetFilterValues,
} from "@/lib/pets/pets";

type FilterKey = keyof PetFilterValues;
type ChangeHandler = (key: FilterKey, value: string) => void;

const enumFilters = [
  { key: "petType", label: "pets.pet_type", all: "pets.all_types", prefix: "pets.type_", options: petTypes },
  {
    key: "activity",
    label: "pets.activity",
    all: "pets.all_activities",
    prefix: "pets.activity_",
    options: petActivities,
  },
  { key: "habitat", label: "pets.habitat", all: "pets.all_habitats", prefix: "pets.habitat_", options: petHabitats },
  { key: "rarity", label: "pets.rarity", all: "pets.all_rarities", prefix: "pets.rarity_", options: petRarities },
] as const;

export function PetFilters({ values, onChange }: Readonly<{ values: PetFilterValues; onChange: ChangeHandler }>) {
  const { t } = useLocale();
  const filterLabel = (label: string) => t("pets.filter_by", { field: t(label) });

  return (
    <div className="planet-controls pet-controls" id="pet-filters-panel">
      {enumFilters.map(({ key, label, all, prefix, options }) => (
        <label className="planet-filter" key={key}>
          <span>{t(label)}</span>
          <select
            aria-label={filterLabel(label)}
            onChange={(event) => onChange(key, event.target.value)}
            value={values[key]}
          >
            <option value="">{t(all)}</option>
            {options.map((value) => (
              <option key={value} value={value}>
                {t(`${prefix}${value}`)}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className="planet-filter">
        <span>{t("pets.egg_trade")}</span>
        <select
          aria-label={filterLabel("pets.egg_trade")}
          onChange={(event) => onChange("eggTrade", event.target.value)}
          value={values.eggTrade}
        >
          <option value="">{t("pets.all_egg_trade")}</option>
          <option value="yes">{t("pets.egg_trade_yes")}</option>
          <option value="no">{t("pets.egg_trade_no")}</option>
        </select>
      </label>
      {petClassKeys.map((key) => (
        <label className="planet-filter" key={key}>
          <span>{t(`pets.${key}`)}</span>
          <select
            aria-label={filterLabel(`pets.${key}`)}
            onChange={(event) => onChange(key, event.target.value)}
            value={values[key]}
          >
            <option value="">{t("pets.all_grades")}</option>
            {petClassGrades.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

export function PetActiveFilters({
  values,
  onChange,
  onReset,
}: Readonly<{ values: PetFilterValues; onChange: ChangeHandler; onReset: () => void }>) {
  const { t } = useLocale();
  const tags = [
    ...enumFilters.flatMap(({ key, label, prefix }) =>
      values[key] ? [{ key, label: `${t(label)}: ${t(`${prefix}${values[key]}`)}` }] : [],
    ),
    ...(values.eggTrade
      ? [{ key: "eggTrade" as const, label: `${t("pets.egg_trade")}: ${t(`pets.egg_trade_${values.eggTrade}`)}` }]
      : []),
    ...petClassKeys.flatMap((key) => (values[key] ? [{ key, label: `${t(`pets.${key}`)}: ${values[key]}` }] : [])),
  ];

  if (tags.length === 0) return null;

  return (
    <div className="planet-active-filters">
      {tags.map((tag) => (
        <span className="planet-filter-tag" key={tag.key}>
          {tag.label}
          <button
            aria-label={`${t("planet.remove_filter")}: ${tag.label}`}
            onClick={() => onChange(tag.key, "")}
            type="button"
          >
            <X aria-hidden="true" size={11} />
          </button>
        </span>
      ))}
      <button
        aria-label={t("planet.reset_filters")}
        className="planet-reset-filters"
        data-tooltip={t("planet.reset_filters")}
        onClick={onReset}
        type="button"
      >
        <RotateCcw aria-hidden="true" size={14} />
      </button>
    </div>
  );
}
