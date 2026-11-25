// Single source for NMS Almanac URLs. Safe to import from client and server code.

export const almanacSiteUrl = "https://nmsalmanac.com";
export const almanacApiUrl = `${almanacSiteUrl}/api`;

/** Request URL of a planet. `almanacGalaxy` is the Almanac's 1-based number (stored galaxy index + 1). */
export function almanacPlanetUrl(portal: string, almanacGalaxy: number): string {
  return `${almanacApiUrl}/planets/${portal.toUpperCase()}?galaxy=${almanacGalaxy}`;
}

/** Request URL of a system. `almanacGalaxy` is the Almanac's 1-based number (stored galaxy index + 1). */
export function almanacSystemUrl(system: string, almanacGalaxy: number): string {
  return `${almanacApiUrl}/systems/${system.toUpperCase()}?galaxy=${almanacGalaxy}`;
}

/** URL of an API document referenced by a relative path in a response, such as a planet's `words` table. */
export function almanacDocumentUrl(relativePath: string): string {
  return `${almanacApiUrl}/${relativePath.replace(/^\/+/, "")}`;
}

/** Absolute URL of a planet picture (`pictures.disc` or `pictures.card`), or null when the path is not a planet image. */
export function almanacImageUrl(picturePath: unknown): string | null {
  return typeof picturePath === "string" && picturePath.startsWith("/planets/")
    ? `${almanacApiUrl}${picturePath}`
    : null;
}
