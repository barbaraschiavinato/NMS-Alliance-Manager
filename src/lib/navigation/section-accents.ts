// Section accent colours for inline styles. The values live once, as CSS variables in `src/styles/base.css`.
export const sectionAccents = {
  stations: "var(--accent-stations)",
  missions: "var(--accent-missions)",
  planets: "var(--accent-planets)",
  map: "var(--accent-map)",
  farms: "var(--accent-farms)",
  pets: "var(--accent-pets)",
} as const;

export type SectionAccent = keyof typeof sectionAccents;
