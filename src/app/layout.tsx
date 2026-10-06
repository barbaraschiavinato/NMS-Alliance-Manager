import type { Metadata } from "next";
import { LocaleProvider } from "@/components/locale-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "NMS Alliance Manager",
  description: "Mission management for your alliance.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body><LocaleProvider>{children}</LocaleProvider></body>
    </html>
  );
}