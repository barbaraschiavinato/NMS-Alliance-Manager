import { describe, expect, it } from "vitest";
import { galaxyLabel, galaxyNames } from "@/lib/galaxies";

describe("galaxies", () => {
  it("has 256 unique names", () => {
    expect(galaxyNames).toHaveLength(256);
    expect(new Set(galaxyNames).size).toBe(256);
  });

  it("labels known galaxies by name", () => {
    expect(galaxyLabel(0)).toBe("Euclide");
    expect(galaxyLabel(1)).toBe("Hilbert Dimension");
    expect(galaxyLabel(255)).toBe("Odyalutai");
  });

  it("falls back to a numbered label outside the list", () => {
    expect(galaxyLabel(256)).toBe("Galassia 256");
    expect(galaxyLabel(-1)).toBe("Galassia -1");
  });
});
