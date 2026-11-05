// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinkedPets } from "@/components/shared/linked-pets";
import type { PetEntry } from "@/components/cards/pet-card";
import { renderWithLocale } from "../helpers";

vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname }));
vi.mock("next/link", async () => (await import("../helpers")).nextLinkModule);
vi.mock("next/image", async () => (await import("../helpers")).nextImageModule);

const fetchMock = vi.fn();
const system = { portal: "0123456789AB", galaxy: 0 };

function pet(overrides: Partial<PetEntry> = {}): PetEntry {
  return {
    id: "pet-1",
    name: "Fluffy",
    petType: "frost",
    activity: "unknown",
    habitat: "unknown",
    rarity: "unknown",
    eggTradeAvailable: false,
    classes: { combat: "S", agility: "A", health: "B" },
    portal: "0123456789AB",
    galaxy: 0,
    planetName: "Ruba",
    ownerId: "member-1",
    ownerName: "Pilot",
    createdAt: "2026-05-01T12:00:00.000Z",
    stationHref: "/stations/owner%3A0123456789AB%3A0?from=pets",
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

describe("LinkedPets", () => {
  it("loads the pets of the system and shows them read-only, without a link to the current station", async () => {
    respond(200, { pets: [pet()] });
    renderWithLocale(
      <LinkedPets currentMemberId="member-1" origin="stations" system={{ portal: "1123456789AB", galaxy: 3 }} />,
    );

    const link = await screen.findByRole("link", { name: "Fluffy" });
    expect(link.getAttribute("href")).toMatch(/^\/pets\/pet-1\?from=stations&returnTo=/);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/pets?systemPortal=1123456789AB&galaxy=3");
    expect(screen.getByRole("region", { name: "Linked pets" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open linked station" })).not.toBeInTheDocument();
  });

  it("lists the newest pets first", async () => {
    respond(200, {
      pets: [
        pet({ id: "old", name: "Old pet", createdAt: "2026-01-01T00:00:00.000Z" }),
        pet({ id: "new", name: "New pet", createdAt: "2026-06-01T00:00:00.000Z" }),
        pet({ id: "mid", name: "Mid pet", createdAt: "2026-03-01T00:00:00.000Z" }),
      ],
    });
    renderWithLocale(<LinkedPets currentMemberId="member-1" origin="stations" system={system} />);
    const section = await screen.findByRole("region", { name: "Linked pets" });
    expect(
      within(section)
        .getAllByText(/ pet$/)
        .map((node) => node.textContent),
    ).toEqual(["New pet", "Mid pet", "Old pet"]);
  });

  it("paginates long lists", async () => {
    respond(200, {
      pets: Array.from({ length: 51 }, (_, index) =>
        pet({
          id: `p${index}`,
          name: `Pet ${index}`,
          createdAt: `2026-05-01T12:00:${String(index).padStart(2, "0")}.000Z`,
        }),
      ),
    });
    const { user } = renderWithLocale(<LinkedPets currentMemberId="member-1" origin="stations" system={system} />);
    expect(await screen.findByText("Pet 50")).toBeInTheDocument();
    expect(screen.queryByText("Pet 0")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Pet 0")).toBeInTheDocument();
  });

  it("renders nothing when the system has no pets", async () => {
    respond(200, { pets: [] });
    const { container } = renderWithLocale(<LinkedPets currentMemberId="member-1" origin="stations" system={system} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows loading failures explicitly", async () => {
    respond(503, { error: "pets.error_unable_to_read" });
    renderWithLocale(<LinkedPets currentMemberId="member-1" origin="stations" system={system} />);
    expect(await screen.findByText("Unable to read the pets.")).toBeInTheDocument();
  });

  it("uses the generic error when the request fails without an Error or with an unreadable response", async () => {
    fetchMock.mockRejectedValueOnce("offline");
    const first = renderWithLocale(<LinkedPets currentMemberId="member-1" origin="stations" system={system} />);
    expect(await screen.findByText("Unable to read the pets.")).toBeInTheDocument();
    first.unmount();

    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 500 }));
    renderWithLocale(<LinkedPets currentMemberId="member-1" origin="stations" system={system} />);
    expect(await screen.findByText("Unable to read the pets.")).toBeInTheDocument();
  });

  it("ignores responses that arrive after unmounting or for a previous system", async () => {
    let resolveFirst!: (response: Response) => void;
    let rejectSecond!: (error: unknown) => void;
    fetchMock
      .mockReturnValueOnce(new Promise<Response>((resolve) => (resolveFirst = resolve)))
      .mockReturnValueOnce(new Promise<Response>((_, reject) => (rejectSecond = reject)));
    const { rerender, unmount, container } = renderWithLocale(
      <LinkedPets currentMemberId="member-1" origin="stations" system={system} />,
    );
    rerender(
      <LinkedPets currentMemberId="member-1" origin="stations" system={{ portal: "0123456789AC", galaxy: 0 }} />,
    );
    resolveFirst(new Response(JSON.stringify({ pets: [pet()] })));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    unmount();
    rejectSecond("offline");
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
