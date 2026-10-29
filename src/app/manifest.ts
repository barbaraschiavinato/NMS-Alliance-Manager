import type { MetadataRoute } from "next";
import { readAccessData } from "@/lib/members/access-store";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { alliance } = await readAccessData();
  return {
    name: "NMS Alliance Manager",
    short_name: "NMS Alliance",
    start_url: "/taxi",
    display: "standalone",
    background_color: "#111827",
    theme_color: "#111827",
    icons:
      alliance.appIcon192Url && alliance.appIcon512Url
        ? [
            { src: "/api/alliance/app-icon?size=192", sizes: "192x192", type: "image/png" },
            { src: "/api/alliance/app-icon?size=512", sizes: "512x512", type: "image/png" },
          ]
        : [
            { src: "/icons/nms-gek.svg", sizes: "any", type: "image/svg+xml" },
            { src: "/glyphs/glyph-mask-0.png", sizes: "256x256", type: "image/png" },
          ],
  };
}
