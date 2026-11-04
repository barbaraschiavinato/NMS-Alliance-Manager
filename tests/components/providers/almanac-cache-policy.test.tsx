// @vitest-environment jsdom
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionPlanetThumbnail, MissionStationLink } from "@/components/cards/mission-card/parts";
import { AlmanacCacheOnly, useAlmanacCacheOnly } from "@/components/providers/almanac-cache-policy";
import { SystemAddressField } from "@/components/shared/portal-address-field";
import { makeMission, renderWithLocale } from "../helpers";

vi.mock("next/image", async () => (await import("../helpers")).nextImageModule);
vi.mock("next/link", () => ({
  default: ({ href, prefetch, children }: { href: string; prefetch?: boolean; children: React.ReactNode }) => (
    <a data-prefetch={String(prefetch)} href={href}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname }));

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestedUrl(fetchMock: ReturnType<typeof stubFetch>) {
  return new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), "http://localhost");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AlmanacCacheOnly", () => {
  it("is off by default and on inside the provider", () => {
    expect(renderHook(() => useAlmanacCacheOnly()).result.current).toBe(false);
    expect(renderHook(() => useAlmanacCacheOnly(), { wrapper: AlmanacCacheOnly }).result.current).toBe(true);
    render(<AlmanacCacheOnly>content</AlmanacCacheOnly>);
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("makes the address field look up only the cache and report missing cached data", async () => {
    const fetchMock = stubFetch({ found: false, cacheOnly: true });
    function Field() {
      const [address, setAddress] = useState("0123456789AB");
      return (
        <SystemAddressField
          address={address}
          galaxy={0}
          lookupMode="farm-create"
          onChange={setAddress}
          onStateChange={vi.fn()}
        />
      );
    }
    renderWithLocale(
      <AlmanacCacheOnly>
        <Field />
      </AlmanacCacheOnly>,
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "No planet data is archived; no NMS Almanac request was made",
      ),
    );
    expect(requestedUrl(fetchMock).searchParams.get("lookup")).toBe("cache-only");
  });

  it("reads mission thumbnails from the cache and disables station link prefetching", async () => {
    const fetchMock = stubFetch({ planet: { pictures: { disc: "/planets/a.png" } } });
    renderWithLocale(
      <AlmanacCacheOnly>
        <MissionPlanetThumbnail mission={makeMission()} />
        <MissionStationLink canManage mission={makeMission()} stationOwners={[]} stationOwnersLoaded />
      </AlmanacCacheOnly>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(requestedUrl(fetchMock).searchParams.get("cacheOnly")).toBe("1");
    expect(screen.getByRole("link")).toHaveAttribute("data-prefetch", "false");
  });
});
