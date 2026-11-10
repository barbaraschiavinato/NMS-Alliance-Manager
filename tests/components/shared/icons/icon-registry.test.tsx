// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BuilderIcon,
  DiscordIcon,
  ExplorerIcon,
  FarmIcon,
  GoogleIcon,
  MapIcon,
  MissionIcon,
  PetIcon,
  PlanetIcon,
  RangerIcon,
  StationIcon,
  WaterLevelIcon,
  defaultAppIconPath,
  raceIconPaths,
  sectionIcons,
  specialtyIcons,
} from "@/components/shared/icons";
import { sectionAccents } from "@/lib/navigation/section-accents";

describe("icon registry", () => {
  it("defines an icon for every section that has an accent colour", () => {
    expect(Object.keys(sectionIcons).sort()).toEqual(Object.keys(sectionAccents).sort());
  });

  it("derives the named section and specialty icons from the maps", () => {
    expect(StationIcon).toBe(sectionIcons.stations);
    expect(MissionIcon).toBe(sectionIcons.missions);
    expect(PlanetIcon).toBe(sectionIcons.planets);
    expect(MapIcon).toBe(sectionIcons.map);
    expect(FarmIcon).toBe(sectionIcons.farms);
    expect(PetIcon).toBe(sectionIcons.pets);
    expect(RangerIcon).toBe(specialtyIcons.ranger);
    expect(ExplorerIcon).toBe(specialtyIcons.explorer);
    expect(BuilderIcon).toBe(specialtyIcons.builder);
  });

  it("uses the Gek mark as the default app icon", () => {
    expect(defaultAppIconPath).toBe(raceIconPaths.Gek);
    expect(Object.values(raceIconPaths).every((path) => path.startsWith("/icons/"))).toBe(true);
  });
});

describe("custom icons", () => {
  it("fills the water drop only when the planet has water", () => {
    const dry = render(<WaterLevelIcon clipId="dry" level={0} />);
    expect(dry.container.querySelector("clipPath")).toBeNull();
    expect(dry.container.querySelector(".planet-water-outline")).not.toBeNull();
    dry.unmount();

    const { container } = render(<WaterLevelIcon clipId="ocean" level={2} />);
    expect(container.querySelector("clipPath")).toHaveAttribute("id", "ocean");
    expect(container.querySelector(".planet-water-fill")).toHaveAttribute("clip-path", "url(#ocean)");
    expect(container.querySelector("rect")).toHaveAttribute("y", String(22 - 40 / 3));
  });

  it("draws the Discord logo as a filled lucide-style icon", () => {
    const { container } = render(<DiscordIcon size={15} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "15");
    expect(svg.querySelector("path")).toHaveAttribute("fill", "currentColor");
    expect(svg.querySelector("path")).toHaveAttribute("stroke", "none");
  });

  it("keeps the four Google brand colours", () => {
    const { container } = render(<GoogleIcon />);
    const fills = [...container.querySelectorAll("path")].map((path) => path.getAttribute("fill"));
    expect(fills).toEqual(["#4285F4", "#34A853", "#FBBC05", "#EA4335"]);
    expect(container.querySelector("svg")).toHaveAttribute("width", "18");
  });
});
