// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanetCard } from "@/components/modals/planet-card";
import { json, mockFetch, renderPage, t } from "./helpers";

vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
// planetSeeds si può sostituire per singolo test (numero di pianeti non valido, errori di nms-core).
const seeds = vi.hoisted(() => ({ override: undefined as (() => { planet_seeds: number[] }) | undefined, calls: 0 }));
vi.mock("@/lib/nms-core/system.js", async () => {
  const core = (await import("./helpers")).nmsCoreModule;
  return {
    ...core,
    planetSeeds: () => {
      seeds.calls += 1;
      return (seeds.override ?? core.planetSeeds)();
    },
  };
});

const lushPlanet = {
  lines: {
    headline: { word: "Verdant Moon" },
    band: {
      type: { word: "Lush" },
      size: { word: "Large" },
      weather: { word: "Humid" },
      fauna: { word: "Ample", stars: 2 },
      features: [{ word: "Caves" }, { word: "Arches" }],
      star: { word: "Yellow" },
      economy: { word: "Trading", marks: [{ word: "Wealthy" }] },
      race: { word: "Gek" },
    },
  },
  sky: { day: "#AABBCC", night: "#112233" },
  pictures: { disc: "/planets/verdant.png" },
  carries: [
    { name: "Copper", kind: "mineral" },
    { name: "Star Bulb", kind: "plant" },
    { name: "Ancient Bones", kind: "component" },
    { name: "Gold", kind: "tradeable" },
    { name: "Mystery", kind: "strange" },
  ],
  paradise: true,
};

const barrenPlanet = { lines: { band: { type: { word: "Barren" } } } };

function renderCard(props: Partial<Parameters<typeof PlanetCard>[0]> = {}) {
  const onClose = vi.fn();
  const view = renderPage(
    <PlanetCard galaxy={0} onClose={onClose} portal="1234567890AB" title="Mission planet" {...props} />,
  );
  return { ...view, onClose };
}

afterEach(() => {
  vi.unstubAllGlobals();
  seeds.override = undefined;
  seeds.calls = 0;
});

describe("PlanetCard", () => {
  it("loads every planet in the system and switches between them", async () => {
    const { calls } = mockFetch({
      "/api/missions/planet": ({ url }: { url: URL }) => {
        const address = url.searchParams.get("address");
        if (address === "1234567890AB") return { planet: lushPlanet };
        if (address === "2234567890AB") return { planet: barrenPlanet };
        return json({ error: "missing" }, 404);
      },
    });
    const { user } = renderCard({ contextLabel: "Euclid · Alpha", missionDescription: "Find the caves" });

    expect(screen.getByText(t("common.loading_archived_details"))).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Verdant Moon/ })).toBeInTheDocument();
    expect(screen.getByText("Find the caves")).toBeInTheDocument();
    expect(screen.getByText("Euclid · Alpha")).toBeInTheDocument();
    expect(screen.getByText(t("planet.paradise"))).toBeInTheDocument();
    expect(screen.getByText("Caves, Arches")).toBeInTheDocument();
    expect(screen.getByText("Ample · ★★☆")).toBeInTheDocument();
    expect(screen.getByLabelText(`${t("common.day")} #AABBCC`)).toBeInTheDocument();
    expect(screen.getByText("Copper")).toBeInTheDocument();
    expect(screen.getByText("Mystery")).toBeInTheDocument();
    expect(document.querySelector(".planet-card-image")).toHaveAttribute(
      "src",
      "https://nmsalmanac.com/api/planets/verdant.png",
    );
    // Planet indexes 1, 2 (from nms-core) and 1 again from the portal: two requests.
    expect(calls.map((call) => call.url.searchParams.get("address"))).toEqual(["1234567890AB", "2234567890AB"]);

    const tabs = screen.getByRole("navigation", { name: t("planet.planets_in_system") });
    await user.click(within(tabs).getByRole("button", { name: "Barren" }));
    expect(within(tabs).getByRole("button", { name: "Barren" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2234567890AB", { selector: ".planet-intro-code" })).toBeInTheDocument();
  });

  it("shows the empty and error messages", async () => {
    mockFetch({ "/api/missions/planet": json({ error: "planet.almanac_lookup_failed" }, 502) });
    renderCard();

    expect(await screen.findByText(t("planet.almanac_lookup_failed"))).toBeInTheDocument();
  });

  it("explains when nothing is archived", async () => {
    mockFetch({});
    renderCard();

    expect(await screen.findByText(t("planet.no_almanac_details_are_archived_for_this_mission"))).toBeInTheDocument();
  });

  it("uses the initial data without fetching and closes", async () => {
    const { fetchMock } = mockFetch({});
    const { user, onClose } = renderCard({
      initialPlanetData: lushPlanet,
      initialPlanetPortal: "1234567890AB",
      inlinePreview: true,
    });

    expect(screen.getByRole("heading", { name: /Verdant Moon/ })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: t("planet.close_planet_details") }));
    expect(onClose).toHaveBeenCalled();
  });

  it("sends a help request for the selected planet", async () => {
    const changed = vi.fn();
    window.addEventListener("help-requests-changed", changed);
    const { requests } = mockFetch({
      "POST /api/help-requests": vi
        .fn()
        .mockReturnValueOnce(json({ error: "help.request_unable_to_save" }, 500))
        .mockReturnValueOnce({ ok: true }),
    });
    const { user } = renderCard({ initialPlanetData: lushPlanet });

    await user.click(screen.getByRole("button", { name: t("help.request_help") }));
    const send = screen.getByRole("button", { name: t("help.send_request") });
    expect(send).toBeDisabled();
    await user.type(
      screen.getByRole("textbox", { name: t("help.request_help_for", { subject: "Verdant Moon" }) }),
      "Need fuel",
    );
    expect(send).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: t("profile.message_mission_only_notice") }));
    await user.click(send);
    expect(await screen.findByText(t("help.request_unable_to_save"))).toBeInTheDocument();

    await user.click(send);
    expect(await screen.findByText(t("help.request_sent"))).toBeInTheDocument();
    expect(requests("POST", "/api/help-requests")[1].body).toEqual({
      message: "Need fuel",
      subject: "Verdant Moon",
      portal: "1234567890AB",
      galaxy: 0,
    });
    await waitFor(() => expect(changed).toHaveBeenCalled());
    window.removeEventListener("help-requests-changed", changed);
  });
  it("formats plain, partial and unknown almanac values", () => {
    mockFetch({});
    renderCard({
      initialPlanetData: {
        lines: {
          band: {
            type: "Odd World",
            size: 42,
            features: [{}, null],
            flora: { note: "Sparse growth" },
            fauna: { stars: 7 },
            minerals: { marks: [{ word: "Rich veins" }, 5, { other: true }] },
            sentinels: {},
            weather: true,
            conflict: ["Calm skies", 2],
          },
        },
        sky: { day: "not-a-colour", night: 3 },
        pictures: { disc: "https://elsewhere.example/disc.png" },
        carries: [null, { name: "Nameless" }, { name: "Odd Ore", kind: "mineral" }],
      },
    });

    expect(screen.getByRole("heading", { name: new RegExp(t("planet.fallback_name")) })).toBeInTheDocument();
    expect(screen.getByText("Odd World")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Sparse growth")).toBeInTheDocument();
    expect(screen.getByText("★★★")).toBeInTheDocument();
    expect(screen.getByText("Rich veins")).toBeInTheDocument();
    expect(screen.getByText("Calm skies, 2")).toBeInTheDocument();
    for (const label of ["Features", "Sentinels", "Weather"])
      expect(screen.queryByText(t(label))).not.toBeInTheDocument();
    expect(screen.queryByText(t("planet.sky"))).not.toBeInTheDocument();
    expect(document.querySelector(".planet-card-image")).not.toBeInTheDocument();
    expect(screen.getByText("Odd Ore")).toBeInTheDocument();
    expect(screen.queryByText("Nameless")).not.toBeInTheDocument();
  });

  it("names unnamed planets by number and picks the first archived one", async () => {
    const { calls } = mockFetch({
      "/api/missions/planet": ({ url }: { url: URL }) => {
        const address = url.searchParams.get("address");
        if (address === "1234567890AB") return json({ error: "missing" }, 404);
        if (address === "2234567890AB") return { planet: { paradise: false } };
        return { planet: barrenPlanet };
      },
    });
    seeds.override = () => ({ planet_seeds: [1, 2, 3] });
    const { user } = renderCard({ portal: "0234567890AB" });

    const tabs = await screen.findByRole("navigation", { name: t("planet.planets_in_system") });
    // Il portale (pianeta 0) non è archiviato: viene selezionato il primo pianeta trovato.
    expect(within(tabs).getByRole("button", { name: `${t("planet.planet_label")} 1` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("2234567890AB", { selector: ".planet-intro-code" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: t("planet.resources") })).not.toBeInTheDocument();
    expect(screen.queryByText(t("planet.paradise"))).not.toBeInTheDocument();
    expect(calls.map((call) => call.url.searchParams.get("address"))).toEqual([
      "1234567890AB",
      "2234567890AB",
      "3234567890AB",
    ]);
    await user.click(within(tabs).getByRole("button", { name: "Barren" }));
    expect(screen.getByText("3234567890AB", { selector: ".planet-intro-code" })).toBeInTheDocument();
  });

  it("reports invalid planet counts and nms-core failures", async () => {
    mockFetch({});
    seeds.override = () => ({ planet_seeds: [] });
    const first = renderCard();
    expect(await screen.findByText("Invalid system planet count.")).toBeInTheDocument();
    first.unmount();

    seeds.override = () => ({ planet_seeds: [1, 2, 3, 4, 5, 6, 7] });
    const second = renderCard();
    expect(await screen.findByText("Invalid system planet count.")).toBeInTheDocument();
    second.unmount();

    seeds.override = () => {
      throw "core exploded";
    };
    renderCard();
    expect(await screen.findByText(t("planet.almanac_lookup_failed"))).toBeInTheDocument();
  });

  it("reports malformed lookup responses with the generic error", async () => {
    for (const route of [{ other: true }, json({}, 500), () => Promise.reject("offline")]) {
      mockFetch({ "/api/missions/planet": route });
      const { unmount } = renderCard();
      expect(await screen.findByText(t("planet.almanac_lookup_failed"))).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: t("planet.conditions") })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("stops loading once the card is closed", async () => {
    const pending: Array<{ resolve: (value: unknown) => void; reject: (reason: unknown) => void }> = [];
    const { fetchMock } = mockFetch({
      "/api/missions/planet": () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    });

    // Chiusa durante la prima richiesta, che poi risponde: le successive non partono.
    let view = renderCard();
    await waitFor(() => expect(pending).toHaveLength(1));
    view.unmount();
    pending[0].resolve({ planet: lushPlanet });
    // Chiusa durante la prima richiesta, che poi fallisce.
    view = renderCard();
    await waitFor(() => expect(pending).toHaveLength(2));
    view.unmount();
    pending[1].reject(new Error("aborted"));
    // Chiusa durante l'unica richiesta del sistema.
    seeds.override = () => ({ planet_seeds: [1] });
    view = renderCard();
    await waitFor(() => expect(pending).toHaveLength(3));
    view.unmount();
    pending[2].resolve({ planet: lushPlanet });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
  });

  it("does not report nms-core failures after closing", async () => {
    const { fetchMock } = mockFetch({});
    seeds.override = () => {
      throw new Error("too late");
    };
    renderCard().unmount();
    await waitFor(() => expect(seeds.calls).toBe(1));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the generic help error for unreadable or missing errors", async () => {
    const { requests } = mockFetch({
      "POST /api/help-requests": vi
        .fn()
        .mockReturnValueOnce(new Response("not json", { status: 500 }))
        .mockReturnValueOnce(json({ error: 5 }, 500))
        .mockImplementationOnce(() => Promise.reject("offline")),
    });
    const { user } = renderCard({ initialPlanetData: lushPlanet });

    await user.click(screen.getByRole("button", { name: t("help.request_help") }));
    await user.type(
      screen.getByRole("textbox", { name: t("help.request_help_for", { subject: "Verdant Moon" }) }),
      "Help",
    );
    await user.click(screen.getByRole("checkbox", { name: t("profile.message_mission_only_notice") }));
    const send = screen.getByRole("button", { name: t("help.send_request") });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await user.click(send);
      await waitFor(() => expect(send).toBeEnabled());
      expect(screen.getByText(t("help.request_unable_to_save"))).toBeInTheDocument();
    }
    expect(requests("POST", "/api/help-requests")).toHaveLength(3);
    expect(screen.queryByText(t("help.request_sent"))).not.toBeInTheDocument();
  });
});
