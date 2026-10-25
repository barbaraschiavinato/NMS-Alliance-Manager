import { createLucideIcon } from "lucide-react";

// Spiral galaxy: a core and two arms, drawn with the same stroke style as the lucide icons.
export const GalaxyIcon = createLucideIcon("Galaxy", [
  ["circle", { cx: "12", cy: "12", r: "1.2", key: "core" }],
  ["path", { d: "M12 12c-1.5-2.5-.5-5.5 2.5-6.5 3.5-1 7 1.5 7 5.5", key: "arm-a" }],
  ["path", { d: "M12 12c1.5 2.5.5 5.5-2.5 6.5-3.5 1-7-1.5-7-5.5", key: "arm-b" }],
]);
