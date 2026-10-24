// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SystemFeatureBadge } from "@/components/shared/system-feature-badge";
import * as feature from "@/lib/planets/system-feature";
import { renderWithLocale } from "../helpers";

vi.mock("@/lib/planets/system-feature", async (original) => {
  const actual = await original<typeof import("@/lib/planets/system-feature")>();
  return { systemFeature: vi.fn(actual.systemFeature) };
});

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("@/lib/planets/system-feature")>("@/lib/planets/system-feature");
  vi.mocked(feature.systemFeature).mockImplementation(actual.systemFeature);
});

describe("SystemFeatureBadge", () => {
  it("labels black holes and Atlas Interfaces in both languages", async () => {
    const english = renderWithLocale(<SystemFeatureBadge galaxy={0} portal="007902304626" />);
    expect(await screen.findByText("Black hole")).toHaveClass("system-feature", "system-feature-black-hole");
    english.unmount();
    renderWithLocale(<SystemFeatureBadge galaxy={0} portal="007A02304626" />, { locale: "it" });
    expect(await screen.findByText("Interfaccia Atlas")).toHaveClass("system-feature-atlas");
  });

  it.each([
    ["007902304626", "Black hole"],
    ["007A02304626", "Atlas Interface"],
    ["03EA02304626", "Gas giant"],
  ])("draws a decorative icon next to %s", async (portal, label) => {
    renderWithLocale(<SystemFeatureBadge galaxy={0} portal={portal} />);
    const icon = (await screen.findByText(label)).querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("width", "11");
  });

  it("labels purple gas giant systems in both languages", async () => {
    const english = renderWithLocale(<SystemFeatureBadge galaxy={0} portal="03EA02304626" />);
    expect(await screen.findByText("Gas giant")).toHaveClass("system-feature-gas-giant");
    english.unmount();
    renderWithLocale(<SystemFeatureBadge galaxy={0} portal="03EA02304626" />, { locale: "it" });
    expect(await screen.findByText("Gigante gassoso")).toBeInTheDocument();
  });

  it("renders nothing for ordinary systems", async () => {
    const { container } = renderWithLocale(<SystemFeatureBadge galaxy={0} portal="007802304626" />);
    await waitFor(() => expect(feature.systemFeature).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it("follows the portal and never shows a stale badge", async () => {
    const { rerender } = renderWithLocale(<SystemFeatureBadge galaxy={0} portal="007902304626" />);
    expect(await screen.findByText("Black hole")).toBeInTheDocument();
    rerender(<SystemFeatureBadge galaxy={0} portal="007802304626" />);
    await waitFor(() => expect(screen.queryByText("Black hole")).not.toBeInTheDocument());
  });

  it("ignores a result that arrives after unmounting and logs calculation errors", async () => {
    let finish: (value: "atlas") => void = () => {};
    vi.mocked(feature.systemFeature).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    renderWithLocale(<SystemFeatureBadge galaxy={0} portal="007A02304626" />).unmount();
    finish("atlas");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(feature.systemFeature).mockRejectedValueOnce(new Error("boom"));
    const { container } = renderWithLocale(<SystemFeatureBadge galaxy={0} portal="007A02304626" />);
    await waitFor(() => expect(error).toHaveBeenCalledWith(expect.any(String), expect.any(Error)));
    expect(container).toBeEmptyDOMElement();
  });
});
