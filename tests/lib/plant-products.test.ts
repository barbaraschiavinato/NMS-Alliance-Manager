import { describe, expect, it } from "vitest";
import {
  plantProducts,
  plantResourceKey,
  plantResourceLabel,
  plantResourceProduct,
  plantResourceSearchText,
} from "@/lib/planets/plant-products";
import { translateAlmanacValue } from "@/lib/translations";

const pairs = [
  ["Albumen Pearl Orb", "Albumen Pearl"],
  ["Echinocactus", "Cactus Flesh"],
  ["Frostwort", "Frost Crystal"],
  ["Fungal Cluster", "Fungal Mould"],
  ["Gamma Weed", "Gamma Root"],
  ["Gravitino Host", "Gravitino Ball"],
  ["Gutrot Flower", "Faecium"],
  ["Mordite Root", "Mordite"],
  ["NipNip", "NipNip Buds"],
  ["Solar Vine", "Solanium"],
  ["Star Bramble", "Star Bulb"],
  ["Venom Urchin", "Sac Venom"],
] as const;

const en = (value: string) => translateAlmanacValue("en", value);
const italian = (value: string) => translateAlmanacValue("it", value);

describe("plant products", () => {
  it("defines the known English plant and harvest pairs", () => {
    expect(plantProducts).toEqual(pairs);
  });

  it.each(pairs)("recognizes %s and its product %s", (plant, product) => {
    for (const name of [plant, product, product.toLowerCase()]) {
      expect(plantResourceKey(name)).toBe(plant);
      expect(plantResourceProduct(name)).toBe(product);
      expect(plantResourceLabel(name, en)).toBe(`${plant} (${product})`);
      expect(plantResourceSearchText(name, en)).toContain(plant.toLowerCase());
      expect(plantResourceSearchText(name, en)).toContain(product.toLowerCase());
    }
  });

  it("translates both names and searches English and localized aliases", () => {
    expect(plantResourceLabel("Star Bulb", italian)).toBe("Rovo stellare (Bulbo stellare)");
    expect(plantResourceLabel("star bramble", italian)).toBe("Rovo stellare (Bulbo stellare)");
    const searchText = plantResourceSearchText("Star Bramble", italian);
    for (const term of ["rovo stellare", "bulbo stellare", "star bramble", "star bulb"]) {
      expect(searchText).toContain(term);
    }
    expect(plantResourceSearchText("Faecium", italian)).toContain("faecium");
  });

  it("leaves unlisted plants and materials unchanged", () => {
    expect(plantResourceKey("Marrow Bulb")).toBe("Marrow Bulb");
    expect(plantResourceProduct("Marrow Bulb")).toBe("Marrow Bulb");
    expect(plantResourceLabel("Marrow Bulb", italian)).toBe("Bulbo di zucca");
    expect(plantResourceSearchText("Marrow Bulb", italian)).toContain("bulbo di zucca");
    expect(plantResourceSearchText("Copper", italian)).toContain("copper");
  });
});
