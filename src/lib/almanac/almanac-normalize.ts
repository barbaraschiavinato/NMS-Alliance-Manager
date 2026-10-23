type AlmanacRecord = Record<string, unknown>;

function record(value: unknown): AlmanacRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as AlmanacRecord) : {};
}

const documents = new Map<string, Promise<AlmanacRecord>>();

class AlmanacDocumentError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`NMS Almanac document request failed (${status}): ${url}`);
  }
}

async function readDocument(url: string, refresh = false): Promise<AlmanacRecord> {
  const existing = documents.get(url);
  if (existing) return existing;
  const request = (async () => {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      cache: refresh ? "no-store" : "force-cache",
    });
    if (!response.ok) throw new AlmanacDocumentError(response.status, url);
    const value: unknown = await response.json();
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`NMS Almanac returned an invalid document: ${url}`);
    }
    return record(value);
  })();
  documents.set(url, request);
  try {
    return await request;
  } catch (error) {
    documents.delete(url);
    throw error;
  }
}

function word(dictionary: unknown, key: unknown): string | undefined {
  const value = typeof key === "string" ? record(dictionary)[key] : undefined;
  return typeof value === "string" ? value : undefined;
}

function phrase(dictionary: unknown, family: unknown, index: unknown): string | undefined {
  const values = typeof family === "string" ? record(dictionary)[family] : undefined;
  return Array.isArray(values) && typeof index === "number" && typeof values[index] === "string"
    ? values[index]
    : undefined;
}

function fact(value: string | undefined): AlmanacRecord {
  return value === undefined ? {} : { word: value };
}

export function normalizeAlmanacPictures(planet: AlmanacRecord): AlmanacRecord {
  const pictures = record(planet.pictures);
  let changed = false;
  const normalized = Object.fromEntries(
    Object.entries(pictures).map(([key, value]) => {
      if (
        typeof value === "string" &&
        /^planets\/[a-zA-Z0-9/_.-]+(?:\?galaxy=(?:[1-9]\d{0,2}))?$/.test(value) &&
        !value.includes("..") &&
        (!value.includes("?") || Number(value.split("=")[1]) <= 256)
      ) {
        changed = true;
        return [key, `/${value}`];
      }
      return [key, value];
    }),
  );
  return changed ? { ...planet, pictures: normalized } : planet;
}

// Adapt the structured API to the display shape used by existing cached planets and UI consumers.
export async function normalizeAlmanacPlanet(planet: AlmanacRecord, allowRefresh = true): Promise<AlmanacRecord> {
  planet = normalizeAlmanacPictures(planet);
  if (planet.kind !== "planet" || planet.lines !== undefined) return planet;
  if (
    typeof planet.words !== "string" ||
    !/^words\.en\.[a-zA-Z0-9_-]+\.json$/.test(planet.words) ||
    typeof planet.system !== "string" ||
    !/^[0-9a-f]{12}$/i.test(planet.system) ||
    typeof planet.galaxy !== "number" ||
    !Number.isInteger(planet.galaxy) ||
    planet.galaxy < 1 ||
    planet.galaxy > 256
  ) {
    throw new Error("NMS Almanac returned invalid structured planet metadata");
  }
  const dictionaryUrl = `https://nmsalmanac.com/api/${planet.words}`;
  let words: AlmanacRecord;
  try {
    words = await readDocument(dictionaryUrl);
  } catch (error) {
    if (!(error instanceof AlmanacDocumentError) || error.status !== 404 || !allowRefresh) throw error;
    if (typeof planet.portal !== "string" || !/^[0-9a-f]{12}$/i.test(planet.portal)) throw error;
    const url = `https://nmsalmanac.com/api/planets/${planet.portal.toUpperCase()}?galaxy=${planet.galaxy}`;
    // An old word table cannot decode current phrase indexes: refresh the planet and table together.
    const fresh = await readDocument(url, true);
    if (
      fresh.kind !== "planet" ||
      typeof fresh.portal !== "string" ||
      fresh.portal.toUpperCase() !== planet.portal.toUpperCase() ||
      fresh.galaxy !== planet.galaxy ||
      fresh.words === planet.words
    ) {
      throw new Error("NMS Almanac returned invalid refreshed planet metadata");
    }
    console.info("Refreshing cached NMS Almanac planet after its word table expired", {
      portal: planet.portal,
      galaxy: planet.galaxy,
    });
    return normalizeAlmanacPlanet(fresh, false);
  }
  const system = await readDocument(
    `https://nmsalmanac.com/api/systems/${planet.system.toUpperCase()}?galaxy=${planet.galaxy}`,
  );
  if (["size", "biome", "life", "items"].some((key) => Object.keys(record(words[key])).length === 0)) {
    documents.delete(`https://nmsalmanac.com/api/${planet.words}`);
    throw new Error("NMS Almanac returned an invalid dictionary");
  }
  if (
    system.kind !== "system" ||
    typeof system.portal !== "string" ||
    system.portal.toUpperCase() !== planet.system.toUpperCase() ||
    system.galaxy !== planet.galaxy
  ) {
    throw new Error("NMS Almanac returned a mismatched system");
  }
  const weather = record(planet.weather);
  const sentinels = record(planet.sentinels);
  const fauna = record(planet.fauna);
  const flora = record(planet.flora);
  const economy = record(system.economy);
  const wealth = record(system.wealth);
  const conflict = record(system.conflict);
  const colours = record(planet.colours);
  const names = record(planet.names);
  const description = record(planet.description);
  const pictures = record(planet.pictures);
  const size = word(words.size, planet.size);
  const descriptionText = phrase(record(words.description).phrases, description.family, description.phrase);
  const name = typeof names.game === "string" ? names.game : undefined;
  const carries = Array.isArray(planet.resources)
    ? planet.resources.flatMap((id: unknown) => {
        const item = typeof id === "string" ? record(record(words.items)[id]) : {};
        if (typeof item.name !== "string") {
          console.warn("Unknown NMS Almanac resource", { id });
          return [];
        }
        return [{ name: item.name, kind: typeof item.type === "string" ? item.type : "other" }];
      })
    : [];
  return {
    ...planet,
    ...(name ? { name } : {}),
    dialable: system.dialable,
    sky: colours.sky,
    tints: { terrain: colours.terrain },
    pictures,
    carries,
    lines: {
      headline: fact(name),
      ...(descriptionText
        ? { line: descriptionText.replaceAll("%PLANETCLASS%", planet.size === "moon" ? "Moon" : "Planet") }
        : {}),
      band: {
        type: fact(word(words.biome, planet.biome)),
        size: fact(size),
        features: Array.isArray(planet.features)
          ? planet.features.flatMap((feature) => {
              const label = word(words.features, feature);
              return label ? [{ word: label }] : [];
            })
          : [],
        weather: fact(
          phrase(record(words.weather).phrases, weather.family, weather.phrase) ??
            word(record(words.weather).type, weather.type),
        ),
        water: fact(word(words.water, planet.water)),
        sentinels: {
          ...fact(
            phrase(record(words.sentinels).phrases, sentinels.level, sentinels.phrase) ??
              word(record(words.sentinels).level, sentinels.level),
          ),
          ...(sentinels.level === "corrupted" ? { ink: "exotic" } : {}),
        },
        fauna: {
          ...fact(phrase(words.life, fauna.family, fauna.phrase)),
          ...(typeof fauna.species === "number" ? { note: `${fauna.species} species` } : {}),
        },
        flora: {
          ...fact(phrase(words.life, flora.family, flora.phrase)),
          ...(typeof flora.plants === "number" ? { note: `${flora.plants} plants` } : {}),
        },
        minerals: typeof planet.minerals === "number" ? { word: String(planet.minerals) } : {},
        star: fact(word(words.star, system.star)),
        race: fact(word(words.race, system.race)),
        economy: {
          ...fact(
            phrase(record(words.economy).phrases, economy.type, economy.phrase) ??
              word(record(words.economy).type, economy.type),
          ),
          ...(["poor", "average", "wealthy"].includes(String(wealth.level))
            ? { stars: wealth.level === "wealthy" ? 3 : wealth.level === "average" ? 2 : 1 }
            : {}),
          black_market: wealth.level === "outlaw",
          marks: [
            fact(
              phrase(record(words.wealth).phrases, wealth.level, wealth.phrase) ??
                word(record(words.wealth).level, wealth.level),
            ),
          ],
        },
        conflict: fact(word(record(words.conflict).level, conflict.level)),
      },
    },
  };
}
