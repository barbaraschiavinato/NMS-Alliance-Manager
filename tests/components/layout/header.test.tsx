// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "@/components/layout/header";
import type { AllianceSettings } from "@/lib/members/member-types";
import { defaultAlliance, makeMember } from "../../helpers/members";
import { renderWithLocale } from "../helpers";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ signOut: mocks.signOut }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: mocks.replace }),
}));

const settings: AllianceSettings = { ...defaultAlliance, name: "Atlas Pact" };

beforeEach(() => {
  mocks.signOut.mockReset();
  mocks.replace.mockReset();
  document.head.querySelectorAll('link[rel~="icon"]').forEach((link) => link.remove());
});

afterEach(() => {
  window.history.pushState({}, "", "/");
});

describe("Header", () => {
  it("shows the section title, the member name and role, and initials without an image", () => {
    const member = makeMember({ nmsName: "Nova", role: "user" });
    renderWithLocale(<Header currentMember={member} settings={settings} />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByText("Missions", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Nova · Member" })).toBeInTheDocument();
    expect(screen.getByText("NO")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Language" })).toBeInTheDocument();
  });

  it("translates the section title and role into Italian", () => {
    const member = makeMember({ nmsName: "Nova", role: "admin" });
    renderWithLocale(<Header currentMember={member} sectionTitle="stations.stations" settings={settings} />, {
      locale: "it",
    });
    expect(screen.getByText("Stazioni")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Nova · Amministratore" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Esci" })).toBeInTheDocument();
  });

  it("falls back to the account name and uses the displayed role", () => {
    const member = makeMember({ nmsName: "", name: "Real Name", role: "user", displayRole: "moderator" });
    renderWithLocale(<Header currentMember={member} settings={settings} />);
    expect(screen.getByRole("img", { name: "Real Name · Moderator" })).toBeInTheDocument();
    expect(screen.getByText("RE")).toBeInTheDocument();
  });

  it("sets the document title and favicon from the alliance settings", () => {
    const member = makeMember();
    const { rerender } = renderWithLocale(
      <Header currentMember={member} settings={{ ...settings, logoUrl: "https://example.com/logo.png" }} />,
    );
    expect(document.title).toBe("Atlas Pact");
    const icon = document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    expect(icon?.href).toBe("https://example.com/logo.png");

    icon?.setAttribute("type", "image/svg+xml");
    rerender(
      <Header
        currentMember={member}
        settings={{ ...settings, name: "  ", logoUrl: "https://example.com/other.png" }}
      />,
    );
    expect(document.title).toBe("NMS Alliance Manager");
    const icons = document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
    expect(icons).toHaveLength(1);
    expect(icons[0].href).toBe("https://example.com/other.png");
    expect(icons[0]).not.toHaveAttribute("type");
  });

  it("signs out to the home page", async () => {
    const { user } = renderWithLocale(<Header currentMember={makeMember()} settings={settings} />);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mocks.signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });

  it("opens the profile and, for admins only, the alliance settings", async () => {
    const onProfileOpen = vi.fn();
    const onAdminOpen = vi.fn();
    const { user, rerender } = renderWithLocale(
      <Header
        currentMember={makeMember({ role: "admin" })}
        onAdminOpen={onAdminOpen}
        onProfileOpen={onProfileOpen}
        settings={settings}
      />,
    );
    await user.click(screen.getByRole("button", { name: "My profile" }));
    await user.click(screen.getByRole("button", { name: "Alliance settings" }));
    expect(onProfileOpen).toHaveBeenCalledTimes(1);
    expect(onAdminOpen).toHaveBeenCalledTimes(1);

    rerender(
      <Header
        currentMember={makeMember({ role: "moderator" })}
        onAdminOpen={onAdminOpen}
        onProfileOpen={onProfileOpen}
        settings={settings}
      />,
    );
    expect(screen.queryByRole("button", { name: "Alliance settings" })).not.toBeInTheDocument();
  });

  it("hides the view toggle from normal users", () => {
    renderWithLocale(
      <Header currentMember={makeMember({ role: "user" })} onProfileSaved={vi.fn()} settings={settings} />,
    );
    expect(screen.queryByRole("button", { name: /Switch to/ })).not.toBeInTheDocument();
  });

  it("shows the view toggle only when profile saving is wired", () => {
    renderWithLocale(
      <Header currentMember={makeMember({ role: "moderator", simpleView: false })} settings={settings} />,
    );
    expect(screen.queryByRole("button", { name: /Switch to/ })).not.toBeInTheDocument();
  });

  it("switches a moderator to the simple view and leaves extended-only pages", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/users/abc");
    const member = makeMember({
      role: "moderator",
      simpleView: false,
      nmsName: "Mod",
      telegramName: "tg",
      platforms: ["PlayStation"],
      specialty: "builder",
    });
    const { user } = renderWithLocale(<Header currentMember={member} onProfileSaved={vi.fn()} settings={settings} />);
    const toggle = screen.getByRole("button", { name: "Switch to simple view" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    expect(fetchMock).toHaveBeenCalledWith("/api/profile", expect.objectContaining({ method: "PATCH" }));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      nmsName: "Mod",
      nmsCode: member.nmsCode,
      telegramName: "tg",
      discordName: "",
      platforms: ["PlayStation"],
      specialty: "builder",
      simpleView: true,
    });
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/stations"));
    expect(toggle).toBeEnabled();
  });

  it("reloads the page after switching views on a page available in both", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, pathname: "/stations", reload });
    const member = makeMember({ role: "moderator", simpleView: false });
    const { user } = renderWithLocale(<Header currentMember={member} onProfileSaved={vi.fn()} settings={settings} />);

    await user.click(screen.getByRole("button", { name: "Switch to simple view" }));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("asks to return to the admin view when the simple view is active", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const member = makeMember({ role: "user", displayRole: "admin", simpleView: true });
    const { user } = renderWithLocale(<Header currentMember={member} onProfileSaved={vi.fn()} settings={settings} />);
    const toggle = screen.getByRole("button", { name: "Switch to admin view" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await user.click(toggle);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ simpleView: false });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("renders the member image as the avatar", () => {
    const { container } = renderWithLocale(
      <Header
        currentMember={makeMember({ nmsName: "Nova", image: "https://example.com/me.png" })}
        settings={settings}
      />,
    );
    expect(screen.queryByText("NO")).not.toBeInTheDocument();
    expect(container.querySelector(".top-avatar span")).toHaveStyle({
      backgroundImage: 'url("https://example.com/me.png")',
    });
  });
});
