// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PetTypeIcon, petTypeIcons } from "@/components/shared/icons";
import { petTypes } from "@/lib/pets/pets";

describe("pet type icons", () => {
  it("defines a colour, a viewBox and drawable paths for every pet type", () => {
    expect(Object.keys(petTypeIcons).sort()).toEqual([...petTypes].sort());
    for (const type of petTypes) {
      const icon = petTypeIcons[type];
      expect(icon.color, type).toMatch(/^#[0-9A-F]{6}$/);
      expect(icon.viewBox, type).toBe("0 0 64 64");
      expect(icon.paths.length, type).toBeGreaterThan(0);
      for (const path of icon.paths) {
        expect(path.d, type).not.toBe("");
        expect(path.fill, type).toBeTruthy();
      }
    }
  });

  it.each(petTypes)("renders the %s icon in its colour, hidden from assistive technology", (type) => {
    const { container } = render(<PetTypeIcon className="custom" size={20} type={type} />);
    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("custom");
    expect(svg).toHaveAttribute("width", "20");
    expect(svg).toHaveAttribute("viewBox", "0 0 64 64");
    expect(svg.style.color).not.toBe("");
    expect(svg.querySelectorAll("path")).toHaveLength(petTypeIcons[type].paths.length);
  });

  it("uses a default size and keeps stroke details such as round caps", () => {
    const { container } = render(<PetTypeIcon type="frost" />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "14");
    expect(container.querySelector("path")).toHaveAttribute("stroke-linecap", "round");
  });
});
