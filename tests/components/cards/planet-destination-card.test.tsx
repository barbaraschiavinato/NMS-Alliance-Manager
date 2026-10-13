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
    expect(screen.getByText("Dissonant")).toBeInTheDocument();
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
    expect(screen.getByText("Dissonante")).toBeInTheDocument();
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

  it("ignores unknown sizes and dry planets", () => {
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
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
