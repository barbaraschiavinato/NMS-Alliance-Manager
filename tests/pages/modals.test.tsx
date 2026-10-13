// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminPanel } from "@/components/modals/admin-panel";
import { MemberCardDialog } from "@/components/modals/member-card-dialog";
import { MemberProfilePanel } from "@/components/modals/member-profile-panel";
import { defaultAlliance, makeMember } from "../helpers/members";
import { json, mockFetch, renderPage, t } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdminPanel", () => {
  function renderAdmin() {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const view = renderPage(<AdminPanel onClose={onClose} onSaved={onSaved} />);
    return { ...view, onClose, onSaved };
  }

  it("loads the settings and saves the edited values", async () => {
    const saved = {
      ...defaultAlliance,
      name: "New Name",
      discordUrl: "https://discord.gg/abc",
      heroGradientMode: "left",
    };
    const { requests } = mockFetch({
      "GET /api/alliance": { ...defaultAlliance, bannerUrl: "/banner.png" },
      "PATCH /api/alliance": saved,
    });
    const { user, onSaved, onClose } = renderAdmin();

    const name = screen.getByRole("textbox", { name: t("admin.alliance_name") });
    await waitFor(() => expect(name).toHaveValue("Test Alliance"));
    await user.clear(name);
    expect(screen.getByRole("button", { name: t("admin.save_settings") })).toBeDisabled();
    await user.type(name, "New Name");
    await user.type(screen.getByRole("textbox", { name: t("admin.discord_invite") }), "https://discord.gg/abc");
    await user.type(screen.getByRole("textbox", { name: t("admin.telegram_link") }), "https://t.me/x");
    await user.click(screen.getByRole("button", { name: t("common.text_only") }));
    expect(screen.getByRole("button", { name: t("common.text_only") })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: t("common.none") }));
    await user.click(screen.getByRole("button", { name: t("common.text_only") }));
    await user.click(screen.getByRole("button", { name: t("admin.save_settings") }));

    expect(await screen.findByText(t("admin.alliance_settings_saved"))).toBeInTheDocument();
    expect(requests("PATCH", "/api/alliance")[0].body).toMatchObject({
      name: "New Name",
      discordUrl: "https://discord.gg/abc",
      telegramUrl: "https://t.me/x",
      heroGradientMode: "left",
      bannerUrl: "/banner.png",
    });
    expect(onSaved).toHaveBeenCalledWith(saved);

    await user.click(screen.getByRole("button", { name: t("common.close") }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows load and save errors", async () => {
    mockFetch({
      "GET /api/alliance": json({ error: "Admins only." }, 403),
      "PATCH /api/alliance": json({ error: "Invalid URL." }, 400),
    });
    const { user, onSaved } = renderAdmin();

    expect(await screen.findByText("Admins only.")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: t("admin.alliance_name") }), "Name");
    await user.click(screen.getByRole("button", { name: t("admin.save_settings") }));
    expect(await screen.findByText("Invalid URL.")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("uploads the logo and reports upload failures", async () => {
    const { requests } = mockFetch({
      "GET /api/alliance": defaultAlliance,
      "POST /api/admin/upload": vi
        .fn()
        .mockReturnValueOnce({ url: "/api/alliance/logo.png" })
        .mockReturnValueOnce(json({ error: "Too large." }, 413)),
    });
    const { user, container } = renderAdmin();
    const [logoInput, bannerInput] = Array.from(
      container.ownerDocument.querySelectorAll<HTMLInputElement>("input[type=file]"),
    );

    await user.upload(logoInput, new File(["png"], "logo.png", { type: "image/png" }));
    expect(await screen.findByText(t("admin.image_uploaded_save_to_publish_the_changes"))).toBeInTheDocument();
    expect(requests("POST", "/api/admin/upload")[0].body).toBeInstanceOf(FormData);
    expect(container.ownerDocument.querySelector(".logo-preview")).toHaveStyle({
      backgroundImage: 'url("/api/alliance/logo.png")',
    });

    await user.upload(bannerInput, new File(["png"], "banner.png", { type: "image/png" }));
    expect(await screen.findByText("Too large.")).toBeInTheDocument();
  });

  it("normalizes the portal code, picks galaxy and gradient, and ignores an empty file selection", async () => {
    const { requests } = mockFetch({ "GET /api/alliance": { ...defaultAlliance, bannerUrl: "/banner.png" } });
    const { user, container } = renderAdmin();

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: t("admin.alliance_name") })).toHaveValue("Test Alliance"),
    );
    const portal = screen.getByRole("textbox", { name: t("admin.alliance_portal_code") });
    await user.type(portal, "ab-12 cd34e");
    expect(portal).toHaveValue("AB12CD34E");
    const galaxy = screen.getByRole("combobox", { name: t("admin.alliance_galaxy") });
    await user.selectOptions(galaxy, "2");
    expect(galaxy).toHaveValue("2");

    const banner = container.ownerDocument.querySelector(".banner-preview");
    await user.click(screen.getByRole("button", { name: t("common.none") }));
    expect(banner).toHaveStyle({ backgroundImage: 'url("/banner.png")' });
    await user.click(screen.getByRole("button", { name: t("common.full") }));
    expect(screen.getByRole("button", { name: t("common.full") })).toHaveAttribute("aria-pressed", "true");
    expect((banner as HTMLElement).style.backgroundImage).toContain("linear-gradient(100deg");

    const [logoInput] = Array.from(container.ownerDocument.querySelectorAll<HTMLInputElement>("input[type=file]"));
    fireEvent.change(logoInput, { target: { files: [] } });
    expect(requests("POST", "/api/admin/upload")).toHaveLength(0);
  });

  it("falls back to generic messages when the server gives no error", async () => {
    mockFetch({
      "GET /api/alliance": json({}, 500),
      "PATCH /api/alliance": vi
        .fn()
        .mockReturnValueOnce(json({}, 500))
        .mockImplementationOnce(() => Promise.reject("offline")),
      "POST /api/admin/upload": vi
        .fn()
        .mockReturnValueOnce(json({}, 500))
        .mockImplementationOnce(() => Promise.reject("offline")),
    });
    const { user, container } = renderAdmin();

    expect(await screen.findByText(t("errors.unable_to_load_alliance_settings"))).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: t("admin.alliance_name") }), "Name");
    const save = screen.getByRole("button", { name: t("admin.save_settings") });
    await user.click(save);
    expect(await screen.findByText(t("errors.save_failed"))).toBeInTheDocument();
    await user.click(save);
    await waitFor(() => expect(save).toBeEnabled());
    expect(screen.getByText(t("errors.save_failed"))).toBeInTheDocument();

    const [logoInput] = Array.from(container.ownerDocument.querySelectorAll<HTMLInputElement>("input[type=file]"));
    await user.upload(logoInput, new File(["png"], "logo.png", { type: "image/png" }));
    expect(await screen.findByText(t("errors.upload_failed"))).toBeInTheDocument();
    await user.upload(logoInput, new File(["png"], "logo2.png", { type: "image/png" }));
    await waitFor(() => expect(logoInput).toBeEnabled());
    expect(screen.getByText(t("errors.upload_failed"))).toBeInTheDocument();
    expect(container.ownerDocument.querySelector(".logo-preview")).not.toHaveAttribute("style");
  });

  it("reports a network failure while loading", async () => {
    mockFetch({ "GET /api/alliance": () => Promise.reject("offline") });
    renderAdmin();

    expect(await screen.findByText(t("errors.unable_to_load_alliance_settings"))).toBeInTheDocument();
  });
});

describe("MemberProfilePanel", () => {
  it("saves the own profile including the simple view preference", async () => {
    const moderator = makeMember({
      role: "moderator",
      simpleView: false,
      nmsName: "Mod",
      nmsCode: "ABCDEFGHJKLMN",
      platforms: ["PC"],
      specialty: "explorer",
    });
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const { requests } = mockFetch({ "PATCH /api/profile": { ...moderator, nmsName: "Moddy" } });
    const { user } = renderPage(<MemberProfilePanel member={moderator} onClose={onClose} onSaved={onSaved} />);

    expect(screen.getByText(moderator.email)).toBeInTheDocument();
    const name = screen.getByRole("textbox", { name: t("common.in_game_name") });
    await user.clear(name);
    await user.type(name, "Moddy");
    await user.type(screen.getByPlaceholderText("@username"), "@moddy");
    await user.click(screen.getByRole("checkbox", { name: "Xbox" }));
    await user.click(screen.getByRole("checkbox", { name: "PC" }));
    await user.click(screen.getByRole("radio", { name: t("common.builder") }));
    await user.click(screen.getByRole("checkbox", { name: t("profile.simple_view") }));
    await user.click(screen.getByRole("button", { name: t("profile.save_profile") }));

    expect(await screen.findByText(t("profile.profile_saved"))).toBeInTheDocument();
    expect(requests("PATCH", "/api/profile")[0].body).toEqual({
      nmsName: "Moddy",
      nmsCode: "ABCDEFGHJKLMN",
      telegramName: "@moddy",
      discordName: "",
      platforms: ["Xbox"],
      specialty: "builder",
      simpleView: true,
    });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ nmsName: "Moddy" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("requires a valid friend code and shows save errors", async () => {
    const member = makeMember({ nmsCode: "", specialty: "" });
    mockFetch({ "PATCH /api/profile": json({ error: "profile.invalid" }, 400) });
    const onClose = vi.fn();
    const { user } = renderPage(<MemberProfilePanel member={member} onClose={onClose} onSaved={vi.fn()} />);

    expect(screen.queryByRole("checkbox", { name: t("profile.simple_view") })).not.toBeInTheDocument();
    const save = screen.getByRole("button", { name: t("profile.save_profile") });
    const code = screen.getByPlaceholderText("BMPE-S0B9-RCDMT");
    await user.type(code, "abcd efgh");
    expect(code).toHaveValue("ABCD-EFGH");
    await user.click(screen.getByRole("radio", { name: t("common.explorer") }));
    expect(save).toBeDisabled();
    await user.type(code, "jklmn");
    expect(save).toBeEnabled();
    await user.click(save);
    expect(await screen.findByText(t("profile.invalid"))).toBeInTheDocument();

    const [headerClose, footerClose] = screen.getAllByRole("button", { name: t("common.close") });
    await user.click(headerClose);
    await user.click(footerClose);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it("creates an offline player with an optional friend code and closes", async () => {
    const member = makeMember({ nmsName: "", nmsCode: "", specialty: "", platforms: [], email: "" });
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const { requests } = mockFetch({ "POST /api/admin/members": { ...member, nmsName: "Offline Joe" } });
    const { user } = renderPage(
      <MemberProfilePanel createOffline member={member} onClose={onClose} onSaved={onSaved} />,
    );

    expect(screen.getByRole("heading", { name: t("members.add_offline_player") })).toBeInTheDocument();
    expect(screen.getByText(t("members.offline_player_hint"))).toBeInTheDocument();
    expect(screen.getByText(/· opzionale/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: t("profile.simple_view") })).not.toBeInTheDocument();
    const save = screen.getByRole("button", { name: t("profile.save_profile") });
    await user.type(screen.getByRole("textbox", { name: t("common.in_game_name") }), "Offline Joe");
    await user.click(screen.getByRole("radio", { name: t("common.ranger") }));
    expect(save).toBeEnabled();
    const code = screen.getByPlaceholderText("BMPE-S0B9-RCDMT");
    await user.type(code, "abc");
    expect(save).toBeDisabled();
    await user.clear(code);
    await user.type(screen.getByPlaceholderText("username"), "joe");
    await user.click(save);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(requests("POST", "/api/admin/members")[0].body).toEqual({
      nmsName: "Offline Joe",
      nmsCode: "",
      telegramName: "",
      discordName: "joe",
      platforms: [],
      specialty: "ranger",
    });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ nmsName: "Offline Joe" }));
  });

  it("updates an existing offline player", async () => {
    const member = makeMember({ publicId: "offline-1", offline: true, nmsCode: "" });
    const { requests } = mockFetch({ "POST /api/admin/members": member });
    const onClose = vi.fn();
    const { user } = renderPage(<MemberProfilePanel editOffline member={member} onClose={onClose} onSaved={vi.fn()} />);

    expect(screen.getByRole("heading", { name: t("members.edit_offline_player") })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("profile.save_profile") }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(requests("POST", "/api/admin/members")[0].body).toMatchObject({
      action: "update",
      offlineId: "offline-1",
    });
  });

  it("lets a moderator edit another member and reloads the page when closing after a save", async () => {
    const member = makeMember({
      email: "pilot@example.com",
      image: "https://example.com/avatar.png",
      role: "admin",
      telegramName: undefined,
      discordName: undefined,
    });
    const { requests } = mockFetch({ "PATCH /api/admin/members": member });
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...originalLocation, reload } });
    const onClose = vi.fn();
    try {
      const { user, container } = renderPage(
        <MemberProfilePanel editMember member={member} onClose={onClose} onSaved={vi.fn()} />,
      );

      expect(screen.getByRole("heading", { name: t("members.edit_member_profile") })).toBeInTheDocument();
      expect(container.ownerDocument.querySelector(".profile-google-avatar span")).toHaveStyle({
        backgroundImage: 'url("https://example.com/avatar.png")',
      });
      expect(
        screen.getByText(t("admin.role_assigned_by_administrator_role", { role: t("admin.administrator") })),
      ).toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: t("profile.simple_view") })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: t("profile.save_profile") }));

      expect(await screen.findByText(t("profile.profile_saved"))).toBeInTheDocument();
      expect(requests("PATCH", "/api/admin/members")[0].body).toMatchObject({
        action: "profile",
        email: "pilot@example.com",
        telegramName: "",
        discordName: "",
      });
      expect(requests("PATCH", "/api/admin/members")[0].body).not.toHaveProperty("simpleView");
      await user.click(screen.getAllByRole("button", { name: t("common.close") })[0]);
      expect(reload).toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    }
  });

  it("falls back to a generic error message", async () => {
    const member = makeMember();
    mockFetch({
      "PATCH /api/profile": vi
        .fn()
        .mockReturnValueOnce(json({}, 500))
        .mockImplementationOnce(() => Promise.reject("offline")),
    });
    const { user } = renderPage(<MemberProfilePanel member={member} onClose={vi.fn()} onSaved={vi.fn()} />);

    const save = screen.getByRole("button", { name: t("profile.save_profile") });
    await user.click(save);
    expect(await screen.findByText(t("errors.unable_to_save_the_profile"))).toBeInTheDocument();
    await user.click(save);
    await waitFor(() => expect(save).toBeEnabled());
    expect(screen.getByText(t("errors.unable_to_save_the_profile"))).toBeInTheDocument();
    expect(screen.queryByText(t("profile.profile_saved"))).not.toBeInTheDocument();
  });
});

describe("MemberCardDialog", () => {
  const profile = {
    publicId: "p1",
    name: "Pilot Real",
    image: "",
    nmsName: "Pilot",
    platforms: ["PC", "Xbox"],
    specialty: "ranger",
    nmsCode: "ABCD-EFGH-JKLMN",
    telegramName: "@pilot",
    discordName: "pilot#1",
    role: "moderator",
  };

  it("shows the profile and sends a mission message", async () => {
    const onClose = vi.fn();
    const { requests } = mockFetch({
      "/api/members": profile,
      "POST /api/messages": vi
        .fn()
        .mockReturnValueOnce(json({ error: "profile.message_unable_to_save" }, 500))
        .mockReturnValueOnce({ ok: true }),
    });
    const { user } = renderPage(
      <MemberCardDialog
        memberId="p1"
        messageContext={{ type: "mission", missionCode: "M-1", subjectLabel: "Survey Alpha" }}
        onClose={onClose}
      />,
    );

    expect(screen.getByText(t("profile.loading_profile"))).toBeInTheDocument();
    expect(await screen.findByText("Pilot")).toBeInTheDocument();
    expect(screen.getByText("PC, Xbox")).toBeInTheDocument();
    expect(screen.getByText("@pilot")).toBeInTheDocument();
    expect(screen.getByText(t("common.moderator"))).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t("profile.leave_a_message") }));
    expect(screen.getByText("Survey Alpha")).toBeInTheDocument();
    const send = screen.getByRole("button", { name: t("profile.send_message") });
    await user.type(screen.getByRole("textbox", { name: t("profile.message_text") }), "Hello there");
    expect(send).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: t("profile.message_mission_only_notice") }));
    await user.click(send);
    expect(await screen.findByText(t("profile.message_unable_to_save"))).toBeInTheDocument();

    await user.click(send);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(requests("POST", "/api/messages")[1].body).toEqual({
      recipientId: "p1",
      message: "Hello there",
      context: { type: "mission", missionCode: "M-1", subjectLabel: "Survey Alpha" },
    });
  });

  it("loads the planet subject for planet messages and can go back", async () => {
    const { requests } = mockFetch({
      "/api/members": profile,
      "GET /api/messages": { subject: "Verdant Moon (planet 2)" },
    });
    const { user } = renderPage(
      <MemberCardDialog
        memberId="p1"
        messageContext={{ type: "planet", portal: "1234567890AB", galaxy: 3, subjectLabel: "" }}
        onClose={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: t("profile.leave_a_message") }));
    expect(await screen.findByText("Verdant Moon (planet 2)")).toBeInTheDocument();
    const subjectCall = requests("GET", "/api/messages")[0];
    expect(Object.fromEntries(subjectCall.url.searchParams)).toEqual({
      recipientId: "p1",
      portal: "1234567890AB",
      galaxy: "3",
    });

    await user.click(screen.getByRole("button", { name: t("common.cancel") }));
    expect(screen.getByRole("heading", { name: t("profile.nms_profile") })).toBeInTheDocument();
  });

  it("hides messaging for offline players and shows load errors", async () => {
    mockFetch({ "/api/members": { ...profile, offline: true, nmsName: "", specialty: "", platforms: [] } });
    renderPage(
      <MemberCardDialog
        memberId="p1"
        messageContext={{ type: "mission", missionCode: "M-1", subjectLabel: "" }}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText(t("profile.no_specialty_specified"))).toBeInTheDocument();
    expect(screen.getByText(t("profile.no_platforms_specified"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("profile.leave_a_message") })).not.toBeInTheDocument();
  });

  it("shows the profile load error", async () => {
    mockFetch({ "/api/members": json({ error: "Member not found." }, 404) });
    const onClose = vi.fn();
    const { user } = renderPage(
      <MemberCardDialog
        memberId="p1"
        messageContext={{ type: "mission", missionCode: "M-1", subjectLabel: "" }}
        onClose={onClose}
      />,
    );

    expect(await screen.findByText("Member not found.")).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("common.close") }));
    expect(onClose).toHaveBeenCalled();
  });
  it("shows the avatar, falls back to the account name and to generic send errors", async () => {
    const onClose = vi.fn();
    mockFetch({
      "/api/members": { ...profile, nmsName: "", image: "https://example.com/a.png", role: "user" },
      "POST /api/messages": vi
        .fn()
        .mockReturnValueOnce(json({}, 500))
        .mockImplementationOnce(() => Promise.reject("offline")),
    });
    const { user, container } = renderPage(
      <MemberCardDialog
        memberId="p1"
        messageContext={{ type: "mission", missionCode: "M-1", subjectLabel: "Survey" }}
        onClose={onClose}
      />,
    );

    expect(await screen.findByText("Pilot Real")).toBeInTheDocument();
    expect(screen.getByText(t("admin.alliance_member"))).toBeInTheDocument();
    expect(screen.getByText(t("members.member_role_label"))).toBeInTheDocument();
    expect(container.ownerDocument.querySelector(".profile-google-avatar span")).toHaveStyle({
      backgroundImage: 'url("https://example.com/a.png")',
    });

    await user.click(screen.getByRole("button", { name: t("profile.leave_a_message") }));
    expect(screen.getByText(t("profile.message_recipient", { recipient: "Pilot Real" }))).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: t("profile.message_text") }), "Hi");
    await user.click(screen.getByRole("checkbox", { name: t("profile.message_mission_only_notice") }));
    const send = screen.getByRole("button", { name: t("profile.send_message") });
    await user.click(send);
    expect(await screen.findByText(t("profile.message_unable_to_save"))).toBeInTheDocument();
    await user.click(send);
    await waitFor(() => expect(send).toBeEnabled());
    expect(screen.getByText(t("profile.message_unable_to_save"))).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("falls back to generic profile load errors", async () => {
    mockFetch({ "/api/members": json({}, 500) });
    const view = renderPage(
      <MemberCardDialog
        memberId="p1"
        messageContext={{ type: "mission", missionCode: "M-1", subjectLabel: "" }}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText(t("errors.unable_to_load_the_profile"))).toBeInTheDocument();
    view.unmount();

    mockFetch({ "/api/members": () => Promise.reject("offline") });
    renderPage(
      <MemberCardDialog
        memberId="p1"
        messageContext={{ type: "mission", missionCode: "M-1", subjectLabel: "" }}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText(t("errors.unable_to_load_the_profile"))).toBeInTheDocument();
    expect(screen.queryByText(t("profile.loading_profile"))).not.toBeInTheDocument();
  });

  it("keeps the given subject when the planet subject cannot be loaded", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const messageContext = { type: "planet", portal: "1234567890AB", galaxy: 0, subjectLabel: "Fallback" } as const;
    for (const route of [json({}, 500), { other: true }, () => Promise.reject("offline")]) {
      mockFetch({ "/api/members": profile, "GET /api/messages": route });
      const { user, unmount } = renderPage(
        <MemberCardDialog memberId="p1" messageContext={messageContext} onClose={vi.fn()} />,
      );
      await user.click(await screen.findByRole("button", { name: t("profile.leave_a_message") }));
      expect(screen.getByText("Fallback")).toBeInTheDocument();
      unmount();
    }
    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith("Unable to load message planet subject", expect.any(Error));
    expect(consoleError).toHaveBeenCalledWith("Unable to load message planet subject", "offline");
    consoleError.mockRestore();
  });

  it("aborts pending requests when closed and ignores their failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rejecters: Array<(reason: unknown) => void> = [];
    const { fetchMock } = mockFetch({
      "/api/members": () => new Promise((_, reject) => rejecters.push(reject)),
      "GET /api/messages": () => new Promise((_, reject) => rejecters.push(reject)),
    });
    const { unmount } = renderPage(
      <MemberCardDialog
        memberId="p1"
        messageContext={{ type: "planet", portal: "1234567890AB", galaxy: 0, subjectLabel: "" }}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(rejecters).toHaveLength(2));
    unmount();
    const signals = fetchMock.mock.calls.map(([, init]) => init?.signal);
    expect(signals.every((signal) => signal?.aborted)).toBe(true);
    for (const reject of rejecters) reject(new Error("aborted"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
