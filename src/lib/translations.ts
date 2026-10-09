import { translations as englishTranslations } from "@/lib/translations/en";
import { almanacValueTranslations } from "@/lib/translations/almanac-values";
import { aliases as italianAliases, translations as italianTranslations } from "@/lib/translations/it";

export type Locale = "it" | "en";

export type TranslationNamespace =
  | "common"
  | "navigation"
  | "missions"
  | "messages"
  | "stations"
  | "members"
  | "profile"
  | "admin"
  | "planet"
  | "auth"
  | "system"
  | "errors";

export type TranslationCatalog = Readonly<Partial<Record<TranslationNamespace, Readonly<Record<string, string>>>>>;

type LocaleCatalog = Readonly<Record<string, string>>;
type LocaleModule = Readonly<{ translations: TranslationCatalog; aliases?: Readonly<Record<string, string>> }>;

const localeModules: Record<Locale, LocaleModule> = {
  en: { translations: englishTranslations },
  it: { translations: italianTranslations, aliases: italianAliases },
};

const localeEntries = Object.fromEntries(
  Object.entries(localeModules).map(([locale, module]) => [
    locale,
    Object.assign({}, ...Object.values(module.translations)),
  ]),
) as Record<Locale, LocaleCatalog>;

const translationIds = new Set(Object.keys(localeEntries.en).concat(Object.keys(localeEntries.it)));
const legacyAliases = new Map<string, string>([
  ...Object.entries(localeEntries.en).map(([id, english]) => [english, id] as const),
  ...Object.entries(localeEntries.it).map(([id, italian]) => [italian, id] as const),
  ...Object.entries(italianAliases),
  ["station_claimed", "system.station_claimed"],
  ["mapped", "system.mapped"],
  ["planets_classified", "system.planets_classified"],
  ["bases_uploaded", "system.bases_uploaded"],
  ["buildings_built", "system.buildings_built"],
  ["renamed", "system.renamed"],
  ["data_uploaded", "system.data_uploaded"],
  ["data_error", "system.data_error"],
]);

export function translateAlmanacValue(locale: Locale, value: string) {
  return Object.hasOwn(almanacValueTranslations[locale], value) ? almanacValueTranslations[locale][value] : value;
}

export function translate(locale: Locale, message: string, values?: Readonly<Record<string, string | number>>) {
  const canonicalKey = translationIds.has(message) ? message : legacyAliases.get(message) ?? message;
  let translated = localeEntries[locale][canonicalKey] ?? message;
  const planetIndex = message.match(/^Planet index (\d+): allowed range is 0–6\.$/)
    ?? message.match(/^Indice pianeta (\d+): ammessi da 0 a 6\.$/);
  const coordinate = message.match(/^([XYZ]) coordinate ([\dA-F]+): unused value\.$/)
    ?? message.match(/^Coordinata ([XYZ]) ([\dA-F]+): valore non utilizzato\.$/);
  if (planetIndex) {
    translated = locale === "it"
      ? `Indice pianeta ${planetIndex[1]}: ammessi da 0 a 6.`
      : `Planet index ${planetIndex[1]}: allowed range is 0–6.`;
  } else if (coordinate) {
    translated = locale === "it"
      ? `Coordinata ${coordinate[1]} ${coordinate[2]}: valore non utilizzato.`
      : `${coordinate[1]} coordinate ${coordinate[2]}: unused value.`;
  }
  return values
    ? translated.replace(/\{(\w+)\}/g, (placeholder, key: string) => String(values[key] ?? placeholder))
    : translated;
}
