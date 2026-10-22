"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { type ComponentProps, type ReactNode, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { contextualDetailHref, detailReturnDestination, detailOrigins } from "@/lib/detail-links";
import { useLocale } from "@/components/providers/locale-provider";

function subscribeLocation(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function readLocation() {
  return `${window.location.pathname}${window.location.search}`;
}

export function useDetailReturn(fallback: string) {
  usePathname();
  const location = useSyncExternalStore(subscribeLocation, readLocation, () => "");
  return detailReturnDestination(location, fallback);
}

export function DetailLink({ href, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  usePathname();
  const location = useSyncExternalStore(subscribeLocation, readLocation, () => "");
  return <Link {...props} href={contextualDetailHref(href, location)} />;
}

export function DetailBackLink({ href, label }: Readonly<{ href: string; label: string }>) {
  const { t } = useLocale();
  const destination = useDetailReturn(href);
  const destinationLabel = destination.startsWith("/missions/")
    ? "details.back_to_mission_detail"
    : destination.startsWith("/stations/")
      ? "details.back_to_station_detail"
      : Object.values(detailOrigins).find(
          (origin) => destination.split("?")[0] === origin.href || destination.startsWith(`${origin.href}/`),
        )?.label;
  return (
    <Link className="detail-back-link" href={destination}>
      <ArrowLeft aria-hidden="true" size={18} />
      {t(destinationLabel ?? label)}
    </Link>
  );
}

export function DetailSection({ title, children }: Readonly<{ title?: string; children: ReactNode }>) {
  const { t } = useLocale();
  if (!title) return children;
  return (
    <section aria-label={t(title)} className="detail-section">
      <h2>{t(title)}</h2>
      {children}
    </section>
  );
}
