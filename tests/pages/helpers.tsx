import type { AnchorHTMLAttributes, ImgHTMLAttributes, ReactElement, ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { NavigationSearchResetProvider } from "@/components/shared/navigation-search-reset";
import { translate, type Locale } from "@/lib/translations";
import type { Mission } from "@/lib/missions/missions";
import { defaultTaxiNotificationSettings } from "@/lib/notifications/taxi-notifications";

// Renderizza dentro LocaleProvider (lingua fissa, "en" di default) e NavigationSearchResetProvider, come fa il layout.
export function renderPage(
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

// Traduce una chiave con i cataloghi reali, come t() nei componenti.
export function t(key: string, values?: Readonly<Record<string, string | number>>, locale: Locale = "en") {
  return translate(locale, key, values);
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export type FetchCall = Readonly<{ url: URL; method: string; body: unknown }>;
type RouteHandler = (call: FetchCall) => unknown;
type Routes = Record<string, unknown>;

function parseBody(body: RequestInit["body"]): unknown {
  if (typeof body !== "string") return body ?? undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

// Sostituisce fetch: le chiavi sono "METODO /percorso" oppure "/percorso" (qualsiasi metodo).
// Il valore è una Response, un valore serializzato come JSON 200, oppure una funzione che riceve la chiamata.
// Le richieste senza route rispondono 404 {}. I contatori della sidebar hanno una route di default.
export function mockFetch(pageRoutes: Routes = {}) {
  const routes: Routes = {
    "/api/messages?count=unread": { count: 0 },
    "/api/help-requests?count=1": { count: 0 },
    "/api/taxi-requests?count=1": { count: 0 },
    "GET /api/admin/taxi-notifications": {
      settings: defaultTaxiNotificationSettings,
      readiness: { discord: false, telegram: false, push: false, links: false },
    },
    "GET /api/profile/taxi-push": { enabled: true, available: false, publicKey: null },
    "GET /api/admin/member-notifications": {
      settings: { telegramEnabled: false, telegramChatId: "", telegramThreadId: "" },
      readiness: { telegram: false, links: false },
    },
    ...pageRoutes,
  };
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      "http://localhost:3000",
    );
    const method = (init?.method ?? "GET").toUpperCase();
    const call = { url, method, body: parseBody(init?.body) };
    calls.push(call);
    const key = [
      `${method} ${url.pathname}${url.search}`,
      `${url.pathname}${url.search}`,
      `${method} ${url.pathname}`,
      url.pathname,
    ].find((candidate) => candidate in routes);
    if (!key) return json({}, 404);
    const route = routes[key];
    const result = typeof route === "function" ? await (route as RouteHandler)(call) : route;
    return result instanceof Response ? result.clone() : json(result);
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    calls,
    // Chiamate fatte a un percorso con un metodo, nell'ordine.
    requests: (method: string, pathname: string) =>
      calls.filter((call) => call.method === method && call.url.pathname === pathname),
  };
}

// Missione di esempio: esploratori, in attesa, non assegnata, in Euclid.
export function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: "mission-1",
    title: "Survey Alpha",
    description: "",
    notes: "",
    system: "",
    systemAddress: "1234567890AB",
    galaxy: 0,
    assignedTo: "",
    targetSpecialty: "explorer",
    dueDate: "2026-01-01",
    status: "pending",
    priority: "normal",
    progress: 0,
    ...overrides,
  };
}

// Moduli sostitutivi: vi.mock("next/image", async () => (await import("./helpers")).nextImageModule).
export const nextImageModule = {
  default: function MockImage(
    props: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean; priority?: boolean },
  ) {
    const imageProps = { ...props };
    delete imageProps.unoptimized;
    delete imageProps.priority;
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...imageProps} alt={imageProps.alt ?? ""} />;
  },
};

export const nextLinkModule = {
  default: function MockLink(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) {
    const linkProps = { ...props };
    delete linkProps.prefetch;
    return <a {...linkProps}>{props.children}</a>;
  },
};

export const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };

export const nextNavigationModule = {
  useRouter: () => router,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
};

export const nextAuthReactModule = { signIn: vi.fn(), signOut: vi.fn() };

// nms-core deterministico: due pianeti, stella gialla, nome di sistema fisso.
export const nmsCoreModule = {
  planetSeeds: () => ({ planet_seeds: [1, 2] }),
  // Solo 03EA02304626 è un sistema con gigante gassoso; gli altri indirizzi no.
  systemAttributes: (address: bigint) => {
    // 03EB02304626 simula un errore di calcolo di nms-core.
    if (address === BigInt("0x03EB02304626")) throw new Error("nms-core failure");
    return { star_type: 0, gas_giant: address === BigInt("0x03EA02304626") };
  },
  systemName: () => "Testara",
};
