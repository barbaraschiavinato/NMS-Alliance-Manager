import type { Locale } from "../translations";
import { almanacResourcesIt } from "./almanac-resources-it";
import { almanacWeatherIt } from "./almanac-weather-it";

// La chiave è il valore esatto restituito da NMS Almanac. Se manca, si mostra il valore originale.
export const almanacValueTranslations: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en: {},
  it: {
    ...almanacResourcesIt,
    ...almanacWeatherIt,
    // Livello di allerta delle sentinelle (traduzioni non ufficiali)
    "Frequent": "Frequenti",
    "Enforcing": "Repressive",
    "Irregular Patrols": "Pattuglie irregolari",
    "Hostile Patrols": "Pattuglie ostili",
    "Sparse": "Rade",
    "Isolated": "Isolate",
    "Require Orthodoxy": "Esigono ortodossia",
    "Aggressive": "Aggressive",
    "Corrupt": "Corrotte",
    "Limited": "Limitate",
    // Tipo di pianeta (termini presenti nella localizzazione italiana del gioco)
    "Lush": "Lussureggiante",
    "Toxic": "Tossico",
    "Scorched": "Bruciato",
    "Irradiated": "Irradiato",
    "Frozen": "Ghiacciato",
    "Barren": "Arido",
    "Dead": "Morto",
    "Exotic": "Esotico",
    "Swamp": "Paludoso",
    "Volcanic": "Vulcanico",
    "Water World": "Mondo acquatico",
    "Gas giant": "Gigante gassoso",
    // Economia (wiki italiana di No Man's Sky, pagina "Economia")
    "Trading": "Scambi",
    "Advanced materials": "Materiali avanzati",
    "Scientific": "Scienza",
    "Mining": "Estrazione",
    "Manufacturing": "Manifattura",
    "Technology": "Tecnologia",
    "Power generation": "Generazione d'energia",
    // Colore della stella
    "Yellow": "Gialla",
    "Green": "Verde",
    "Blue": "Blu",
    "Red": "Rossa",
  },
};
