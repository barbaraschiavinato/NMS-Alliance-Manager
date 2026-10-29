import type { Metadata } from "next";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { NavigationSearchResetProvider } from "@/components/shared/navigation-search-reset";
import { readAccessData } from "@/lib/members/access-store";
import "./globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { alliance } = await readAccessData();
  return {
    title: "NMS Alliance Manager",
    description: "Mission management for your alliance.",
    icons: {
      icon: alliance.faviconUrl
        ? [
            { url: "/api/alliance/app-icon?size=32", sizes: "32x32", type: "image/png" },
            { url: "/api/alliance/app-icon?size=192", sizes: "192x192", type: "image/png" },
          ]
        : "/icons/nms-gek.svg",
      apple: alliance.appleIconUrl ? "/api/alliance/app-icon?size=180" : "/glyphs/glyph-mask-0.png",
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body>
        <LocaleProvider>
          <NavigationSearchResetProvider>{children}</NavigationSearchResetProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
