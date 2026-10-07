import { translations as englishTranslations } from "@/lib/translations/en";
import { aliases as italianAliases, translations as italianTranslations } from "@/lib/translations/it";

export type Locale = "it" | "en";

export type TranslationNamespace =
  | "common"
  | "navigation"
  | "missions"
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

const englishKeys = new Set(Object.keys(localeEntries.en).concat(Object.keys(localeEntries.it)));
const legacyAliases = new Map<string, string>([
  ...Object.entries(localeEntries.it).map(([english, italian]) => [italian, english] as const),
  ...Object.entries(italianAliases),
]);

export function translate(locale: Locale, message: string, values?: Readonly<Record<string, string | number>>) {
  const canonicalKey = englishKeys.has(message) ? message : legacyAliases.get(message) ?? message;
  let translated = localeEntries[locale][canonicalKey] ?? canonicalKey;
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
