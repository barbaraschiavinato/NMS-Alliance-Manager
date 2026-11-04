import { describe, expect, it } from "vitest";
import { systemTaskTooltip } from "@/lib/planets/system-task-tooltip";

describe("systemTaskTooltip", () => {
  it.each([
    [
      "station_claimed",
      "La stazione spaziale è stata acquistata completando gli obiettivi di sistema, riscattando il nucleo centrale, aggiungendola all'alleanza Artemis e rinominandola con il prefisso «[Artemis]» prima del nome.",
      'The space station has been purchased by completing the system objectives and claiming the central core, added to the Artemis alliance, and renamed with the prefix "[Artemis]" before its name.',
    ],
    [
      "system_scanned",
      "Il sistema è stato scansionato dallo spazio con la sala scanner dell'ammiraglia (o mercantile), della corvetta o dell'astronave.",
      "The system has been scanned from space using the scanner room of a flagship (or freighter), corvette, or starship.",
    ],
    [
      "mapped",
      "Il sistema è stato scansionato dallo spazio con la sala scanner dell'ammiraglia (o mercantile), della corvetta o dell'astronave.",
      "The system has been scanned from space using the scanner room of a flagship (or freighter), corvette, or starship.",
    ],
    [
      "renamed",
      "Il sistema è stato rinominato con il prefisso «[Artemis]» prima del nome.",
      'The system has been renamed with the prefix "[Artemis]" before its name.',
    ],
    [
      "planets_classified",
      "Tutti i pianeti del sistema sono stati visitati, la fauna scansionata completamente, così come la flora e i minerali che si incontrano più comunemente.",
      "All planets in the system have been visited, all fauna scanned, and the most commonly encountered flora and minerals scanned.",
    ],
    [
      "data_uploaded",
      "I dati raccolti da questo sistema con le scansioni sono stati caricati dal pannello Scoperte.",
      "Data collected by scanning this system has been uploaded from the Discoveries panel.",
    ],
    [
      "system_data_uploaded",
      "I dati raccolti da questo sistema con le scansioni sono stati caricati dal pannello Scoperte.",
      "Data collected by scanning this system has been uploaded from the Discoveries panel.",
    ],
    [
      "buildings_built",
      "Gli edifici sono stati costruiti e posizionati in punti visibili, come portali o punti di interesse.",
      "The buildings have been built and placed in visible spots, such as portals or points of interest.",
    ],
    [
      "bases_uploaded",
      "Le basi sono state caricate sui server galattici tramite il computer di base.",
      "The bases have been uploaded to the galactic servers using the base computer.",
    ],
  ] as const)("translates %s in Italian and English", (status, italian, english) => {
    expect(systemTaskTooltip(status, "it", " Artemis ")).toBe(italian);
    expect(systemTaskTooltip(status, "en", " Artemis ")).toBe(english);
  });

  it.each(["it", "en"] as const)("uses generic wording in %s when no alliance name is configured", (locale) => {
    for (const status of ["station_claimed", "renamed"] as const) {
      const description = systemTaskTooltip(status, locale, "  ");
      expect(description).toContain(locale === "it" ? "prefisso dell'alleanza" : "alliance prefix");
      expect(description).not.toContain("[]");
      expect(description).not.toContain("{alliance}");
    }
  });

  it("does not describe the data-error indicator as a task", () => {
    expect(systemTaskTooltip("data_error", "it", "Artemis")).toBeNull();
    expect(systemTaskTooltip("data_error", "en", "Artemis")).toBeNull();
  });
});
