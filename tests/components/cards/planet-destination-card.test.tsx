// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PlanetDestinationCard,
  conflictLevels,
  type PlanetDestination,
} from "@/components/cards/planet-destination-card";
import { renderWithLocale } from "../helpers";

vi.mock("next/image", async () => (await import("../helpers")).nextImageModule);

function makePlanet(overrides: Partial<PlanetDestination> = {}): PlanetDestination {
  return {
    id: "planet-1",
    portal: "0123456789AB",
    planetPortal: "1123456789AB",
    planetNumber: 1,
    galaxy: 0,
    almanacSearchIndex: "",
    almanacFacts: [],
    systemFacts: [],
    plants: [],
    minerals: [],
    valuables: [],
    dissonant: false,
    paradise: false,
    blackMarket: false,
    ...overrides,
  };
}

describe("PlanetDestinationCard", () => {
  it.each(["en", "it"] as const)("shows discovery counts with translated tooltips in %s", (locale) => {
    renderWithLocale(
      <PlanetDestinationCard
        onOpen={vi.fn()}
        planet={makePlanet({ discoveryCounts: { flora: 19, fauna: 12, minerals: 23 } })}
      />,
      { locale },
    );
    for (const label of ["Flora: 19", "Fauna: 12", `${locale === "it" ? "Minerali" : "Minerals"}: 23`]) {
      expect(screen.getByRole("img", { name: label })).toHaveAttribute("data-tooltip", label);
    }
  });

  it("keeps zero visible and omits unavailable counts without changing the planet action", async () => {
    const onOpen = vi.fn();
    const planet = makePlanet({ discoveryCounts: { fauna: 0 } });
    const { user } = renderWithLocale(<PlanetDestinationCard onOpen={onOpen} planet={planet} />);
    expect(screen.getByRole("img", { name: "Fauna: 0" })).toHaveTextContent("0");
    expect(screen.queryByRole("img", { name: /Flora|Minerals/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledWith(planet);
  });

  it.each([undefined, {}])("hides the counter row when no discovery counts are available: %j", (discoveryCounts) => {
    const { container } = renderWithLocale(
      <PlanetDestinationCard onOpen={vi.fn()} planet={makePlanet({ discoveryCounts })} />,
    );
    expect(container.querySelector(".planet-discovery-counts")).toBeNull();
  });

  describe("visited checkbox", () => {
    const controls = (overrides = {}) => ({
      isVisited: vi.fn(() => false),
      isSaving: vi.fn(() => false),
      onToggle: vi.fn(),
      ...overrides,
    });

    it("is shown only for planets the member can mark and when controls are provided", () => {
      const { unmount } = renderWithLocale(
        <PlanetDestinationCard onOpen={vi.fn()} planet={makePlanet()} visits={controls()} />,
      );
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      unmount();
      const marked = makePlanet({ canMarkVisited: true });
      const { unmount: unmountMarked } = renderWithLocale(<PlanetDestinationCard onOpen={vi.fn()} planet={marked} />);
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      unmountMarked();
      renderWithLocale(<PlanetDestinationCard onOpen={vi.fn()} planet={marked} visits={controls()} />);
      const checkbox = screen.getByRole("checkbox", { name: "Visited" });
      expect(checkbox).not.toBeChecked();
      // Top right of the card, with the checkbox after (to the right of) its label.
      const label = checkbox.closest("label");
      expect(label).toHaveClass("planet-visited-check");
      expect(label?.firstElementChild).toHaveTextContent("Visited");
      expect(label?.lastElementChild).toBe(checkbox);
      expect(label?.parentElement).toHaveClass("planet-card-with-visit");
    });

    it("reflects the visited state, reports changes and does not open the planet", async () => {
      const onOpen = vi.fn();
      const visits = controls({ isVisited: vi.fn(() => true) });
      const planet = makePlanet({ canMarkVisited: true });
      const { user } = renderWithLocale(<PlanetDestinationCard onOpen={onOpen} planet={planet} visits={visits} />, {
        locale: "it",
      });
      const checkbox = screen.getByRole("checkbox", { name: "Visitato" });
      expect(checkbox).toBeChecked();
      await user.click(checkbox);
      expect(visits.onToggle).toHaveBeenCalledWith(planet, false);
      expect(onOpen).not.toHaveBeenCalled();
    });

    it("is disabled while the visit is being saved", () => {
      renderWithLocale(
        <PlanetDestinationCard
          onOpen={vi.fn()}
          planet={makePlanet({ canMarkVisited: true })}
          visits={controls({ isSaving: vi.fn(() => true) })}
        />,
      );
      expect(screen.getByRole("checkbox")).toBeDisabled();
    });
  });

  it("exports conflict levels", () => {
    expect(conflictLevels.Outlaw).toBe(3);
    expect(conflictLevels.None).toBe(0);
  });

  it("shows a numbered placeholder planet and opens it on click", async () => {
    const onOpen = vi.fn();
    const planet = makePlanet({ planetNumber: 4 });
    const { user, container } = renderWithLocale(<PlanetDestinationCard onOpen={onOpen} planet={planet} />);
    const button = screen.getByRole("button", { name: /Planet 4/ });
    expect(button).toHaveTextContent("1123456789AB");
    expect(screen.getByLabelText("Glyphs entered: 12 of 12")).toBeInTheDocument();
    expect(container.querySelector(".planet-mission-image")).toBeNull();
    expect(screen.queryByText("Dissonant")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    await user.click(button);
    expect(onOpen).toHaveBeenCalledWith(planet);
  });

  it("shows the Almanac name, image, ribbons, facts and indicators", () => {
    const { container } = renderWithLocale(
      <PlanetDestinationCard
        onOpen={vi.fn()}
        planet={makePlanet({
          almanacName: "Vesper",
          imageUrl: "https://nmsalmanac.com/api/planets/1.png",
          dissonant: true,
          paradise: true,
          almanacFacts: [
            { label: "planet.size", value: "Small" },
            { label: "planet.water", value: "Abundant" },
            { label: "common.planet_type_label", value: "Lush" },
          ],
        })}
      />,
    );
    expect(screen.getByRole("button", { name: /Vesper/ })).toBeInTheDocument();
    expect(container.querySelector("img.planet-mission-image")).toHaveAttribute(
      "src",
      "https://nmsalmanac.com/api/planets/1.png",
    );
    expect(screen.getByRole("img", { name: "Dissonant" })).toHaveClass("planet-dissonant-indicator");
    expect(container.querySelector(".planet-dissonant-ribbon")).toBeNull();
    expect(screen.getByText("Paradise")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Lush")).toBeInTheDocument();
    expect(screen.queryByText("Size")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Abundant" })).toBeInTheDocument();
    const size = screen.getByRole("img", { name: "Small" });
    expect(size.querySelector("i.active")).toHaveAttribute("data-step", "1");
  });

  it("translates facts and indicators into Italian", () => {
    renderWithLocale(
      <PlanetDestinationCard
        onOpen={vi.fn()}
        planet={makePlanet({
          dissonant: true,
          almanacFacts: [
            { label: "planet.size", value: "Moon" },
            { label: "common.planet_type_label", value: "Lush" },
          ],
        })}
      />,
      { locale: "it" },
    );
    expect(screen.getByRole("button", { name: /Pianeta 1/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Dissonante" })).toHaveAttribute("data-tooltip", "Dissonante");
    expect(screen.getByText("Tipo")).toBeInTheDocument();
    expect(screen.getByText("Lussureggiante")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Luna" })).toBeInTheDocument();
  });

  it.each([
    ["Huge", 3],
    ["Medium", 2],
  ])("marks the %s size level", (size, level) => {
    renderWithLocale(
      <PlanetDestinationCard
        onOpen={vi.fn()}
        planet={makePlanet({ almanacFacts: [{ label: "planet.size", value: size }] })}
      />,
    );
    expect(screen.getByRole("img", { name: size }).querySelector("i.active")).toHaveAttribute(
      "data-step",
      String(level),
    );
  });

  it.each([
    ["None", 0],
    ["Shallow", 1],
    ["Ocean", 2],
    ["Deep", 3],
    ["Abundant", 1],
  ])("shows a single drop filled to level %s (%i of 3)", (water, level) => {
    const { container } = renderWithLocale(
      <PlanetDestinationCard
        onOpen={vi.fn()}
        planet={makePlanet({ almanacFacts: [{ label: "planet.water", value: water }] })}
      />,
    );
    const indicator = container.querySelector(".planet-water-indicator");
    expect(indicator).toHaveAttribute("data-tooltip", water);
    expect(screen.getByRole("img", { name: water })).toBe(indicator);
    expect(container.querySelectorAll(".planet-water-indicator svg")).toHaveLength(1);
    expect(container.querySelectorAll(".planet-water-outline")).toHaveLength(1);
    expect(indicator?.classList.contains("has-water")).toBe(level > 0);
    const fill = container.querySelector(".planet-water-fill");
    if (level === 0) {
      expect(fill).toBeNull();
      expect(container.querySelector("clipPath")).toBeNull();
    } else {
      // The fill is clipped from the bottom: a higher level starts higher in the drop.
      const top = Number(container.querySelector("clipPath rect")?.getAttribute("y"));
      expect(top).toBeCloseTo(22 - (20 * level) / 3);
      expect(fill?.getAttribute("clip-path")).toBe(`url(#${container.querySelector("clipPath")?.id})`);
    }
  });

  it("gives every drop its own clip path", () => {
    const { container } = renderWithLocale(
      <>
        {["Shallow", "Deep"].map((water) => (
          <PlanetDestinationCard
            key={water}
            onOpen={vi.fn()}
            planet={makePlanet({ id: water, almanacFacts: [{ label: "planet.water", value: water }] })}
          />
        ))}
      </>,
    );
    const ids = [...container.querySelectorAll("clipPath")].map((clip) => clip.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => /^water-[a-zA-Z0-9]+$/.test(id))).toBe(true);
  });

  it("shows the dissonant icon first in the row of indicators, before size and water", () => {
    const { container } = renderWithLocale(
      <PlanetDestinationCard
        onOpen={vi.fn()}
        planet={makePlanet({
          dissonant: true,
          almanacFacts: [
            { label: "planet.size", value: "Large" },
            { label: "planet.water", value: "Deep" },
          ],
        })}
      />,
    );
    const classes = [...(container.querySelector(".planet-card-indicators")?.children ?? [])].map(
      (child) => child.className.split(" ")[0],
    );
    expect(classes).toEqual(["planet-dissonant-indicator", "planet-size-indicator", "planet-water-indicator"]);
  });

  it("keeps the paradise ribbon on the left, away from the visited checkbox", () => {
    const { container } = renderWithLocale(
      <PlanetDestinationCard
        onOpen={vi.fn()}
        planet={makePlanet({ paradise: true, canMarkVisited: true })}
        visits={{ isVisited: () => false, isSaving: () => false, onToggle: vi.fn() }}
      />,
    );
    expect(container.querySelector(".planet-ribbon-clip-left .planet-paradise-ribbon")).not.toBeNull();
    expect(container.querySelectorAll(".planet-ribbon-clip")).toHaveLength(1);
  });

  it("places the water drop to the right of the size indicator", () => {
    const { container } = renderWithLocale(
      <PlanetDestinationCard
        onOpen={vi.fn()}
        planet={makePlanet({
          almanacFacts: [
            { label: "planet.size", value: "Large" },
            { label: "planet.water", value: "Deep" },
          ],
        })}
      />,
    );
    const indicators = container.querySelector(".planet-card-indicators");
    expect(indicators?.children[0]).toHaveClass("planet-size-indicator");
    expect(indicators?.children[1]).toHaveClass("planet-water-indicator");
  });

  it("ignores unknown sizes", () => {
    renderWithLocale(
      <PlanetDestinationCard
        onOpen={vi.fn()}
        planet={makePlanet({
          almanacFacts: [
            { label: "planet.size", value: "Gigantic" },
            { label: "planet.water", value: "None" },
          ],
        })}
      />,
    );
    // Only the empty water drop remains: Gigantic is not a known size.
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img", { name: "None" })).toHaveClass("planet-water-indicator");
  });
});
