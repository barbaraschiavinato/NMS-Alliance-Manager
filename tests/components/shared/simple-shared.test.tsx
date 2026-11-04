// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
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

  it("positions description and covered-task tooltips the same way", () => {
    const style = document.createElement("style");
    style.textContent = readFileSync(path.resolve(__dirname, "../../../src/styles/missions.css"), "utf8");
    document.head.append(style);
    try {
      if (!style.sheet) throw new Error("Unable to load mission styles.");
      const rules = Array.from(style.sheet.cssRules);
      const findRule = (selector: string) => {
        const rule = rules.find(
          (item): item is CSSStyleRule =>
            item instanceof CSSStyleRule && item.selectorText.split(",").some((part) => part.trim() === selector),
        );
        if (!rule) throw new Error(`Missing CSS rule: ${selector}`);
        return rule;
      };
      const tooltip = findRule(".mission-system-progress-item-description[data-tooltip]::after");
      expect(findRule(".mission-system-progress-item-covered[data-tooltip]::after")).toBe(tooltip);
      expect(tooltip.style.getPropertyValue("max-width")).toBe("min(220px, calc(100vw - 32px))");
      expect(tooltip.style.left).toBe("var(--system-task-tooltip-anchor-left)");
      const anchor = findRule(".mission-system-progress-item-description");
      expect(findRule(".mission-system-progress-item-covered")).toBe(anchor);
      expect(anchor.style.getPropertyValue("--system-task-tooltip-anchor-left")).toBe("6px");
      const labeledAnchor = findRule(".mission-system-progress-item-labeled.mission-system-progress-item-description");
      expect(findRule(".mission-system-progress-item-labeled.mission-system-progress-item-covered")).toBe(
        labeledAnchor,
      );
      expect(labeledAnchor.style.getPropertyValue("--system-task-tooltip-anchor-left")).toBe("4px");
      const visibleRule = rules.find(
        (rule): rule is CSSStyleRule =>
          rule instanceof CSSStyleRule &&
          rule.selectorText.includes(".mission-system-progress-item-covered[data-tooltip]:is(") &&
          rule.selectorText.includes("::after"),
      );
      expect(visibleRule?.selectorText).toContain(".mission-system-progress-item-description[data-tooltip]:is(");
      expect(visibleRule?.style.transform).toBe("translate(0, 0)");
      const arrow = findRule(".mission-system-progress-item[data-tooltip]::before");
      expect(arrow.style.left).toBe("50%");
      expect(arrow.style.transform).toBe("translate(-50%, 5px) rotate(45deg)");
      expect(
        rules.some(
          (rule) =>
            rule instanceof CSSStyleRule &&
            (rule.selectorText.includes(".mission-system-progress-item-description") ||
              rule.selectorText.includes(".mission-system-progress-item-covered")) &&
            rule.selectorText.includes("::before"),
        ),
      ).toBe(false);
    } finally {
      style.remove();
    }
  });

  it("summarises completed steps when read-only, without checkboxes", () => {
    renderWithLocale(
      <MissionSystemProgress editable={false} onToggle={vi.fn()} statuses={["station_claimed", "mapped"]} />,
    );
    expect(screen.getByRole("group", { name: "System progress: 2 of 7 complete" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Station claimed")).toBeInTheDocument();
    expect(screen.getByLabelText("System scanned")).toBeInTheDocument();
  });

  it("summarises in Italian", () => {
    renderWithLocale(<MissionSystemProgress editable={false} onToggle={vi.fn()} statuses={[]} />, { locale: "it" });
    expect(screen.getByRole("group", { name: "Avanzamento sistema: 0 di 9 completati" })).toBeInTheDocument();
    expect(screen.getByLabelText("Stazione riscattata")).toBeInTheDocument();
  });

  it("describes active tasks with their specialty colors without changing checkbox names", () => {
    renderWithLocale(
      <MissionSystemProgress allianceName="Artemis" editable onToggle={vi.fn()} statuses={["renamed"]} />,
      { locale: "it" },
    );

    const station = screen.getByRole("checkbox", { name: "Stazione riscattata" });
    const stationLabel = station.closest("label");
    const descriptionId = station.getAttribute("aria-describedby");
    expect(stationLabel).toHaveClass("system-task-tooltip-ranger");
    expect(stationLabel).toHaveClass("mission-system-progress-item-description");
    expect(stationLabel).toHaveAttribute(
      "data-tooltip",
      "Stazione riscattata\nLa stazione spaziale è stata acquistata completando gli obiettivi di sistema, riscattando il nucleo centrale, aggiungendola all'alleanza Artemis e rinominandola con il prefisso «[Artemis]» prima del nome.",
    );
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId!)).toHaveTextContent("prefisso «[Artemis]»");
    station.focus();
    expect(station).toHaveFocus();

    const [rangerScan, explorerScan] = screen.getAllByRole("checkbox", { name: "Sistema scansionato" });
    expect(rangerScan.closest("label")).toHaveClass("system-task-tooltip-ranger");
    expect(explorerScan.closest("label")).toHaveClass("system-task-tooltip-explorer");
    expect(rangerScan.closest("label")?.getAttribute("data-tooltip")).toBe(
      explorerScan.closest("label")?.getAttribute("data-tooltip"),
    );
    expect(screen.getByRole("checkbox", { name: "Edifici costruiti" }).closest("label")).toHaveClass(
      "system-task-tooltip-builder",
    );
    const renamed = screen.getByRole("checkbox", { name: "Sistema rinominato" });
    expect(renamed).toBeChecked();
    expect(renamed.closest("label")).toHaveAttribute(
      "data-tooltip",
      "Sistema rinominato\nIl sistema è stato rinominato con il prefisso «[Artemis]» prima del nome.",
    );
  });

  it("shows only the description for labeled tasks and associates it with the checkbox", () => {
    renderWithLocale(
      <MissionSystemProgress
        allianceName="Artemis"
        editable
        editableRoles={["ranger"]}
        onToggle={vi.fn()}
        statuses={[]}
      />,
    );
    const station = screen.getByRole("checkbox", { name: "Station claimed" });
    expect(station.closest("label")).toHaveClass("mission-system-progress-item-labeled");
    expect(station.closest("label")).toHaveAttribute(
      "data-tooltip",
      'The space station has been purchased by completing the system objectives and claiming the central core, added to the Artemis alliance, and renamed with the prefix "[Artemis]" before its name.',
    );
    expect(station).toHaveAttribute("aria-describedby");
    expect(document.getElementById(station.getAttribute("aria-describedby")!)).toHaveTextContent(
      'with the prefix "[Artemis]"',
    );
  });

  it.each([
    ["en", "Station claimed", "System renamed"],
    ["it", "Stazione riscattata", "Sistema rinominato"],
  ] as const)("shows only the task title in the compact read-only tooltip (%s)", (locale, claimed, renamed) => {
    renderWithLocale(
      <MissionSystemProgress allianceName="Artemis" editable={false} onToggle={vi.fn()} statuses={[]} />,
      { locale },
    );
    for (const title of [claimed, renamed]) {
      const readOnly = screen.getByLabelText(title);
      expect(readOnly).toHaveAttribute("tabindex", "0");
      expect(readOnly).not.toHaveClass("mission-system-progress-item-description");
      expect(readOnly).not.toHaveAttribute("aria-describedby");
      expect(readOnly).toHaveAttribute("data-tooltip", title);
    }
  });

  it("shows only the Italian description in the labeled task tooltip", () => {
    renderWithLocale(
      <MissionSystemProgress
        allianceName="ITAlliance"
        editable
        editableRoles={["ranger"]}
        onToggle={vi.fn()}
        statuses={[]}
      />,
      { locale: "it" },
    );
    const renamed = screen.getByRole("checkbox", { name: "Sistema rinominato" });
    expect(renamed.closest("label")).toHaveAttribute(
      "data-tooltip",
      "Il sistema è stato rinominato con il prefisso «[ITAlliance]» prima del nome.",
    );
    const descriptionId = renamed.getAttribute("aria-describedby");
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId!)).toHaveTextContent(
      "Il sistema è stato rinominato con il prefisso «[ITAlliance]» prima del nome.",
    );
  });

  it("uses the renamed Italian task label on mission cards", () => {
    renderWithLocale(<MissionSystemProgress editable={false} onToggle={vi.fn()} statuses={["mapped"]} />, {
      locale: "it",
    });
    expect(screen.getByLabelText("Sistema scansionato")).toBeInTheDocument();
    expect(screen.queryByLabelText("Mappato")).not.toBeInTheDocument();
  });

  it("hides Ranger tasks covered by the Explorer in the compact read-only summary", () => {
    renderWithLocale(<MissionSystemProgress editable={false} onToggle={vi.fn()} statuses={["mapped"]} />, {
      locale: "it",
    });
    const group = screen.getByRole("group", { name: "Avanzamento sistema: 1 di 7 completati" });
    expect(group.querySelectorAll(".mission-system-progress-item")).toHaveLength(7);
    for (const task of ["Sistema scansionato", "Dati sistema caricati"]) {
      expect(screen.queryByLabelText(`${task}: preso in carico dall'Esploratore`)).not.toBeInTheDocument();
    }
    expect(screen.getByLabelText("Sistema scansionato")).toBeInTheDocument();
    expect(screen.queryByLabelText("Dati sistema caricati")).not.toBeInTheDocument();
  });

  it("shows the covered Ranger tasks as ticked, disabled checkboxes", async () => {
    const onToggle = vi.fn();
    const { user } = renderWithLocale(
      <MissionSystemProgress editable editableRoles={["ranger"]} onToggle={onToggle} statuses={["mapped"]} />,
    );
    const covered = screen.getByRole("checkbox", { name: "System data uploaded: taken over by the Explorer" });
    expect(covered).toBeChecked();
    expect(covered).toBeDisabled();
    expect(covered.closest("label")).toHaveClass("system-task-tooltip-explorer");
    expect(covered.closest("label")).toHaveClass(
      "mission-system-progress-item-covered",
      "mission-system-progress-item-labeled",
    );
    expect(covered.closest("label")).not.toHaveClass("mission-system-progress-item-description");
    expect(covered.closest("label")).toHaveAttribute(
      "data-tooltip",
      "System data uploaded: taken over by the Explorer",
    );
    expect(screen.getByRole("checkbox", { name: "System scanned: taken over by the Explorer" })).toBeDisabled();
    const label = covered.closest("label");
    expect(label).toHaveAttribute("tabindex", "0");
    label?.focus();
    expect(label).toHaveFocus();
    await user.click(covered);
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Station claimed" })).toBeEnabled();
  });

  it("shows the Ranger scan and data-upload tasks before the Explorer scan", () => {
    renderWithLocale(<MissionSystemProgress editable={false} onToggle={vi.fn()} statuses={[]} />, { locale: "it" });
    expect(screen.getByLabelText("Dati sistema caricati")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Sistema scansionato")).toHaveLength(2);
  });

  it("ticks and locks the Explorer scan with the Ranger compass without counting it", async () => {
    const onToggle = vi.fn();
    const { user } = renderWithLocale(
      <MissionSystemProgress editable editableRoles={["explorer"]} onToggle={onToggle} statuses={["system_scanned"]} />,
      { locale: "it" },
    );
    const tooltip = "Sistema scansionato: preso in carico dal Ranger/scopritore";
    const scan = screen.getByRole("checkbox", { name: tooltip });
    expect(scan).toBeChecked();
    expect(scan).toBeDisabled();
    expect(scan.closest("label")).toHaveAttribute("data-tooltip", tooltip);
    expect(scan.closest("label")).toHaveClass("system-task-tooltip-ranger");
    expect(
      scan.closest("label")?.querySelector(".mission-system-progress-square-ranger .lucide-compass"),
    ).not.toBeNull();
    expect(screen.getByRole("group", { name: "Avanzamento sistema: 1 di 8 completati" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Dati caricati" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Dati caricati" })).not.toBeChecked();
    await user.click(scan);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("hides the Explorer task covered by the Ranger in the compact read-only summary", () => {
    renderWithLocale(<MissionSystemProgress editable={false} onToggle={vi.fn()} statuses={["system_scanned"]} />);
    const group = screen.getByRole("group", { name: "System progress: 1 of 8 complete" });
    expect(group.querySelectorAll(".mission-system-progress-item")).toHaveLength(8);
    expect(screen.queryByLabelText("System scanned: taken over by the Ranger/discoverer")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("System scanned").querySelector(".mission-system-progress-square-ranger"),
    ).not.toBeNull();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("keeps authored tasks and editable covered tasks visible", () => {
    const { unmount } = renderWithLocale(
      <MissionSystemProgress
        authors={{ renamed: { memberId: "discoverer", as: "discoverer" } }}
        currentMemberId="ranger"
        editable={false}
        onToggle={vi.fn()}
        statuses={["renamed"]}
      />,
    );
    expect(screen.getByLabelText("System renamed")).toBeInTheDocument();
    unmount();
    renderWithLocale(<MissionSystemProgress editable onToggle={vi.fn()} statuses={["mapped"]} />);
    const covered = screen.getByRole("checkbox", { name: "System data uploaded: taken over by the Explorer" });
    expect(covered).toBeDisabled();
    expect(covered).toBeChecked();
  });

  it("locks a Ranger task checked by the discoverer for the assigned Ranger, with the station icon", async () => {
    const onToggle = vi.fn();
    const { user } = renderWithLocale(
      <MissionSystemProgress
        authors={{ renamed: { memberId: "discoverer", as: "discoverer" } }}
        currentMemberId="ranger"
        editable
        editableRoles={["ranger"]}
        onToggle={onToggle}
        statuses={["renamed"]}
      />,
      { locale: "it" },
    );
    const tooltip = "Sistema rinominato: preso in carico dallo scopritore";
    const renamed = screen.getByRole("checkbox", { name: tooltip });
    expect(renamed).toBeChecked();
    expect(renamed).toBeDisabled();
    expect(renamed.closest("label")).toHaveAttribute("data-tooltip", tooltip);
    expect(renamed.closest("label")).toHaveClass("system-task-tooltip-discoverer");
    expect(
      renamed.closest("label")?.querySelector(".mission-system-progress-square-discoverer .lucide-orbit"),
    ).not.toBeNull();
    // Same-task lock only: the task still counts as done.
    expect(screen.getByRole("group", { name: "Avanzamento sistema: 1 di 9 completati" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Stazione riscattata" })).toBeEnabled();
    await user.click(renamed);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("locks a Ranger task checked by the assigned Ranger for the discoverer, with the Ranger compass", () => {
    renderWithLocale(
      <MissionSystemProgress
        authors={{ station_claimed: { memberId: "ranger", as: "ranger" } }}
        currentMemberId="discoverer"
        editable
        editableRoles={["ranger"]}
        onToggle={vi.fn()}
        statuses={["station_claimed"]}
      />,
    );
    const claimed = screen.getByRole("checkbox", { name: "Station claimed: taken over by the Ranger" });
    expect(claimed).toBeDisabled();
    expect(claimed.closest("label")).toHaveClass("system-task-tooltip-ranger");
    expect(
      claimed.closest("label")?.querySelector(".mission-system-progress-square-ranger .lucide-compass"),
    ).not.toBeNull();
  });

  it("leaves authored tasks editable for their author and for full moderators", () => {
    const authors = { renamed: { memberId: "author", as: "discoverer" as const } };
    const { unmount } = renderWithLocale(
      <MissionSystemProgress
        authors={authors}
        currentMemberId="author"
        editable
        editableRoles={["ranger"]}
        onToggle={vi.fn()}
        statuses={["renamed"]}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "System renamed" })).toBeEnabled();
    unmount();
    renderWithLocale(
      <MissionSystemProgress
        authors={authors}
        currentMemberId="moderator"
        editable
        onToggle={vi.fn()}
        statuses={["renamed"]}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "System renamed" })).toBeEnabled();
  });

  it("reports a data error and labels every step with it", () => {
    renderWithLocale(<MissionSystemProgress editable={false} onToggle={vi.fn()} statuses={["data_error", "mapped"]} />);
    expect(screen.getByRole("group", { name: "System progress: data error" })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Data error")).toHaveLength(9);
  });

  it("offers every step as a checkbox to moderators (no role restriction)", () => {
    renderWithLocale(
      <MissionSystemProgress editable pulseRoles={["ranger"]} onToggle={vi.fn()} statuses={["renamed"]} />,
    );
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(9);
    expect(screen.getByRole("checkbox", { name: "System renamed" })).toBeChecked();
    const [rangerScan, explorerScan] = screen.getAllByRole("checkbox", { name: "System scanned" });
    expect(rangerScan).not.toBeChecked();
    expect(rangerScan.closest("label")).toHaveClass("mission-system-progress-item-pulse");
    expect(explorerScan).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Station claimed" }).closest("label")).toHaveClass(
      "mission-system-progress-item-pulse",
    );
    expect(explorerScan.closest("label")).not.toHaveClass("mission-system-progress-item-pulse");
  });

  it("restricts editable steps to the given roles and toggles them", async () => {
    const onToggle = vi.fn();
    const { user } = renderWithLocale(
      <MissionSystemProgress editable editableRoles={["explorer"]} onToggle={onToggle} statuses={["mapped"]} />,
    );
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((box) => box.getAttribute("aria-label"))).toEqual([
      "System scanned",
      "System explored",
      "Data uploaded",
    ]);
    expect(screen.getByRole("checkbox", { name: "System scanned" }).closest("label")).not.toHaveClass(
      "mission-system-progress-item-pulse",
    );
    expect(screen.getByRole("checkbox", { name: "System explored" }).closest("label")).toHaveClass(
      "mission-system-progress-item-pulse",
    );
    expect(screen.queryByRole("checkbox", { name: "Station claimed" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "System explored" }));
    expect(onToggle).toHaveBeenCalledWith("planets_classified", true);
    await user.click(screen.getByRole("checkbox", { name: "System scanned" }));
    expect(onToggle).toHaveBeenCalledWith("mapped", false);
  });

  it("disables the checkboxes while saving", () => {
    renderWithLocale(
      <MissionSystemProgress disabled editable editableRoles={["builder"]} onToggle={vi.fn()} statuses={[]} />,
    );
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      expect(box).toBeDisabled();
      expect(box.closest("label")).not.toHaveClass("mission-system-progress-item-pulse");
    }
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
