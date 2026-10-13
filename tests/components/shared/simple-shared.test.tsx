// @vitest-environment jsdom
import { act, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { MissionSystemProgress, roleOrder } from "@/components/shared/mission-system-progress";
import {
  NavigationSearchResetProvider,
  useNavigationSearchState,
  useRequestSearchReset,
} from "@/components/shared/navigation-search-reset";
import { renderWithLocale } from "../helpers";

describe("LoadingSpinner", () => {
  it("announces loading as a polite status in English", () => {
    renderWithLocale(<LoadingSpinner />);
    const status = screen.getByRole("status", { name: "Loading" });
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("uses the Italian label", () => {
    renderWithLocale(<LoadingSpinner />, { locale: "it" });
    expect(screen.getByRole("status", { name: "Caricamento" })).toBeInTheDocument();
  });
});

describe("MissionSystemProgress", () => {
  it("exports the role display order", () => {
    expect(roleOrder).toEqual(["ranger", "explorer", "builder"]);
  });

  it("summarises completed steps when read-only, without checkboxes", () => {
    renderWithLocale(
      <MissionSystemProgress editable={false} onToggle={vi.fn()} statuses={["station_claimed", "mapped"]} />,
    );
    expect(screen.getByRole("group", { name: "System progress: 2 of 7 complete" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Station claimed")).toBeInTheDocument();
    expect(screen.getByLabelText("Mapped")).toBeInTheDocument();
  });

  it("summarises in Italian", () => {
    renderWithLocale(<MissionSystemProgress editable={false} onToggle={vi.fn()} statuses={[]} />, { locale: "it" });
    expect(screen.getByRole("group", { name: "Avanzamento sistema: 0 di 7 completati" })).toBeInTheDocument();
    expect(screen.getByLabelText("Stazione riscattata")).toBeInTheDocument();
  });

  it("reports a data error and labels every step with it", () => {
    renderWithLocale(<MissionSystemProgress editable={false} onToggle={vi.fn()} statuses={["data_error", "mapped"]} />);
    expect(screen.getByRole("group", { name: "System progress: data error" })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Data error")).toHaveLength(7);
  });

  it("offers every step as a checkbox to moderators (no role restriction)", () => {
    renderWithLocale(<MissionSystemProgress editable onToggle={vi.fn()} statuses={["renamed"]} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(7);
    expect(screen.getByRole("checkbox", { name: "System renamed" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Mapped" })).not.toBeChecked();
  });

  it("restricts editable steps to the given roles and toggles them", async () => {
    const onToggle = vi.fn();
    const { user } = renderWithLocale(
      <MissionSystemProgress editable editableRoles={["explorer"]} onToggle={onToggle} statuses={["mapped"]} />,
    );
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((box) => box.getAttribute("aria-label"))).toEqual([
      "Mapped",
      "Planets classified",
      "Data uploaded",
    ]);
    expect(screen.queryByRole("checkbox", { name: "Station claimed" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Planets classified" }));
    expect(onToggle).toHaveBeenCalledWith("planets_classified", true);
    await user.click(screen.getByRole("checkbox", { name: "Mapped" }));
    expect(onToggle).toHaveBeenCalledWith("mapped", false);
  });

  it("disables the checkboxes while saving", () => {
    renderWithLocale(
      <MissionSystemProgress disabled editable editableRoles={["builder"]} onToggle={vi.fn()} statuses={[]} />,
    );
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    for (const box of boxes) expect(box).toBeDisabled();
  });
});

describe("navigation search reset", () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NavigationSearchResetProvider>{children}</NavigationSearchResetProvider>
  );

  it("keeps a search value and clears it when a reset is requested", () => {
    const { result } = renderHook(
      () => ({ state: useNavigationSearchState("start"), reset: useRequestSearchReset() }),
      { wrapper },
    );
    expect(result.current.state[0]).toBe("start");

    act(() => result.current.state[1]("alpha"));
    expect(result.current.state[0]).toBe("alpha");
    act(() => result.current.state[1]((current) => `${current}-beta`));
    expect(result.current.state[0]).toBe("alpha-beta");

    act(() => result.current.reset());
    expect(result.current.state[0]).toBe("");

    act(() => result.current.state[1]((current) => `${current}gamma`));
    expect(result.current.state[0]).toBe("gamma");
  });

  it("throws outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    function SearchOnly() {
      useNavigationSearchState("");
      return null;
    }
    function ResetOnly() {
      useRequestSearchReset();
      return null;
    }
    expect(() => render(<SearchOnly />)).toThrow(
      "useNavigationSearchState must be used inside NavigationSearchResetProvider",
    );
    expect(() => render(<ResetOnly />)).toThrow(
      "useRequestSearchReset must be used inside NavigationSearchResetProvider",
    );
  });
});
