// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StationSystemCoreInfo } from "@/components/shared/station-system-core-info";
import { renderWithLocale } from "../helpers";

const nmsCore = vi.hoisted(() => ({
  systemAttributes: vi.fn(),
  planetSeeds: vi.fn(),
}));

vi.mock("@/lib/nms-core/system.js", () => nmsCore);

beforeEach(() => {
  nmsCore.systemAttributes.mockReturnValue({ star_type: 3 });
  nmsCore.planetSeeds.mockReturnValue({ planet_seeds: [1, 2, 3, 4] });
});

describe("StationSystemCoreInfo", () => {
  it("shows planet count and star colour in English", async () => {
    renderWithLocale(<StationSystemCoreInfo galaxy={1} portal="0123456789ab" />);
    expect(await screen.findByText("4 planets · red star")).toBeInTheDocument();
    expect(nmsCore.systemAttributes).toHaveBeenCalledWith(BigInt("0x0123456789ab"), 1);
  });

  it("shows planet count and star colour in Italian", async () => {
    nmsCore.systemAttributes.mockReturnValue({ star_type: 0 });
    renderWithLocale(<StationSystemCoreInfo galaxy={0} portal="0123456789AB" />, { locale: "it" });
    expect(await screen.findByText("4 pianeti · Stella gialla/bianca")).toBeInTheDocument();
  });

  it.each([
    ["an out-of-range planet count", () => nmsCore.planetSeeds.mockReturnValue({ planet_seeds: [] })],
    ["an unknown star type", () => nmsCore.systemAttributes.mockReturnValue({ star_type: 9 })],
    [
      "a calculation error",
      () =>
        nmsCore.systemAttributes.mockImplementation(() => {
          throw new Error("boom");
        }),
    ],
  ])("reports unavailable data for %s", async (_label, arrange) => {
    arrange();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderWithLocale(<StationSystemCoreInfo galaxy={0} portal="0123456789AB" />);
    expect(await screen.findByText("System data unavailable")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
  });

  it.each([
    ["an incomplete portal", "0123", 0],
    ["a galaxy out of range", "0123456789AB", 256],
  ])("renders nothing for %s", async (_label, portal, galaxy) => {
    const { container } = renderWithLocale(<StationSystemCoreInfo galaxy={galaxy} portal={portal} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(nmsCore.systemAttributes).not.toHaveBeenCalled();
  });

  it("discards the summary computed after the component unmounts", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = renderWithLocale(<StationSystemCoreInfo galaxy={0} portal="0123456789AB" />);
    unmount();
    await waitFor(() => expect(nmsCore.planetSeeds).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("only logs a calculation error that happens after the component unmounts", async () => {
    nmsCore.systemAttributes.mockImplementation(() => {
      throw new Error("boom");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = renderWithLocale(<StationSystemCoreInfo galaxy={0} portal="0123456789AB" />);
    unmount();
    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        "Unable to calculate station system details with nms-core",
        expect.any(Error),
      ),
    );
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});
