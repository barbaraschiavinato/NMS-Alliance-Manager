// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GalaxyIcon } from "@/components/shared/galaxy-icon";

describe("GalaxyIcon", () => {
  it("draws two spiral arms with the lucide stroke style and size", () => {
    const { container } = render(<GalaxyIcon size={17} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveClass("lucide", "lucide-galaxy");
    expect(svg).toHaveAttribute("width", "17");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg.querySelectorAll("circle")).toHaveLength(0);
    expect(svg.querySelectorAll("path")).toHaveLength(2);
  });
});
