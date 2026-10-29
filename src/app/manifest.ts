import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NMS Alliance Manager",
    short_name: "NMS Alliance",
    start_url: "/taxi",
    display: "standalone",
    background_color: "#111827",
    theme_color: "#111827",
    icons: [
      { src: "/icons/nms-gek.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/glyphs/glyph-mask-0.png", sizes: "256x256", type: "image/png" },
    ],
  };
}
