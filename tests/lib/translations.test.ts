import { describe, expect, it } from "vitest";
import { translate, translateAlmanacValue, type TranslationCatalog } from "@/lib/translations";
import { almanacValueTranslations } from "@/lib/translations/almanac-values";
import { translations as en } from "@/lib/translations/en";
import { aliases, translations as it_ } from "@/lib/translations/it";

function flatten(catalog: TranslationCatalog): Record<string, string> {
  return Object.assign({}, ...Object.values(catalog));
}

const enEntries = flatten(en);
const itEntries = flatten(it_);
const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

describe("catalog consistency", () => {
  it("uses the same namespaces and keys in both locales", () => {
    expect(Object.keys(it_)).toEqual(Object.keys(en));
    for (const namespace of Object.keys(en) as (keyof TranslationCatalog)[]) {
      expect(Object.keys(it_[namespace] ?? {}).sort(), namespace).toEqual(Object.keys(en[namespace] ?? {}).sort());
    }
  });

  it("does not define a key in more than one namespace", () => {
    const keys = Object.values(en).flatMap((entries) => Object.keys(entries ?? {}));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses dotted ids as keys", () => {
    for (const key of Object.keys(enEntries)) expect(key).toMatch(/^[a-z_]+\.[a-z0-9_]+$/);
  });

  it("has non-empty translations with matching placeholders", () => {
    for (const [key, english] of Object.entries(enEntries)) {
      expect(english.trim(), key).not.toBe("");
      expect(itEntries[key].trim(), key).not.toBe("");
      expect(placeholders(itEntries[key]), key).toEqual(placeholders(english));
    }
  });

  it("points every Italian alias to an existing key", () => {
    for (const [alias, key] of Object.entries(aliases)) {
      expect(enEntries, alias).toHaveProperty([key]);
      expect(itEntries).not.toHaveProperty([alias]);
    }
  });
});

describe("translate", () => {
  it("translates ids into each locale", () => {
    expect(translate("en", "common.cancel")).toBe("Cancel");
    expect(translate("it", "common.cancel")).toBe("Annulla");
  });

  it("maps legacy English and Italian strings back to their id", () => {
    expect(translate("it", "Cancel")).toBe("Annulla");
    expect(translate("en", "Annulla")).toBe("Cancel");
    expect(translate("en", "Moderatore")).toBe("Moderator");
  });

  it("resolves explicit Italian aliases", () => {
    expect(translate("en", "Da scegliere")).toBe(enEntries["common.not_selected"]);
    expect(translate("en", "Non assegnate")).toBe(enEntries["missions.unassigned_label"]);
    expect(translate("en", "Tutte")).toBe(enEntries["common.all"]);
  });

  it("maps raw system status values", () => {
    for (const status of [
      "station_claimed",
      "mapped",
      "planets_classified",
      "bases_uploaded",
      "buildings_built",
      "renamed",
      "data_uploaded",
      "data_error",
    ]) {
      expect(translate("en", status)).toBe(enEntries[`system.${status}`]);
      expect(translate("it", status)).toBe(itEntries[`system.${status}`]);
    }
  });

  it("falls back to the message itself", () => {
    expect(translate("it", "Something never translated")).toBe("Something never translated");
    expect(translate("en", "missing.key")).toBe("missing.key");
  });

  it("interpolates placeholders and leaves unknown ones untouched", () => {
    expect(translate("en", "common.of_total_completed", { total: 5 })).toBe("of 5 completed");
    expect(translate("it", "Hello {name}, {missing}", { name: "Ada" })).toBe("Hello Ada, {missing}");
    expect(translate("en", "{n} items", { n: 0 })).toBe("0 items");
  });

  it("translates dynamic portal validation errors in both directions", () => {
    expect(translate("it", "Planet index 9: allowed range is 0–6.")).toBe("Indice pianeta 9: ammessi da 0 a 6.");
    expect(translate("en", "Indice pianeta 9: ammessi da 0 a 6.")).toBe("Planet index 9: allowed range is 0–6.");
    expect(translate("it", "Z coordinate 800: unused value.")).toBe("Coordinata Z 800: valore non utilizzato.");
    expect(translate("en", "Coordinata X 000: valore non utilizzato.")).toBe("X coordinate 000: unused value.");
    expect(translate("en", "Y coordinate 80: unused value.")).toBe("Y coordinate 80: unused value.");
  });

  it.todo(
    'falls back to the message for Object.prototype keys such as "constructor" (currently returns the inherited function)',
  );
});

describe("translateAlmanacValue", () => {
  it("translates known Almanac values to Italian", () => {
    expect(translateAlmanacValue("it", "Lush")).toBe("Lussureggiante");
    expect(translateAlmanacValue("it", "Rings")).toBe("Anelli");
    expect(translateAlmanacValue("it", "Acid Rain")).toBe("Pioggia acida");
    expect(translateAlmanacValue("it", "Abyssal Crab")).toBe("Granchio abissale");
  });

  it("lets explicit entries override the resource and weather maps", () => {
    expect(translateAlmanacValue("it", "None")).toBe("Assente");
  });

  it("keeps values unchanged in English and when unknown", () => {
    expect(translateAlmanacValue("en", "Lush")).toBe("Lush");
    expect(translateAlmanacValue("it", "Unknown thing")).toBe("Unknown thing");
  });

  it("does not resolve Object.prototype keys", () => {
    expect(translateAlmanacValue("it", "constructor")).toBe("constructor");
    expect(translateAlmanacValue("en", "toString")).toBe("toString");
  });

  it("translates species and plant counts in Italian only", () => {
    expect(translateAlmanacValue("it", "12 species")).toBe("12 specie");
    expect(translateAlmanacValue("it", "1 plant")).toBe("1 pianta");
    expect(translateAlmanacValue("it", "3 plants")).toBe("3 piante");
    expect(translateAlmanacValue("en", "3 plants")).toBe("3 plants");
    expect(translateAlmanacValue("it", "3 trees")).toBe("3 trees");
  });

  it.each([
    "Advanced materials",
    "Advanced Materials",
    "Alchemical",
    "Commercial",
    "Construction",
    "Energy Supply",
    "Engineering",
    "Experimental",
    "High Tech",
    "High Voltage",
    "Mass Production",
    "Material Fusion",
    "Mathematical",
    "Minerals",
    "Prospecting",
    "Research",
    "Fuel Generation",
    "Industrial",
    "Manufacturing",
    "Metal Processing",
    "Nano-construction",
    "None",
    "Ore Extraction",
    "Power generation",
    "Scientific",
    "Shipping",
    "Technology",
    "Trading",
  ])("translates the Almanac economy type %s into Italian", (economy) => {
    expect(translateAlmanacValue("it", economy)).not.toBe(economy);
    expect(translateAlmanacValue("en", economy)).toBe(economy);
  });

  it.each([
    "Adequate",
    "Advanced",
    "Affluent",
    "Balanced",
    "Booming",
    "Comfortable",
    "Declining",
    "Destitute",
    "Developing",
    "Flourishing",
    "High Supply",
    "Low Supply",
    "Medium Supply",
    "Opulent",
    "Promising",
    "Prosperous",
    "Satisfactory",
    "Sustainable",
    "Unpromising",
    "Unsuccessful",
    "Wealthy",
  ])("translates the Almanac wealth description %s into Italian", (wealth) => {
    expect(translateAlmanacValue("it", wealth)).not.toBe(wealth);
    expect(translateAlmanacValue("en", wealth)).toBe(wealth);
  });

  it.each(["Deep", "Shallow", "Ocean", "None"])("translates the water depth %s into Italian", (water) => {
    expect(translateAlmanacValue("it", water)).not.toBe(water);
    expect(translateAlmanacValue("en", water)).toBe(water);
  });

  it("ignores the capitalisation of Almanac values when there is no exact translation", () => {
    expect(translateAlmanacValue("it", "power Generation")).toBe("Generazione d'energia");
    expect(translateAlmanacValue("it", "FUEL GENERATION")).toBe("Generazione di carburante");
    expect(translateAlmanacValue("it", "Unknown Economy")).toBe("Unknown Economy");
    expect(translateAlmanacValue("en", "FUEL GENERATION")).toBe("FUEL GENERATION");
  });

  it("never maps values that differ only by case to different translations", () => {
    const seen = new Map<string, string>();
    for (const [key, value] of Object.entries(almanacValueTranslations.it)) {
      const lower = key.toLowerCase();
      expect(seen.get(lower) ?? value, key).toBe(value);
      seen.set(lower, value);
    }
  });

  it("has only non-empty Italian translations", () => {
    for (const [key, value] of Object.entries(almanacValueTranslations.it)) expect(value.trim(), key).not.toBe("");
    expect(almanacValueTranslations.en).toEqual({});
  });
});
