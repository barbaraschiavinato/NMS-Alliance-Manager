// Ported from hadsh/nms_namegen (fork of stuart/nms_namegen), MIT licensed.
// https://github.com/hadsh/nms_namegen
//
// This is the corpus-verified reimplementation of the game's real system
// generation: star type, planet/moon counts, safe-start planet, purple
// gas-giant systems, abandoned systems, and per-planet seeds. All of the
// probability tables and branch conditions here are reverse-engineered,
// not invented — see the inline notes for what each one encodes and how
// it was verified.

import { PRNG, MULTIPLIER } from './prng.js';
import { indexPrimedPRNG } from './iprng.js';
import { voxelAttributes } from './region.js';
import { generateName } from './generator.js';
import { toRoman } from './roman.js';

const MASK64 = 0xFFFFFFFFFFFFFFFFn;
const CONST_A = 0x64DD81482CBD31D7n;
const CONST_B = 0xE36AA5C613612997n;

// abandonedSystemProbability * 100, indexed by star type
// (yellow, green, blue, red, purple).
const ABANDONED_SYSTEM_PCT = [0, 10, 10, 0, 35];

/**
 * portalCode, galaxy -> { planet_count, prime_planet_count,
 * safe_start_planet, gas_giant, star_type }
 *
 * portalCode: BigInt or Number (12-hex-digit portal code).
 * galaxy: Number, 0-255 (Euclid = 0).
 */
function systemAttributes(portalCode, galaxy) {
  let pc = BigInt(portalCode) & 0xFFFFFFFFFFFn;
  const gal = BigInt(galaxy) & 0xFFn;

  const systemId0 = (pc & 0xFFF00000000n) >> 32n;
  const universalAddress =
    (((systemId0 << 8n) | gal) << 32n) | (pc & 0xFFFFFFFFn);

  const va = voxelAttributes(pc);

  // The game decrements the system id before every branch comparison below
  // (the universal address above uses the raw id).
  let systemId = systemId0 - 1n;

  const systemSeed = indexPrimedPRNG(universalAddress) & 0xFFFFFFFFn;
  const rol16 =
    (((systemSeed & 0x0000FFFFn) << 16n) | ((systemSeed & 0xFFFF0000n) >> 16n)) ^
    systemSeed;
  const rol16m = rol16 & 0xFFFFFFFFn;

  let seed;
  if (systemSeed === 0n) {
    seed = ((systemSeed + 1n) * MULTIPLIER) + rol16m;
  } else {
    seed = (systemSeed * MULTIPLIER) + rol16m;
  }

  const rng = new PRNG(seed);

  let starType = 0;
  let safeStart = 0;
  let primePlanetCount = 2;
  let planetCount = 1;
  let anomaly = 0;

  const guideStarCount = BigInt(va.guide_star_count);

  if (systemId < guideStarCount) {
    planetCount = Number(((rng.seed & 0xFFFFFFFFn) * 4n) >> 32n) + 3;
    // Note: matches the reference's direct seed-bit draw (not rng.random()),
    // taken before the first _updateSeed() call inside rng.random() below.
    safeStart = rng.random(planetCount) + 1;
  } else {
    starType = 0;

    if (Number(((rng.seed & 0xFFFFFFFFn) * 0x64n) >> 32n) < 0x1E) {
      starType = rng.random(3) + 1;
    }

    const anomalyDiff = systemId - guideStarCount;
    if (va.black_hole_count > 0 && anomalyDiff >= 0n && anomalyDiff < BigInt(va.black_hole_count)) {
      anomaly = 2;
      starType = 0;
    }
    if (
      va.atlas_station_count > 0 &&
      anomalyDiff - BigInt(va.black_hole_count) >= 0n &&
      anomalyDiff - BigInt(va.black_hole_count) < BigInt(va.atlas_station_count)
    ) {
      anomaly = 1;
      starType = 0;
    }

    planetCount = rng.random(6) + 1;

    if (va.guide_star_renegade_count >= 10 || starType !== 0 || anomaly !== 0) {
      safeStart = 0;
    } else {
      safeStart = rng.random(planetCount + 2);
    }
  }

  rng._updateSeed();
  rng._updateSeed();
  rng._updateSeed();
  rng._updateSeed();

  if (systemId < BigInt(Math.trunc(va.guide_star_renegade_count))) {
    starType = rng.random(3) + 1;
  }

  // Purple window: raw SSI 0x3E9-0x429 inclusive (system_id already
  // decremented). Edge ids 0x3E9, 0x3EA and 0x429 are 100% purple in the
  // corpus this was verified against.
  if (systemId > 0x3E7n && systemId < 0x429n) {
    starType = 4;
  }

  // Abandoned-system draw: when a system is abandoned, the empty-system
  // check draw is SKIPPED, shifting every subsequent draw back one slot.
  const abandoned = rng.random(100) < ABANDONED_SYSTEM_PCT[starType];
  if (!abandoned) {
    rng._updateSeed(); // empty-system check
  }

  const diff = 6 - planetCount;
  if (diff < 1) {
    primePlanetCount = 0;
  } else if (rng.random(100) >= 33 || diff < 2) {
    primePlanetCount = 1;
  }

  // Purple gas-giant gate: first purple draw < 0xF collapses the system to
  // a single gas giant with five moons, regardless of the rolled counts.
  let gasGiant = false;
  if (starType === 4) {
    const g1 = rng.random(100);
    if (g1 < 0xF) {
      gasGiant = true;
    }
    if (g1 > 0xF) {
      rng.random(100); // unknown_attribute2 draw, kept for stream fidelity
    }
  }

  return {
    planet_count: planetCount,
    prime_planet_count: primePlanetCount,
    safe_start_planet: safeStart,
    gas_giant: gasGiant,
    // 0 -> yellow/white (F/G), 1 -> green (E), 2 -> blue (B/O),
    // 3 -> red (K/M), 4 -> purple/exotic (X/Y).
    star_type: starType,
  };
}

function mix64(hi, lo) {
  let register = (hi << 0x20n) | lo;
  register = (((register >> 33n) ^ register) * CONST_A) & MASK64;
  register = (((register >> 33n) ^ register) * CONST_B) & MASK64;
  register = ((register >> 33n) ^ register) & MASK64;
  return register;
}

/**
 * portalCode, galaxy -> { planet_seeds: BigInt[], planet_count, moon_count }
 */
function planetSeeds(portalCode, galaxy) {
  const pc = BigInt(portalCode);
  const gal = BigInt(galaxy);
  const attrs = systemAttributes(portalCode, galaxy);
  const gasGiant = attrs.gas_giant;

  const galacticCoords = pc & 0xFFFFFFFFn;
  const systemIndex = ((pc & 0x0FFF00000000n) >> 24n) | gal;
  let moonCount = 0;

  let register = (systemIndex << 0x20n) | galacticCoords;
  register = (((register >> 33n) ^ register) * CONST_A) & MASK64;
  register = (((register >> 33n) ^ register) * CONST_B) & MASK64;
  register = ((register >> 33n) ^ register) & MASK64;

  const seedH0 =
    (((register & 0xFFFF0000n) >> 16n) | ((register & 0x0000FFFFn) << 16n)) ^
    (register & 0xFFFFFFFFn) ^
    (register >> 32n);
  const seedL = register & 0xFFFFFFFFn;
  let seedH = seedH0 & 0xFFFFFFFFFFFFFFFFn;
  if (seedH === 0n) seedH = 1n;

  const seed = (seedH << 32n) | seedL;
  const rng = new PRNG(seed);

  const planetSeedsArr = [];
  let i = 0;
  let planetCount = 0;

  while (i < attrs.planet_count) {
    i += 1;
    const size = rng.random(3);
    planetCount += 1;

    if (size === 0) {
      // Large planet: attach 1-2 moons.
      let m = attrs.planet_count - i;
      if (m < 0) m = 0;
      if (m > 2) m = 2;

      let nMoons = rng.random(m + 1);
      if (nMoons > 0) {
        while (i !== attrs.safe_start_planet - 1) {
          i += 1;
          planetCount += 1;
          nMoons -= 1;
          moonCount += 1;
          if (nMoons <= 0) break;
        }
      }
    }
  }

  i = 0;
  while (i < attrs.planet_count) {
    const low = rng.randi() & 0xFFFFFFFFn;
    const high = rng.randi() & 0xFFFFFFFFn;
    const pSeed = mix64(high, low);
    planetSeedsArr.push(pSeed);
    i += 1;
  }

  // Extra planet(s)
  rng._updateSeed();

  while (i < attrs.planet_count + attrs.prime_planet_count) {
    const low = rng.randi() & 0xFFFFFFFFn;
    const high = rng.randi() & 0xFFFFFFFFn;
    const pSeed = mix64(high, low);
    planetSeedsArr.push(pSeed);

    const size = rng.random(3);
    if (size !== 0) {
      rng._updateSeed();
    }
    i += 1;
  }

  let finalPlanetCount =
    attrs.planet_count + attrs.prime_planet_count - moonCount;
  let finalMoonCount = moonCount;
  if (gasGiant) {
    finalPlanetCount = 1;
    finalMoonCount = 5;
  }

  return {
    planet_seeds: planetSeedsArr,
    planet_count: finalPlanetCount,
    moon_count: finalMoonCount,
  };
}

/**
 * portalCode, galaxy, letterMap -> system name string (e.g. "Abarof-Dulin",
 * "Nutsvill Sigma", "Edershar K25").
 *
 * letterMap: the parsed letter_map.json object. Load it once (ideally via
 * a lazy dynamic import so it's not in your main bundle) and pass it in —
 * see README.md for the loading pattern.
 */
function systemName(portalCode, galaxy, letterMap) {
  const pc = BigInt(portalCode);
  const gal = BigInt(galaxy);

  const galacticCoords = pc & 0xFFFFFFFFn;
  const systemIndex = ((pc & 0x0FFF00000000n) >> 24n) | gal;

  let rolCoords =
    ((galacticCoords & 0x0000FFFFn) << 16n) | ((galacticCoords & 0xFFFF0000n) >> 16n);
  rolCoords = (rolCoords ^ galacticCoords ^ systemIndex) & 0xFFFFFFFFn;

  let seed;
  if (galacticCoords === 0n) {
    seed = (galacticCoords + 1n) * MULTIPLIER + rolCoords;
  } else {
    seed = galacticCoords * MULTIPLIER + rolCoords;
  }

  const rng = new PRNG(seed);

  let alphasetIndex = 0x00;
  const alphasetReg = Number(((seed & 0xFFFFFFFFn) * 5n) >> 32n);
  if (alphasetReg === 0) {
    alphasetIndex = 0x02;
  } else if ((alphasetReg & 0xff) < 0x04) {
    alphasetIndex = (alphasetReg & 0xff) + 0x02;
  } else {
    alphasetIndex = 0x07;
  }

  const maxLength = rng.random(4) + 0x06;
  let name = generateName(letterMap, rng, alphasetIndex, 6, maxLength);
  name = name.charAt(0).toUpperCase() + name.slice(1);

  // Hyphenated names
  if (name.length < 8) {
    const r = rng.random(4);
    if (r < 2) {
      const alphasetReg2 = rng.random(5);
      const minLength2 = 3;
      const maxLength2 = 5;

      let alphasetIndex2;
      if (alphasetReg2 === 0) {
        alphasetIndex2 = 0x02;
      } else if (alphasetReg2 < 4) {
        alphasetIndex2 = alphasetReg2 + 2;
      } else {
        alphasetIndex2 = 0x07;
      }

      const name2 = generateName(letterMap, rng, alphasetIndex2, minLength2, maxLength2);
      name = `${name}-${name2.charAt(0).toUpperCase()}${name2.slice(1)}`;
    }
  }

  if (rng.random(0x0a) < 0x03) {
    let n = rng.random(19) + 1;
    if (n > 19) n = 19;
    name = `${name} ${toRoman(n)}`;
  }

  return name;
}

export { systemAttributes, planetSeeds, systemName };
