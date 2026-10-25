// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar, storePlanetCount } from "@/components/layout/sidebar";
import { NavigationSearchResetProvider, useNavigationSearchState } from "@/components/shared/navigation-search-reset";
import { defaultAlliance, makeMember } from "../../helpers/members";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { renderWithLocale } from "../helpers";

vi.mock("next/image", async () => (await import("../helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("../helpers")).nextLinkModule);

function stubCounters(unread: unknown = { count: 0 }, help: unknown = { count: 0 }) {
  const fetchMock = vi.fn(
    async (url: string) => new Response(JSON.stringify(url.startsWith("/api/messages") ? unread : help)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function SearchProbe() {
  const [search, setSearch] = useNavigationSearchState("");
  return <input aria-label="probe search" onChange={(event) => setSearch(event.target.value)} value={search} />;
}

const baseProps = { missionCount: 4, stationCount: 7, settings: defaultAlliance, activeSection: "stazioni" as const };

beforeEach(() => {
  window.localStorage.clear();
});

describe("Sidebar", () => {
  it("lists the member sections with counts and highlights the active one", async () => {
    stubCounters();
    renderWithLocale(
      <Sidebar {...baseProps} currentMember={makeMember({ role: "user", nmsName: "Nova" })} planetCount={12} />,
    );
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/stations",
      "/missions",
      "/planets",
      "/map",
      "/leaderboard",
      "/taxi",
      "/messages",
      "/help-requests",
      "/member-guide",
    ]);
    expect(within(nav).getByRole("link", { name: /Stations/ })).toHaveClass("active");
    expect(within(nav).getByRole("link", { name: /Stations/ })).toHaveTextContent("Stations7");
    expect(within(nav).getByRole("link", { name: /Missions/ })).toHaveTextContent("Missions4");
    expect(within(nav).getByRole("link", { name: /Planets/ })).toHaveTextContent("Planets12");
    expect(screen.getByText("Nova")).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
    expect(screen.getByText("NO")).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  });

  it("adds user management links for moderators, in Italian", () => {
    stubCounters();
    renderWithLocale(
      <Sidebar
        {...baseProps}
        activeSection="utenti"
        currentMember={makeMember({ role: "moderator" })}
        offlineCount={2}
        userCount={9}
      />,
      { locale: "it" },
    );
    expect(screen.getByRole("link", { name: /Utenti/ })).toHaveTextContent("Utenti9");
    expect(screen.getByRole("link", { name: /Utenti/ })).toHaveClass("active");
    expect(screen.getByRole("link", { name: /Giocatori offline/ })).toHaveTextContent("2");
    expect(screen.getByText("Moderatore")).toBeInTheDocument();
  });

  it("defaults user counts to zero for admins and labels them", () => {
    stubCounters();
    renderWithLocale(<Sidebar {...baseProps} currentMember={makeMember({ role: "admin", displayRole: "admin" })} />);
    expect(screen.getByRole("link", { name: /Users/ })).toHaveTextContent("Users0");
    expect(screen.getByRole("link", { name: /Offline players/ })).toHaveTextContent("0");
    expect(screen.getByText("Administrator")).toBeInTheDocument();
  });

  it("shows unread messages and open help requests from the API", async () => {
    const fetchMock = stubCounters({ count: 3 }, { count: 5 });
    renderWithLocale(<Sidebar {...baseProps} currentMember={makeMember()} />);
    expect(await screen.findByLabelText("3 unread")).toHaveClass("nav-unread-active");
    expect(screen.getByRole("link", { name: /Help requests/ })).toHaveTextContent("Help requests5");
    expect(screen.getByRole("link", { name: /Taxi service/ })).toHaveTextContent("Taxi service5");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/taxi-requests?count=1",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/messages?count=unread",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/help-requests?count=1",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("keeps zero counters when the API fails or returns junk", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("/api/messages")) throw new Error("offline");
        return new Response(JSON.stringify({ count: "many" }));
      }),
    );
    renderWithLocale(<Sidebar {...baseProps} currentMember={makeMember()} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(screen.getByLabelText("0 unread")).not.toHaveClass("nav-unread-active");
    expect(screen.getByRole("link", { name: /Help requests/ })).toHaveTextContent("Help requests0");
  });

  it("ignores the unread count when the messages API answers with an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/messages")
          ? new Response(JSON.stringify({ count: 5 }), { status: 500 })
          : new Response(JSON.stringify({ count: 0 })),
      ),
    );
    renderWithLocale(<Sidebar {...baseProps} currentMember={makeMember()} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(screen.getByLabelText("0 unread")).not.toHaveClass("nav-unread-active");
  });

  it.each([
    ["missioni", "/missions"],
    ["pianeti", "/planets"],
    ["mappa", "/map"],
    ["offline", "/offline-players"],
    ["classifica", "/leaderboard"],
    ["aiuto", "/help-requests"],
    ["messaggi", "/messages"],
    ["guida", "/member-guide"],
  ] as const)("highlights the %s section", (activeSection, href) => {
    stubCounters();
    renderWithLocale(
      <Sidebar {...baseProps} activeSection={activeSection} currentMember={makeMember({ role: "moderator" })} />,
    );
    const links = within(screen.getByRole("navigation", { name: "Main navigation" })).getAllByRole("link");
    expect(links.filter((link) => link.classList.contains("active")).map((link) => link.getAttribute("href"))).toEqual([
      href,
    ]);
  });

  it("falls back to the account name without an NMS name", () => {
    stubCounters();
    renderWithLocale(<Sidebar {...baseProps} currentMember={makeMember({ nmsName: "", name: "Zed Account" })} />);
    expect(screen.getByText("Zed Account")).toBeInTheDocument();
  });

  it("renders no stored planet count on the server", () => {
    window.localStorage.setItem("nms-planet-count", "8");
    const html = renderToString(
      <LocaleProvider fixedLocale="en">
        <NavigationSearchResetProvider>
          <Sidebar {...baseProps} currentMember={makeMember()} />
        </NavigationSearchResetProvider>
      </LocaleProvider>,
    );
    const container = document.createElement("div");
    container.innerHTML = html;
    const planets = container.querySelector('a[href="/planets"]');
    expect(planets).toHaveTextContent(/^Planets$/);
  });

  it("reloads counters when the app announces changes", async () => {
    let unread = 0;
    let help = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) => new Response(JSON.stringify({ count: url.startsWith("/api/messages") ? unread : help })),
      ),
    );
    renderWithLocale(<Sidebar {...baseProps} currentMember={makeMember()} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));

    unread = 2;
    help = 1;
    act(() => {
      window.dispatchEvent(new Event("messages-unread-changed"));
      window.dispatchEvent(new Event("help-requests-changed"));
      window.dispatchEvent(new Event("taxi-requests-changed"));
    });
    expect(await screen.findByLabelText("2 unread")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("link", { name: /Taxi service/ })).toHaveTextContent("Taxi service1"));
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Help requests/ })).toHaveTextContent("Help requests1"),
    );

    unread = 6;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await screen.findByLabelText("6 unread")).toBeInTheDocument();
  });

  it("does not refresh counters while the page is hidden", async () => {
    stubCounters();
    renderWithLocale(<Sidebar {...baseProps} currentMember={makeMember()} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    visibility.mockRestore();
  });

  it("refreshes counters every two minutes", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      stubCounters();
      renderWithLocale(<Sidebar {...baseProps} currentMember={makeMember()} />);
      expect(fetch).toHaveBeenCalledTimes(3);
      act(() => {
        vi.advanceTimersByTime(2 * 60 * 1000);
      });
      expect(fetch).toHaveBeenCalledTimes(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads the planet count from storage when not given, and follows updates", async () => {
    stubCounters();
    window.localStorage.setItem("nms-planet-count", "8");
    renderWithLocale(<Sidebar {...baseProps} currentMember={makeMember()} />);
    const planets = screen.getByRole("link", { name: /Planets/ });
    expect(planets).toHaveTextContent("Planets8");

    act(() => storePlanetCount(11));
    expect(planets).toHaveTextContent("Planets11");
    expect(window.localStorage.getItem("nms-planet-count")).toBe("11");
  });

  it("hides the planet count when none is known", () => {
    stubCounters();
    renderWithLocale(<Sidebar {...baseProps} currentMember={makeMember()} />);
    expect(screen.getByRole("link", { name: /Planets/ })).toHaveTextContent(/^Planets$/);
  });

  it("does not notify when storing an unchanged planet count", () => {
    window.localStorage.setItem("nms-planet-count", "3");
    const listener = vi.fn();
    window.addEventListener("planet-count-changed", listener);
    storePlanetCount(3);
    storePlanetCount(4);
    window.removeEventListener("planet-count-changed", listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("tolerates unavailable storage", () => {
    const getItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (key === "nms-planet-count") throw new Error("denied");
      return getItem.call(this, key);
    });
    expect(() => storePlanetCount(1)).not.toThrow();
    stubCounters();
    renderWithLocale(<Sidebar {...baseProps} currentMember={makeMember()} />);
    expect(screen.getByRole("link", { name: /Planets/ })).toHaveTextContent(/^Planets$/);
  });

  it("clears the page search when navigating", async () => {
    stubCounters();
    const { user } = renderWithLocale(
      <>
        <Sidebar {...baseProps} currentMember={makeMember()} />
        <SearchProbe />
      </>,
    );
    const search = screen.getByRole("textbox", { name: "probe search" });
    await user.type(search, "alpha");
    expect(search).toHaveValue("alpha");
    screen.getByRole("link", { name: /Missions/ }).addEventListener("click", (event) => event.preventDefault());
    await user.click(screen.getByRole("link", { name: /Missions/ }));
    expect(search).toHaveValue("");
  });

  it("shows the alliance branding and community links", () => {
    stubCounters();
    const settings = {
      ...defaultAlliance,
      name: "Atlas Pact",
      logoUrl: "https://example.com/logo.png",
      discordUrl: "https://discord.gg/x",
      telegramUrl: "https://t.me/x",
    };
    const { container } = renderWithLocale(
      <Sidebar
        {...baseProps}
        currentMember={makeMember({ image: "https://example.com/me.png", simpleView: true })}
        settings={settings}
      />,
    );
    expect(screen.getByRole("link", { name: "Atlas Pact" })).toHaveAttribute("href", "/stations");
    expect(screen.getByRole("link", { name: "Open the alliance Discord server" })).toHaveAttribute(
      "href",
      "https://discord.gg/x",
    );
    expect(screen.getByRole("link", { name: "Open the alliance Telegram group" })).toHaveAttribute(
      "href",
      "https://t.me/x",
    );
    expect(container.querySelector(".avatar img")).toHaveAttribute("src", "https://example.com/me.png");
    expect(screen.getByRole("complementary")).toHaveClass("sidebar-compact");
  });

  it("omits community links when none are configured", () => {
    stubCounters();
    renderWithLocale(<Sidebar {...baseProps} currentMember={makeMember({ simpleView: false })} />);
    expect(screen.queryByRole("link", { name: /Discord|Telegram/ })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary")).not.toHaveClass("sidebar-compact");
  });
});
