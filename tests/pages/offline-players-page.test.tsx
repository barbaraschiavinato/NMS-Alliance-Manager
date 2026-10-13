// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflinePlayersPage } from "@/components/pages/offline-players-page";
import { defaultAlliance, makeMember } from "../helpers/members";
import { json, mockFetch, renderPage, t } from "./helpers";

vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);

const moderator = makeMember({
  publicId: "mod",
  email: "mod@example.com",
  nmsName: "Mod",
  role: "moderator",
  simpleView: false,
});
const target = makeMember({ publicId: "t1", email: "target@example.com", nmsName: "Target" });
const ghost = makeMember({
  publicId: "o1",
  email: "offline-o1@offline",
  nmsName: "Ghost",
  nmsCode: "ABCDEFGHJKLMN",
  offline: true,
  telegramName: "@ghost",
  specialty: "builder",
});
const shade = makeMember({
  publicId: "o2",
  email: "offline-o2@offline",
  nmsName: "Shade",
  nmsCode: "",
  offline: true,
  specialty: "",
});

function renderOffline() {
  return renderPage(
    <OfflinePlayersPage
      alliance={defaultAlliance}
      currentMember={moderator}
      memberActivity={{ missionOwnerIds: ["o1"], stationOwnerIds: ["o1"] }}
      missionCount={0}
      sidebarOfflineCount={2}
      sidebarStationCount={0}
      sidebarUserCount={2}
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OfflinePlayersPage", () => {
  it("shows the load error and the empty state", async () => {
    mockFetch({ "GET /api/admin/members": json({ error: "Forbidden." }, 403) });
    renderOffline();
    expect(await screen.findByText("Forbidden.")).toBeInTheDocument();
    expect(screen.getByText(t("members.no_offline_players"))).toBeInTheDocument();
  });

  it("lists offline players sorted by name and filters them", async () => {
    mockFetch({ "GET /api/admin/members": [shade, target, ghost] });
    const { user } = renderOffline();

    const rows = await screen.findAllByRole("row");
    expect(rows.slice(1).map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual(["Ghost", "Shade"]);
    expect(screen.getByText("ABCD-EFGH-JKLMN")).toBeInTheDocument();
    expect(screen.getByText("@ghost")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: t("members.find_member_s_missions", { member: "Ghost" }) }),
    ).toHaveAttribute("href", "/missions?search=Ghost");
    expect(
      screen.getByRole("link", { name: t("stations.find_member_s_stations", { member: "Ghost" }) }),
    ).toHaveAttribute("href", "/stations?search=Ghost");

    await user.type(screen.getByRole("textbox", { name: t("members.search_offline_players") }), "sha");
    expect(screen.queryByText("Ghost")).not.toBeInTheDocument();
    expect(screen.getByText("Shade")).toBeInTheDocument();
  });

  it("links an offline player to a registered account after confirmation", async () => {
    const { requests } = mockFetch({
      "GET /api/admin/members": vi.fn().mockReturnValueOnce([target, ghost]).mockReturnValue([target]),
      "POST /api/admin/members": vi
        .fn()
        .mockReturnValueOnce(json({ error: "Link failed." }, 400))
        .mockReturnValueOnce({ ok: true }),
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const { user } = renderOffline();

    const select = await screen.findByRole("combobox", { name: t("members.link_to_account") });
    await user.selectOptions(select, "t1");
    expect(requests("POST", "/api/admin/members")).toHaveLength(0);
    expect(confirm).toHaveBeenCalledWith(t("members.link_offline_confirm", { offline: "Ghost", target: "Target" }));

    await user.selectOptions(select, "t1");
    expect(await screen.findByText(t("Link failed."))).toBeInTheDocument();

    await user.selectOptions(select, "t1");
    expect(await screen.findByText(t("members.offline_player_linked"))).toBeInTheDocument();
    expect(requests("POST", "/api/admin/members")[1].body).toEqual({ action: "link", offlineId: "o1", targetId: "t1" });
    expect(screen.getByText(t("members.no_offline_players"))).toBeInTheDocument();
  });

  it("removes an offline player after confirmation", async () => {
    const { requests } = mockFetch({
      "GET /api/admin/members": [ghost],
      "DELETE /api/admin/members": vi
        .fn()
        .mockReturnValueOnce(json({ error: "Deletion failed." }, 500))
        .mockReturnValueOnce({ ok: true }),
    });
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const { user } = renderOffline();

    const remove = await screen.findByRole("button", { name: t("common.delete_email", { email: "Ghost" }) });
    await user.click(remove);
    expect(requests("DELETE", "/api/admin/members")).toHaveLength(0);
    await user.click(remove);
    expect(await screen.findByText(t("Deletion failed."))).toBeInTheDocument();
    await user.click(remove);
    await waitFor(() => expect(screen.queryByText("Ghost")).not.toBeInTheDocument());
    expect(requests("DELETE", "/api/admin/members")[1].body).toEqual({ email: "offline-o1@offline" });
  });

  it("creates an offline player with an optional friend code", async () => {
    const created = makeMember({ publicId: "o3", nmsName: "Newbie", nmsCode: "", offline: true, specialty: "ranger" });
    const { requests } = mockFetch({ "GET /api/admin/members": [], "POST /api/admin/members": created });
    const { user } = renderOffline();

    await user.click(screen.getByRole("button", { name: t("members.add_offline_player") }));
    const dialog = screen.getByRole("dialog", { name: t("members.add_offline_player") });
    const save = within(dialog).getByRole("button", { name: t("profile.save_profile") });
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: t("common.in_game_name") }), "Newbie");
    await user.click(within(dialog).getByRole("radio", { name: t("common.ranger") }));
    expect(save).toBeEnabled();
    await user.click(save);

    expect(await screen.findByText(t("members.offline_player_created"))).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(requests("POST", "/api/admin/members")[0].body).toEqual({
      nmsName: "Newbie",
      nmsCode: "",
      telegramName: "",
      discordName: "",
      platforms: [],
      specialty: "ranger",
    });
    expect(screen.getByText("Newbie")).toBeInTheDocument();
  });

  it("edits an offline player", async () => {
    const { requests } = mockFetch({
      "GET /api/admin/members": [ghost],
      "POST /api/admin/members": { ...ghost, nmsName: "Ghost II" },
    });
    const { user } = renderOffline();

    await user.click(await screen.findByRole("button", { name: t("members.edit_offline_player") }));
    const dialog = screen.getByRole("dialog", { name: t("members.edit_offline_player") });
    const name = within(dialog).getByRole("textbox", { name: t("common.in_game_name") });
    await user.clear(name);
    await user.type(name, "Ghost II");
    await user.click(within(dialog).getByRole("button", { name: t("profile.save_profile") }));

    expect(await screen.findByText(t("members.offline_player_updated"))).toBeInTheDocument();
    expect(requests("POST", "/api/admin/members")[0].body).toMatchObject({
      nmsName: "Ghost II",
      action: "update",
      offlineId: "o1",
    });
    expect(screen.getByText("Ghost II")).toBeInTheDocument();
  });

  it("falls back to generic load errors", async () => {
    mockFetch({ "GET /api/admin/members": json({}, 500) });
    renderOffline();
    expect(await screen.findByText(t("Unable to load the user list."))).toBeInTheDocument();
  });

  it("shows a generic load error when the request cannot be sent", async () => {
    mockFetch({
      "GET /api/admin/members": () => {
        throw "offline";
      },
    });
    renderOffline();
    expect(await screen.findByText(t("errors.unable_to_load_the_user_list"))).toBeInTheDocument();
  });

  it("sorts link targets by in-game name or account name and confirms with the email when unnamed", async () => {
    const zed = makeMember({ publicId: "t2", email: "zed@example.com", nmsName: "", name: "Zed" });
    const alpha = makeMember({ publicId: "t3", email: "alpha@example.com", nmsName: "", name: "Alpha" });
    mockFetch({ "GET /api/admin/members": [zed, target, alpha, ghost] });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { user } = renderOffline();

    const select = await screen.findByRole("combobox", { name: t("members.link_to_account") });
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      t("members.link_to_account"),
      "Alpha · alpha@example.com",
      "Target · target@example.com",
      "Zed · zed@example.com",
    ]);
    await user.selectOptions(select, "t2");
    expect(confirm).toHaveBeenCalledWith(
      t("members.link_offline_confirm", { offline: "Ghost", target: "zed@example.com" }),
    );
    expect(select).toHaveValue("");
  });

  it("does nothing when the placeholder option is chosen", async () => {
    mockFetch({ "GET /api/admin/members": [target, ghost] });
    const confirm = vi.spyOn(window, "confirm");
    const { user } = renderOffline();

    const select = await screen.findByRole("combobox", { name: t("members.link_to_account") });
    await user.selectOptions(select, "");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("falls back to generic link errors", async () => {
    const { requests } = mockFetch({
      "GET /api/admin/members": vi
        .fn()
        .mockReturnValueOnce([target, ghost])
        .mockReturnValueOnce(json({ error: "Reload failed." }, 500))
        .mockReturnValueOnce(json({}, 500)),
      "POST /api/admin/members": vi
        .fn()
        .mockReturnValueOnce(json({}, 400))
        .mockImplementationOnce(() => {
          throw "offline";
        })
        .mockReturnValue({ ok: true }),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderOffline();

    const select = await screen.findByRole("combobox", { name: t("members.link_to_account") });
    await user.selectOptions(select, "t1");
    expect(await screen.findByText(t("Link failed."))).toBeInTheDocument();
    await user.selectOptions(select, "t1");
    expect(await screen.findByText(t("errors.update_failed"))).toBeInTheDocument();
    // Il collegamento riesce ma la lista non si ricarica.
    await user.selectOptions(select, "t1");
    expect(await screen.findByText("Reload failed.")).toBeInTheDocument();
    await user.selectOptions(select, "t1");
    expect(await screen.findByText(t("Unable to load the user list."))).toBeInTheDocument();
    expect(requests("POST", "/api/admin/members")).toHaveLength(4);
    expect(screen.queryByText(t("members.offline_player_linked"))).not.toBeInTheDocument();
  });

  it("falls back to generic deletion errors", async () => {
    mockFetch({
      "GET /api/admin/members": [ghost],
      "DELETE /api/admin/members": vi
        .fn()
        .mockReturnValueOnce(json({}, 500))
        .mockImplementationOnce(() => {
          throw "offline";
        }),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderOffline();

    const remove = await screen.findByRole("button", { name: t("common.delete_email", { email: "Ghost" }) });
    await user.click(remove);
    expect(await screen.findByText(t("Deletion failed."))).toBeInTheDocument();
    await user.click(remove);
    expect(await screen.findByText(t("errors.deletion_failed"))).toBeInTheDocument();
    expect(screen.getByText("Ghost")).toBeInTheDocument();
  });

  it("updates only the edited player and closes the add panel without saving", async () => {
    mockFetch({
      "GET /api/admin/members": [ghost, shade],
      "POST /api/admin/members": { ...ghost, nmsName: "Ghost II" },
    });
    const { user } = renderOffline();

    await user.click(screen.getByRole("button", { name: t("members.add_offline_player") }));
    const add = screen.getByRole("dialog", { name: t("members.add_offline_player") });
    await user.click(within(add).getAllByRole("button", { name: t("common.close") })[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const [editGhost] = await screen.findAllByRole("button", { name: t("members.edit_offline_player") });
    await user.click(editGhost);
    const dialog = screen.getByRole("dialog", { name: t("members.edit_offline_player") });
    await user.click(within(dialog).getByRole("button", { name: t("profile.save_profile") }));

    expect(await screen.findByText("Ghost II")).toBeInTheDocument();
    expect(screen.getByText("Shade")).toBeInTheDocument();
  });

  it("lets an admin save the alliance settings and the own profile", async () => {
    const admin = makeMember({ publicId: "admin", nmsName: "Chief", role: "admin" });
    mockFetch({
      "GET /api/admin/members": [],
      "GET /api/alliance": defaultAlliance,
      "PATCH /api/alliance": { ...defaultAlliance, name: "Renamed Alliance" },
      "PATCH /api/profile": { ...admin, nmsName: "Captain" },
    });
    const { user } = renderPage(
      <OfflinePlayersPage
        alliance={defaultAlliance}
        currentMember={admin}
        memberActivity={{ missionOwnerIds: [], stationOwnerIds: [] }}
        missionCount={0}
        sidebarOfflineCount={0}
        sidebarStationCount={0}
        sidebarUserCount={0}
      />,
    );

    await user.click(screen.getByRole("button", { name: t("admin.alliance_settings") }));
    const settings = screen.getByRole("dialog", { name: t("admin.alliance") });
    await waitFor(() =>
      expect(within(settings).getByRole("textbox", { name: t("admin.alliance_name") })).toHaveValue("Test Alliance"),
    );
    await user.click(within(settings).getByRole("button", { name: t("admin.save_settings") }));
    await waitFor(() => expect(screen.getAllByText("Renamed Alliance").length).toBeGreaterThan(0));
    await user.click(within(settings).getByRole("button", { name: t("common.close") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t("profile.my_profile") }));
    let profile = screen.getByRole("dialog", { name: t("profile.my_nms_profile") });
    await user.click(within(profile).getAllByRole("button", { name: t("common.close") })[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t("profile.my_profile") }));
    profile = screen.getByRole("dialog", { name: t("profile.my_nms_profile") });
    await user.click(within(profile).getByRole("button", { name: t("profile.save_profile") }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: `Captain · ${t("admin.administrator")}` })).toBeInTheDocument(),
    );
  });
});
