import { createLucideIcon } from "lucide-react";

// Spiral galaxy made of two arms, redrawn in a 24x24 box with the same stroke style as the lucide icons.
export const GalaxyIcon = createLucideIcon("Galaxy", [
  ["path", { d: "M2.72 15.05C0.32 6.79 18.32 0.04 17.67 10.12C17.05 15.25 8.65 17.08 9.5 13.53", key: "arm-a" }],
  ["path", { d: "M20.93 6.33C25.03 17.28 5.64 24.1 6.28 14.02C6.9 8.88 15.3 7.06 14.46 10.6", key: "arm-b" }],
]);
