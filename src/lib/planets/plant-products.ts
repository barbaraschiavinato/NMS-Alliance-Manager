export const plantProducts = [
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

const productsByName = new Map<string, readonly [string, string]>();
for (const pair of plantProducts) {
  for (const name of pair) productsByName.set(name.toLowerCase(), pair);
}

export function plantResourceKey(name: string) {
  return productsByName.get(name.toLowerCase())?.[0] ?? name;
}

export function plantResourceProduct(name: string) {
  return productsByName.get(name.toLowerCase())?.[1] ?? name;
}

export function plantResourceLabel(name: string, translate: (value: string) => string) {
  const pair = productsByName.get(name.toLowerCase());
  return pair ? `${translate(pair[0])} (${translate(pair[1])})` : translate(name);
}

export function plantResourceSearchText(name: string, translate: (value: string) => string) {
  const pair = productsByName.get(name.toLowerCase());
  const names = pair ? [name, ...pair] : [name];
  return names
    .flatMap((value) => [value, translate(value)])
    .join(" ")
    .toLocaleLowerCase();
}
