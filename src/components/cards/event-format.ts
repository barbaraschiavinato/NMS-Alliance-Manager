import type { Locale } from "@/lib/translations";
import type { EventLocation } from "@/lib/events/events";

const dateLocales: Record<Locale, string> = { it: "it-IT", en: "en-GB" };

// Dates and times are shown in the viewer's local time zone.
export function formatEventDay(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(dateLocales[locale], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatEventTime(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(dateLocales[locale], { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function formatEventDateTime(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(dateLocales[locale], { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
}

export function formatEventPeriod(startsAt: string, endsAt: string | undefined, locale: Locale) {
  const start = `${formatEventDay(startsAt, locale)}, ${formatEventTime(startsAt, locale)}`;
  if (!endsAt) return start;
  const sameDay = new Date(startsAt).toDateString() === new Date(endsAt).toDateString();
  return `${start} – ${sameDay ? formatEventTime(endsAt, locale) : formatEventDateTime(endsAt, locale)}`;
}

export function eventLocationLabel(location: EventLocation, t: (key: string) => string) {
  if (location.kind === "hub") return t("events.location_hub");
  return location.name || location.portal;
}
