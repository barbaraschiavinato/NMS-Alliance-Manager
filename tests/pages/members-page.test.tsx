// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MembersPage } from "@/components/pages/members-page";
import { defaultAlliance, makeMember } from "../helpers/members";
import { json, mockFetch, renderPage, t } from "./helpers";

vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);

const admin = makeMember({
  publicId: "admin",
  email: "admin@example.com",
  nmsName: "Boss",
  name: "Boss",
  role: "admin",
  simpleView: false,
});
const moderator = makeMember({
  publicId: "mod",
  email: "mod@example.com",
  nmsName: "Mod",
  name: "Mod",
  role: "moderator",
  simpleView: false,
});
const pending = makeMember({
  publicId: "p1",
  email: "pending@example.com",
  name: "Alice",
  nmsName: "Alice",
  membershipStatus: "pending",
});
const approved = makeMember({ publicId: "a1", email: "approved@example.com", name: "Bob", nmsName: "Bob" });
const blocked = makeMember({
  publicId: "b1",
  email: "blocked@example.com",
  name: "Carl",
  nmsName: "Carl",
  membershipStatus: "blocked",
});
const offline = makeMember({
  publicId: "o1",
  email: "offline@example.com",
  name: "Ghost",
  nmsName: "Ghost",
  offline: true,
});

function renderMembers(member = admin) {
  return renderPage(
    <MembersPage
      alliance={defaultAlliance}
      currentMember={member}
      memberActivity={{ missionOwnerIds: ["a1"], stationOwnerIds: ["a1"] }}
      missionCount={0}
      sidebarOfflineCount={1}
      sidebarStationCount={0}
      sidebarUserCount={3}
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MembersPage", () => {
  it("shows the load error", async () => {
    mockFetch({ "GET /api/admin/members": json({ error: "Forbidden." }, 403) });
    renderMembers();
    expect(await screen.findByText("Forbidden.")).toBeInTheDocument();
    expect(
      screen.getByText(t("auth.no_registered_users_members_will_appear_after_their_first_google_sign_in")),
    ).toBeInTheDocument();
  });

  it("lists registered members without offline players and shows the metrics", async () => {
    mockFetch({ "GET /api/admin/members": [admin, pending, approved, blocked, offline] });
    renderMembers();

    expect(await screen.findByText("approved@example.com")).toBeInTheDocument();
    expect(screen.queryByText("offline@example.com")).not.toBeInTheDocument();
    const metrics = screen.getByRole("region", { name: t("members.user_status") });
    expect(within(metrics).getByText(t("common.total")).nextSibling).toHaveTextContent("4");
    expect(screen.getByRole("link", { name: t("members.find_member_s_missions", { member: "Bob" }) })).toHaveAttribute(
      "href",
      "/missions?search=Bob",
    );
    // L'admin corrente non ha azioni su se stesso.
    expect(
      screen.queryByRole("combobox", { name: t("members.role_for_email", { email: "admin@example.com" }) }),
    ).not.toBeInTheDocument();
  });

  it("filters by status tab and search", async () => {
    mockFetch({ "GET /api/admin/members": [pending, approved, blocked] });
    const { user } = renderMembers();

    await screen.findByText("approved@example.com");
    await user.click(screen.getByRole("tab", { name: new RegExp(t("common.pending_status_label")) }));
    expect(screen.getByText("pending@example.com")).toBeInTheDocument();
    expect(screen.queryByText("approved@example.com")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: new RegExp(t("common.all")) }));
    await user.type(screen.getByRole("textbox", { name: t("members.search_users") }), "carl");
    expect(screen.getByText("blocked@example.com")).toBeInTheDocument();
    expect(screen.queryByText("pending@example.com")).not.toBeInTheDocument();

    await user.clear(screen.getByRole("textbox", { name: t("members.search_users") }));
    await user.type(screen.getByRole("textbox", { name: t("members.search_users") }), "nobody");
    expect(screen.getByText(t("members.no_users_match_this_filter"))).toBeInTheDocument();
  });

  it("approves, blocks and changes roles", async () => {
    const { requests } = mockFetch({
      "GET /api/admin/members": [pending, approved],
      "PATCH /api/admin/members": { ok: true },
    });
    const { user } = renderMembers();

    await user.click(
      await screen.findByRole("button", { name: t("common.approve_email", { email: "pending@example.com" }) }),
    );
    expect(await screen.findByText(t("User approved."))).toBeInTheDocument();
    expect(requests("PATCH", "/api/admin/members")[0].body).toEqual({
      email: "pending@example.com",
      membershipStatus: "approved",
    });

    await user.click(screen.getByRole("button", { name: t("common.block_email", { email: "approved@example.com" }) }));
    expect(await screen.findByText(t("User blocked."))).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: t("common.unblock_email", { email: "approved@example.com" }) }),
    );
    expect(await screen.findByText(t("User is pending approval."))).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: t("members.role_for_email", { email: "pending@example.com" }) }),
      "moderator",
    );
    expect(await screen.findByText(t("Role updated: Moderator."))).toBeInTheDocument();
    expect(requests("PATCH", "/api/admin/members")[3].body).toEqual({
      email: "pending@example.com",
      role: "moderator",
    });
  });

  it("shows update errors", async () => {
    mockFetch({
      "GET /api/admin/members": [pending],
      "PATCH /api/admin/members": json({ error: "Not allowed." }, 403),
    });
    const { user } = renderMembers();

    await user.click(
      await screen.findByRole("button", { name: t("common.approve_email", { email: "pending@example.com" }) }),
    );
    expect(await screen.findByText("Not allowed.")).toBeInTheDocument();
  });

  it("does not let a moderator change roles or manage other moderators", async () => {
    const otherModerator = makeMember({ publicId: "m2", email: "mod2@example.com", name: "Zed", role: "moderator" });
    mockFetch({ "GET /api/admin/members": [approved, otherModerator] });
    renderMembers(moderator);

    await screen.findByText("approved@example.com");
    expect(
      screen.queryByRole("combobox", { name: t("members.role_for_email", { email: "approved@example.com" }) }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: t("auth.revoke_approval_for_email", { email: "approved@example.com" }) }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: t("common.delete_email", { email: "mod2@example.com" }) }),
    ).not.toBeInTheDocument();
  });

  it("deletes a member after confirmation", async () => {
    const { requests } = mockFetch({
      "GET /api/admin/members": [approved],
      "DELETE /api/admin/members": vi
        .fn()
        .mockReturnValueOnce(json({ error: "Deletion failed." }, 500))
        .mockReturnValueOnce({ ok: true }),
    });
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const { user } = renderMembers();

    const remove = await screen.findByRole("button", {
      name: t("common.delete_email", { email: "approved@example.com" }),
    });
    await user.click(remove);
    expect(requests("DELETE", "/api/admin/members")).toHaveLength(0);
    await user.click(remove);
    expect(await screen.findByText(t("Deletion failed."))).toBeInTheDocument();
    await user.click(remove);
    expect(await screen.findByText(t("User removed from the alliance."))).toBeInTheDocument();
    expect(requests("DELETE", "/api/admin/members")[1].body).toEqual({ email: "approved@example.com" });
    expect(screen.queryByText("approved@example.com")).not.toBeInTheDocument();
  });

  it("edits another member's profile", async () => {
    const { requests } = mockFetch({
      "GET /api/admin/members": [approved],
      "PATCH /api/admin/members": { ...approved, nmsName: "Bobby" },
    });
    const { user } = renderMembers();

    await user.click(await screen.findByRole("button", { name: t("members.edit_member_profile") }));
    const dialog = screen.getByRole("dialog", { name: t("members.edit_member_profile") });
    const name = within(dialog).getByRole("textbox", { name: t("common.in_game_name") });
    await user.clear(name);
    await user.type(name, "Bobby");
    await user.click(within(dialog).getByRole("button", { name: t("profile.save_profile") }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: t("members.edit_member_profile") })).not.toBeInTheDocument(),
    );
    expect(requests("PATCH", "/api/admin/members")[0].body).toMatchObject({
      nmsName: "Bobby",
      action: "profile",
      email: "approved@example.com",
    });
    expect(screen.getByText("Bobby")).toBeInTheDocument();
  });

  it("opens the alliance settings and the own profile", async () => {
    mockFetch({ "GET /api/admin/members": [], "GET /api/alliance": defaultAlliance });
    const { user } = renderMembers();

    await user.click(screen.getByRole("button", { name: t("admin.alliance_settings") }));
    const settings = screen.getByRole("dialog", { name: t("admin.alliance") });
    await user.click(within(settings).getByRole("button", { name: t("common.close") }));
    await user.click(screen.getByRole("button", { name: t("profile.my_profile") }));
    expect(screen.getByRole("dialog", { name: t("profile.my_nms_profile") })).toBeInTheDocument();
  });

  it("shows feedback as a closable toast", async () => {
    mockFetch({
      "GET /api/admin/members": [pending, approved],
      "PATCH /api/admin/members": { ok: true },
    });
    const { user } = renderMembers();
    await user.click(
      await screen.findByRole("button", { name: t("common.approve_email", { email: "pending@example.com" }) }),
    );
    const toast = await screen.findByRole("status", { name: "" });
    expect(toast).toHaveClass("toast");
    expect(toast).toHaveTextContent(t("User approved."));
    await user.click(within(toast).getByRole("button", { name: t("common.close_notification") }));
    expect(screen.queryByText(t("User approved."))).not.toBeInTheDocument();
  });

  it("shows load failures as an error toast that can be dismissed", async () => {
    mockFetch({ "GET /api/admin/members": json({}, 500) });
    const { user } = renderMembers();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("toast-error");
    await user.click(within(alert).getByRole("button", { name: t("common.close_notification") }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("falls back to generic messages when the requests fail without details", async () => {
    mockFetch({ "GET /api/admin/members": json({}, 500) });
    renderMembers();
    expect(await screen.findByText(t("Unable to load the user list."))).toBeInTheDocument();
  });

  it("shows a generic load error when the request cannot be sent", async () => {
    mockFetch({
      "GET /api/admin/members": () => {
        throw "offline";
      },
    });
    renderMembers();
    expect(await screen.findByText(t("errors.unable_to_load_the_user_list"))).toBeInTheDocument();
  });

  it("shows generic update and deletion errors", async () => {
    const unnamed = makeMember({ publicId: "u1", email: "unnamed@example.com", name: "Dana", nmsName: "" });
    const patch = vi
      .fn()
      .mockReturnValueOnce(json({}, 500))
      .mockImplementationOnce(() => {
        throw "offline";
      });
    const remove = vi
      .fn()
      .mockReturnValueOnce(json({}, 500))
      .mockImplementationOnce(() => {
        throw "offline";
      });
    mockFetch({
      "GET /api/admin/members": [pending, unnamed],
      "PATCH /api/admin/members": patch,
      "DELETE /api/admin/members": remove,
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderMembers();

    const approve = await screen.findByRole("button", {
      name: t("common.approve_email", { email: "pending@example.com" }),
    });
    await user.click(approve);
    expect(await screen.findByText(t("Update failed."))).toBeInTheDocument();
    await user.click(approve);
    expect(await screen.findByText(t("errors.update_failed"))).toBeInTheDocument();

    const deleteButton = screen.getByRole("button", {
      name: t("common.delete_email", { email: "unnamed@example.com" }),
    });
    await user.click(deleteButton);
    expect(confirm).toHaveBeenLastCalledWith(
      t("auth.remove_member_from_the_alliance_signing_in_again_will_require_a_new_approval", { member: "Dana" }),
    );
    expect(await screen.findByText(t("Deletion failed."))).toBeInTheDocument();
    await user.click(deleteButton);
    expect(await screen.findByText(t("errors.deletion_failed"))).toBeInTheDocument();
  });

  it("reports administrator and member role changes", async () => {
    mockFetch({ "GET /api/admin/members": [approved], "PATCH /api/admin/members": { ok: true } });
    const { user } = renderMembers();

    const role = await screen.findByRole("combobox", {
      name: t("members.role_for_email", { email: "approved@example.com" }),
    });
    await user.selectOptions(role, "admin");
    expect(await screen.findByText(t("Role updated: Administrator."))).toBeInTheDocument();
    await user.selectOptions(role, "user");
    expect(await screen.findByText(t("Role updated: Member."))).toBeInTheDocument();
  });

  it("updates only the edited member and closes the editor without saving", async () => {
    mockFetch({
      "GET /api/admin/members": [approved, blocked],
      "PATCH /api/admin/members": { ...approved, nmsName: "Bobby" },
    });
    const { user } = renderMembers();

    await screen.findByText("approved@example.com");
    const [editBob] = screen.getAllByRole("button", { name: t("members.edit_member_profile") });
    await user.click(editBob);
    let dialog = screen.getByRole("dialog", { name: t("members.edit_member_profile") });
    await user.click(within(dialog).getAllByRole("button", { name: t("common.close") })[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(editBob);
    dialog = screen.getByRole("dialog", { name: t("members.edit_member_profile") });
    await user.click(within(dialog).getByRole("button", { name: t("profile.save_profile") }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Bobby")).toBeInTheDocument();
    expect(screen.getByText("Carl")).toBeInTheDocument();
  });

  it("saves the alliance settings and the own profile", async () => {
    mockFetch({
      "GET /api/admin/members": [],
      "GET /api/alliance": defaultAlliance,
      "PATCH /api/alliance": { ...defaultAlliance, name: "Renamed Alliance" },
      "PATCH /api/profile": { ...admin, nmsName: "Captain" },
    });
    const { user } = renderMembers();

    await user.click(screen.getByRole("button", { name: t("admin.alliance_settings") }));
    const settings = screen.getByRole("dialog", { name: t("admin.alliance") });
    await waitFor(() =>
      expect(within(settings).getByRole("textbox", { name: t("admin.alliance_name") })).toHaveValue("Test Alliance"),
    );
    await user.click(within(settings).getByRole("button", { name: t("admin.save_settings") }));
    await waitFor(() => expect(screen.getAllByText("Renamed Alliance").length).toBeGreaterThan(0));
    await user.click(within(settings).getByRole("button", { name: t("common.close") }));

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
