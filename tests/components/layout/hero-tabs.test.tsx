// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Hero, HeroAddButton } from "@/components/layout/hero";
import { Tabs } from "@/components/layout/tabs";
import { galaxyLabel } from "@/lib/galaxies";
import { defaultAlliance } from "../../helpers/members";
import { renderWithLocale, tr } from "../helpers";

describe("Hero", () => {
  it("renders the translated title, subtitle and children", () => {
    renderWithLocale(
      <Hero settings={defaultAlliance} subtitle="stations.stations" title="missions.section_title">
        <p>extra</p>
      </Hero>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Missions.");
    expect(screen.getByText("Stations")).toBeInTheDocument();
    expect(screen.getByText("extra")).toBeInTheDocument();
  });

  it("translates into Italian and applies banner, logo and gradient settings", () => {
    const settings = {
      ...defaultAlliance,
      bannerUrl: "https://example.com/b.png",
      logoUrl: "https://example.com/l.png",
      heroGradientMode: "full" as const,
    };
    const { container } = renderWithLocale(
      <Hero settings={settings} subtitle="stations.stations" title="missions.section_title" />,
      { locale: "it" },
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Missioni.");
    const section = container.querySelector("section");
    expect(section).toHaveClass("mission-banner-gradient-full");
    expect(section).toHaveStyle({ backgroundImage: 'url("https://example.com/b.png")' });
    expect(container.querySelector(".banner-alliance-logo")).toHaveStyle({
      backgroundImage: 'url("https://example.com/l.png")',
    });
    expect(container.querySelector(".banner-alliance-logo svg")).toBeNull();
  });

  it("shows a default logo and no gradient when disabled", () => {
    const { container } = renderWithLocale(
      <Hero settings={{ ...defaultAlliance, heroGradientMode: "none" }} subtitle="s" title="t" />,
    );
    expect(container.querySelector("section")?.className).toBe("mission-banner");
    expect(container.querySelector(".banner-alliance-logo svg")).not.toBeNull();
  });
});

describe("Hero alliance portal", () => {
  it("opens and closes the alliance portal dialog from the logo", async () => {
    const settings = {
      ...defaultAlliance,
      name: "  ",
      portalCode: "0123456789AB",
      galaxy: 1,
      logoUrl: "https://example.com/l.png",
    };
    const { user } = renderWithLocale(<Hero settings={settings} subtitle="s" title="t" />);
    const logo = screen.getByRole("button", { name: tr("admin.view_alliance_portal") });
    expect(logo).toHaveStyle({ backgroundImage: 'url("https://example.com/l.png")' });
    expect(logo.querySelector("svg")).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(logo);
    const dialog = screen.getByRole("dialog", { name: tr("admin.alliance") });
    expect(within(dialog).getByText("0123456789AB")).toBeInTheDocument();
    expect(within(dialog).getByText(galaxyLabel(1))).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: tr("common.close") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the default logo on the portal button and names the dialog after the alliance", async () => {
    const settings = { ...defaultAlliance, name: "Atlas Pact", portalCode: "0123456789ab", logoUrl: "" };
    const { user } = renderWithLocale(<Hero settings={settings} subtitle="s" title="t" />);
    const logo = screen.getByRole("button", { name: tr("admin.view_alliance_portal") });
    expect(logo.querySelector("svg")).not.toBeNull();
    await user.click(logo);
    expect(screen.getByRole("dialog", { name: "Atlas Pact" })).toBeInTheDocument();
  });
});

describe("HeroAddButton", () => {
  it("is a labelled button that calls onClick", async () => {
    const onClick = vi.fn();
    const { user } = renderWithLocale(<HeroAddButton label="missions.claim" onClick={onClick} />, { locale: "it" });
    await user.click(screen.getByRole("button", { name: "Prendi in carico" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Tabs", () => {
  it("renders a labelled tablist with selection state and counts", async () => {
    const onSelectB = vi.fn();
    const user = userEvent.setup();
    render(
      <Tabs
        className="extra"
        items={[
          { key: "a", label: "Alpha", count: 2, selected: true, onSelect: vi.fn() },
          { key: "b", label: "Beta", count: 0, selected: false, onSelect: onSelectB },
        ]}
        label="Filters"
      />,
    );
    const list = screen.getByRole("tablist", { name: "Filters" });
    expect(list).toHaveClass("filter-tabs", "extra");
    expect(screen.getByRole("tab", { name: "Alpha2" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Beta0" })).toHaveAttribute("aria-selected", "false");
    await user.click(screen.getByRole("tab", { name: "Beta0" }));
    expect(onSelectB).toHaveBeenCalledTimes(1);
  });

  it("uses only the base class without an extra class", () => {
    render(<Tabs items={[]} label="Empty" />);
    expect(screen.getByRole("tablist", { name: "Empty" }).className).toBe("filter-tabs");
  });
});
