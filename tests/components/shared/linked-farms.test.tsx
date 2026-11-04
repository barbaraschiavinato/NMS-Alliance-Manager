// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinkedFarms } from "@/components/shared/linked-farms";
import type { FarmEntry } from "@/components/cards/farm-card";
import { renderWithLocale } from "../helpers";

vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname }));
vi.mock("next/link", async () => (await import("../helpers")).nextLinkModule);
vi.mock("next/image", async () => (await import("../helpers")).nextImageModule);

const fetchMock = vi.fn();

function farm(overrides: Partial<FarmEntry> = {}): FarmEntry {
  return {
    id: "farm-1",
    name: "Copper hill",
    portal: "0123456789AB",
    galaxy: 0,
    planetName: "Ruba",
    resources: ["Copper"],
    ownerId: "member-1",
    ownerName: "Pilot",
    createdAt: "2026-05-01T12:00:00.000Z",
    stationHref: "/stations/owner%3A0123456789AB%3A0?from=farms",
    canManage: true,
    ...overrides,
  };
}

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/stations/owner%3A0123456789AB%3A0");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LinkedFarms", () => {
  it("loads the farms of the system and shows them read-only with a farm detail link", async () => {
    respond(200, { farms: [farm()] });
    renderWithLocale(
      <LinkedFarms currentMemberId="member-1" origin="stations" system={{ portal: "1123456789AB", galaxy: 3 }} />,
    );

    const link = await screen.findByRole("link", { name: "Copper hill" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/farms?systemPortal=1123456789AB&galaxy=3");
    expect(screen.getByRole("region", { name: "Linked farms" })).toBeInTheDocument();
    expect(link.getAttribute("href")).toMatch(/^\/farms\/farm-1\?from=stations&returnTo=/);
    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open linked station" })).not.toBeInTheDocument();
  });

  it("lists the newest farms first", async () => {
    respond(200, {
      farms: [
        farm({ id: "old", name: "Old farm", createdAt: "2026-01-01T00:00:00.000Z" }),
        farm({ id: "new", name: "New farm", createdAt: "2026-06-01T00:00:00.000Z" }),
        farm({ id: "mid", name: "Mid farm", createdAt: "2026-03-01T00:00:00.000Z" }),
      ],
    });
    renderWithLocale(
      <LinkedFarms currentMemberId="member-1" origin="stations" system={{ portal: "0123456789AB", galaxy: 0 }} />,
    );
    await screen.findByRole("link", { name: "New farm" });
    expect(screen.getAllByRole("link", { name: /farm$/ }).map((link) => link.textContent)).toEqual([
      "New farm",
      "Mid farm",
      "Old farm",
    ]);
  });

  it("renders nothing when the system has no farms", async () => {
    respond(200, { farms: [] });
    const { container } = renderWithLocale(
      <LinkedFarms currentMemberId="member-1" origin="missions" system={{ portal: "0123456789AB", galaxy: 0 }} />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows loading failures explicitly", async () => {
    respond(503, { error: "farms.error_unable_to_read" });
    renderWithLocale(
      <LinkedFarms currentMemberId="member-1" origin="missions" system={{ portal: "0123456789AB", galaxy: 0 }} />,
    );
    expect(await screen.findByText("Unable to load the farms.")).toBeInTheDocument();
  });

  it("uses the generic error when the request fails without an Error", async () => {
    fetchMock.mockRejectedValueOnce("offline");
    renderWithLocale(
      <LinkedFarms currentMemberId="member-1" origin="missions" system={{ portal: "0123456789AB", galaxy: 0 }} />,
    );
    expect(await screen.findByText("Unable to load the farms.")).toBeInTheDocument();
  });

  it("falls back to the generic error for unreadable responses", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 500 }));
    renderWithLocale(
      <LinkedFarms currentMemberId="member-1" origin="missions" system={{ portal: "0123456789AB", galaxy: 0 }} />,
    );
    expect(await screen.findByText("Unable to load the farms.")).toBeInTheDocument();
  });

  it("ignores responses that arrive after unmounting or for a previous system", async () => {
    let resolveFirst!: (response: Response) => void;
    let rejectSecond!: (error: unknown) => void;
    fetchMock
      .mockReturnValueOnce(new Promise<Response>((resolve) => (resolveFirst = resolve)))
      .mockReturnValueOnce(new Promise<Response>((_, reject) => (rejectSecond = reject)));
    const { rerender, unmount, container } = renderWithLocale(
      <LinkedFarms currentMemberId="member-1" origin="missions" system={{ portal: "0123456789AB", galaxy: 0 }} />,
    );
    rerender(
      <LinkedFarms currentMemberId="member-1" origin="missions" system={{ portal: "0123456789AC", galaxy: 0 }} />,
    );
    resolveFirst(new Response(JSON.stringify({ farms: [farm()] })));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    unmount();
    rejectSecond("offline");
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
