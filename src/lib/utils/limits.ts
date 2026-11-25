// Limits shared by several features, kept in one place so they cannot drift apart.

/** How long a station counts as "New" after it was registered. */
export const newItemWindowMs = 7 * 24 * 60 * 60 * 1000;

/** Largest image accepted by every upload (alliance branding, pet pictures). */
export const imageUploadMaxBytes = 5 * 1024 * 1024;

/** Field lengths shared by farms and pets. */
export const itemNameMaxLength = 80;
export const systemNameMaxLength = 80;
export const planetNameMaxLength = 80;
export const coordinatesMaxLength = 60;
export const noteMaxLength = 1000;

/** True when `createdAt` is a valid date less than `newItemWindowMs` before `now`. */
export function isNewItem(createdAt: string | undefined | null, now: number): boolean {
  const createdTime = createdAt ? Date.parse(createdAt) : Number.NaN;
  return Number.isFinite(createdTime) && now - createdTime < newItemWindowMs;
}
