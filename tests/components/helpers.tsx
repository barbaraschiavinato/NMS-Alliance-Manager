import type { AnchorHTMLAttributes, ImgHTMLAttributes, ReactElement, ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { NavigationSearchResetProvider } from "@/components/shared/navigation-search-reset";
import { translate, type Locale } from "@/lib/translations";
import type { Mission } from "@/lib/missions/missions";

// Renders `ui` inside LocaleProvider (fixed locale, default "en") and NavigationSearchResetProvider; returns RTL's result plus a user-event `user`.
export function renderWithLocale(
  ui: ReactElement,
  { locale = "en", ...options }: Omit<RenderOptions, "wrapper"> & { locale?: Locale } = {},
) {
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <LocaleProvider fixedLocale={locale}>
        <NavigationSearchResetProvider>{children}</NavigationSearchResetProvider>
      </LocaleProvider>
    );
  }
  return { user: userEvent.setup(), ...render(ui, { wrapper: Wrapper, ...options }) };
}

// Translates a key with the real catalogs, as `t()` does inside components (default locale "en").
export function tr(key: string, values?: Readonly<Record<string, string | number>>, locale: Locale = "en") {
  return translate(locale, key, values);
}

// Mission fixture: a pending, unassigned, normal-priority explorer mission in Euclid; overrides replace the defaults.
export function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: "mission-1",
    title: "Survey Alpha",
    description: "",
    system: "",
    systemAddress: "0123456789AB",
    galaxy: 0,
    assignedTo: "",
    targetSpecialty: "explorer",
    dueDate: "",
    status: "pending",
    priority: "normal",
    progress: 0,
    ...overrides,
  };
}

// Module replacement for `next/image`: use as `vi.mock("next/image", async () => (await import("./helpers")).nextImageModule)`.
export const nextImageModule = {
  default: function MockImage({
    alt = "",
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean; priority?: boolean }) {
    const imgProps = { ...props };
    delete imgProps.unoptimized;
    delete imgProps.priority;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} {...imgProps} />;
  },
};

// Module replacement for `next/link`: use as `vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule)`.
export const nextLinkModule = {
  default: function MockLink({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) {
    const anchorProps = { ...props };
    delete anchorProps.prefetch;
    return (
      <a href={href} {...anchorProps}>
        {children}
      </a>
    );
  },
};
