// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DetailBackLink, DetailLink } from "@/components/shared/detail-page";
import { renderWithLocale } from "../helpers";

vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname }));
vi.mock("next/link", async () => (await import("../helpers")).nextLinkModule);

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("detail navigation", () => {
  it.each([
    ["/missions/previous", "Back to mission details"],
    ["/stations/previous", "Back to station details"],
    ["/planets?search=Pilot", "Back to planets"],
    ["/messages/previous", "Back to messages"],
    ["/help-requests/previous", "Back to help requests"],
    ["/taxi/previous", "Back to taxi service"],
  ])("uses the destination-specific English label for %s", (destination, label) => {
    window.history.replaceState(null, "", `/missions/current?returnTo=${encodeURIComponent(destination)}`);
    renderWithLocale(<DetailBackLink href="/missions" label="details.back_to_missions" />);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", destination);
  });

  it("preserves link attributes and activation handlers", async () => {
    window.history.replaceState(null, "", "/stations?search=Pilot");
    const onClick = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) => event.preventDefault());
    const { user } = renderWithLocale(
      <DetailLink
        href="/missions/next"
        aria-label="Open mission"
        data-tooltip="Mission details"
        className="mission-detail-link"
        onClick={onClick}
      >
        Open
      </DetailLink>,
    );
    const link = screen.getByRole("link", { name: "Open mission" });
    expect(link).toHaveAttribute("data-tooltip", "Mission details");
    expect(link).toHaveClass("mission-detail-link");
    await user.click(link);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("keeps an explicit fallback label for a destination outside the contextual sections", () => {
    renderWithLocale(<DetailBackLink href="/guide" label="details.back_to_missions" />);
    expect(screen.getByRole("link", { name: "Back to missions" })).toHaveAttribute("href", "/guide");
  });
  it("links back to the exact originating detail with the matching section label", () => {
    const parent = "/stations/owner%3A1234567890AB%3A0?from=planets";
    window.history.replaceState(null, "", `/missions/one?returnTo=${encodeURIComponent(parent)}`);
    renderWithLocale(<DetailBackLink href="/missions" label="details.back_to_missions" />);
    expect(screen.getByRole("link", { name: "Back to station details" })).toHaveAttribute("href", parent);
  });

  it.each([
    ["/missions/previous", "Torna alla scheda missione"],
    ["/stations/owner%3A1234567890AB%3A0", "Torna alla scheda stazione"],
    ["/missions?search=Pilot", "Torna alle missioni"],
    ["/stations?search=Pilot", "Torna alle stazioni"],
  ])("labels the actual return destination %s in Italian", (destination, label) => {
    window.history.replaceState(null, "", `/missions/one?returnTo=${encodeURIComponent(destination)}`);
    renderWithLocale(<DetailBackLink href="/missions" label="details.back_to_missions" />, { locale: "it" });
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", destination);
  });

  it("includes the current page in outgoing links and updates after browser navigation", () => {
    window.history.replaceState(null, "", "/missions/one?from=stations");
    renderWithLocale(<DetailLink href="/missions/two?from=missions">Other mission</DetailLink>);
    let href = screen.getByRole("link").getAttribute("href")!;
    expect(new URL(href, window.location.origin).searchParams.get("returnTo")).toBe("/missions/one?from=stations");
    act(() => {
      window.history.replaceState(null, "", "/stations?search=Pilot");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    href = screen.getByRole("link").getAttribute("href")!;
    expect(new URL(href, window.location.origin).searchParams.get("returnTo")).toBe("/stations?search=Pilot");
  });

  it("uses the standard section for direct links and rejects external return URLs", () => {
    window.history.replaceState(null, "", "/missions/one?returnTo=https://example.com");
    renderWithLocale(<DetailBackLink href="/missions" label="details.back_to_missions" />);
    expect(screen.getByRole("link", { name: "Back to missions" })).toHaveAttribute("href", "/missions");
  });
});
