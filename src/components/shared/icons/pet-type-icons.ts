import type { PetType } from "@/lib/pets/pets";

// Stroke and fill paths drawn with `currentColor`, so each icon takes the colour of its pet type.
export type PetTypeIconPath = Readonly<{
  d: string;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: "round";
  strokeLinejoin?: "round";
}>;

export type PetTypeIconDefinition = Readonly<{
  color: string;
  viewBox: string;
  paths: readonly PetTypeIconPath[];
}>;

export const petTypeIcons: Readonly<Record<PetType, PetTypeIconDefinition>> = {
  tropical: {
    color: "#45B88A",
    viewBox: "0 0 64 64",
    paths: [
      {
        d: "M52 10C27 10 12 20 12 39c0 9 6 15 15 15 19 0 29-19 25-44Z",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 3.4,
      },
      {
        d: "M16 51C25 37 36 27 48 17M27 39l-2-13M35 31l11 1",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 3,
      },
    ],
  },
  fire: {
    color: "#F07842",
    viewBox: "0 0 64 64",
    paths: [
      {
        d: "M32 5C37 19 48 23 48 39c0 13-7 20-16 20S16 52 16 39c0-9 5-17 11-23-1 10 2 13 5 15 4-7 4-17 0-26Z",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 3.4,
      },
      {
        d: "M32 35c-2 6-7 9-7 15a7 7 0 0 0 14 0c0-6-5-10-7-15Z",
        fill: "currentColor",
      },
    ],
  },
  frost: {
    color: "#6DC9EE",
    viewBox: "0 0 64 64",
    paths: [
      {
        d: "M32 5v54M8.6 18.5l46.8 27M8.6 45.5l46.8-27M25 12l7 7 7-7M25 52l7-7 7 7M12 25l10 3-3-10M52 39l-10-3 3 10M19 46l3-10-10 3M45 18l-3 10 10-3",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 3,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      },
    ],
  },
  radioactive: {
    color: "#F4DC35",
    viewBox: "0 0 64 64",
    paths: [
      {
        d: "M32 8a24 24 0 1 0 0 48 24 24 0 0 0 0-48Z",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 3,
      },
      {
        d: "M28 26 21 14a20 20 0 0 1 22 0l-7 12ZM24 33 11 36a21 21 0 0 0 11 18l9-12ZM40 33l13 3a21 21 0 0 1-11 18l-9-12Z",
        fill: "currentColor",
      },
      {
        d: "M32 28a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
        fill: "currentColor",
      },
    ],
  },
  toxic: {
    color: "#A4E132",
    viewBox: "0 0 64 64",
    paths: [
      {
        d: "M27 28C16 16 4 27 9 39c3 7 10 10 17 8M37 28c11-12 23-1 18 11-3 7-10 10-17 8M27 39c-7 14 3 23 5 23s12-9 5-23",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 4,
        strokeLinecap: "round",
      },
      {
        d: "M32 24a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z",
        fill: "currentColor",
      },
      {
        d: "M32 29a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
        fill: "#000000",
      },
    ],
  },
  desert: {
    color: "#A87545",
    viewBox: "0 0 64 64",
    paths: [
      {
        d: "M32 57V27M32 40 18 29 12 18M18 29l1-14M32 32l13-11 5-11M45 21l9 4M32 49l11-9 5-9M32 45l-9-8M26 57h12",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 3.4,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      },
    ],
  },
  mechanical: {
    color: "#A0AAB8",
    viewBox: "0 0 64 64",
    paths: [
      {
        d: "M27 6h10l2 8 6 3 7-4 7 9-5 6v8l5 6-7 9-7-4-6 3-2 8H27l-2-8-6-3-7 4-7-9 5-6v-8l-5-6 7-9 7 4 6-3Z",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 3,
        strokeLinejoin: "round",
      },
      {
        d: "M32 22a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 3.4,
      },
    ],
  },
  anomalous: {
    color: "#D17BDE",
    viewBox: "0 0 64 64",
    paths: [
      {
        d: "M24 20a15 15 0 1 0 0 30 15 15 0 0 0 0-30Z",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 3,
      },
      {
        d: "M43 11a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 3,
      },
      {
        d: "M46 38a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 3,
      },
      {
        d: "M14 8a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2.5,
      },
      {
        d: "M17 30q3-6 9-6M39 18q2-3 6-3M43 44l2-2",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2.5,
        strokeLinecap: "round",
      },
    ],
  },
};
