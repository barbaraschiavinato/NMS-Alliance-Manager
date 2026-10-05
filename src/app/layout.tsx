import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NMS Alliance Manager",
  description: "Gestione missioni per la tua alleanza.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}