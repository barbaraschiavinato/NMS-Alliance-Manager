import type { Locale } from "../translations";
import { almanacResourcesIt } from "./almanac-resources-it";
import { almanacWeatherIt } from "./almanac-weather-it";

// La chiave è il valore esatto restituito da NMS Almanac. Se manca, si mostra il valore originale.
export const almanacValueTranslations: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en: {},
  it: {
    ...almanacResourcesIt,
    ...almanacWeatherIt,
    // Caratteristiche del pianeta (Rings dalla wiki italiana, le altre traduzioni non ufficiali)
    "Rings": "Anelli",
    "Huge plants": "Piante enormi",
    "Huge scorched": "Enorme bruciato",
    "Titan worm": "Verme titano",
    "Hives": "Alveari",
    "Hydro garden": "Giardino idroponico",
    "Nuclear": "Nucleare",
    "Floral": "Floreale",
    "Rocky": "Roccioso",
    // Acqua
    "None": "Assente",
    "Ocean": "Oceano",
    // Dimensione del pianeta (piccolo/medio/grande come nella wiki italiana)
    "Small": "Piccolo",
    "Large": "Grande",
    "Moon": "Luna",
    // Livello di conflitto
    "Low": "Basso",
    "Medium": "Medio",
    "High": "Alto",
    // Indicatori meteo
    "Storms": "Tempeste",
    "Heavy storms": "Tempeste violente",
    "Extreme": "Estremo",
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
