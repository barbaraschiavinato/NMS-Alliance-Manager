// The Almanac answers 429 with Retry-After when the weekly quota is used up, and turns away clients that keep
// calling sooner. This best-effort cooldown (per server instance) stops the app from hammering it meanwhile.
const defaultCooldownSeconds = 60;
const maxCooldownSeconds = 7 * 24 * 60 * 60;
let blockedUntil = 0;

export function almanacRetryAfterSeconds() {
  return Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
}

export function noteAlmanacRateLimit(response: Response) {
  const header = Number(response.headers.get("Retry-After"));
  const seconds =
    Number.isFinite(header) && header > 0 ? Math.min(Math.ceil(header), maxCooldownSeconds) : defaultCooldownSeconds;
  if (almanacRetryAfterSeconds() === 0)
    console.warn(`NMS Almanac rate limit reached: pausing requests for ${seconds} seconds`);
  blockedUntil = Date.now() + seconds * 1000;
}

export function resetAlmanacRateLimit() {
  blockedUntil = 0;
}
