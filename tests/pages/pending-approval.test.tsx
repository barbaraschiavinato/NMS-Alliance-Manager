// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PendingApproval } from "@/components/pages/pending-approval";
import { makeMember } from "../helpers/members";
import { mockFetch, renderPage, t } from "./helpers";

vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PendingApproval", () => {
  it("lets a pending member with a complete profile edit it, close the panel and save changes", async () => {
    const member = makeMember({ membershipStatus: "pending", nmsName: "Voyager" });
    const { requests } = mockFetch({ "PATCH /api/profile": { ...member, nmsName: "Voyager Two" } });
    const { user } = renderPage(<PendingApproval member={member} />);

    expect(screen.getByText(`Voyager · ${t("profile.nms_profile_complete")}`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t("profile.edit_nms_profile") }));
    const firstDialog = screen.getByRole("dialog", { name: t("profile.my_nms_profile") });
    await user.click(within(firstDialog).getAllByRole("button", { name: t("common.close") })[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t("profile.edit_nms_profile") }));
    const dialog = screen.getByRole("dialog", { name: t("profile.my_nms_profile") });
    const name = within(dialog).getByRole("textbox", { name: t("common.in_game_name") });
    await user.clear(name);
    await user.type(name, "Voyager Two");
    await user.click(within(dialog).getByRole("button", { name: t("profile.save_profile") }));

    await waitFor(() =>
      expect(screen.getByText(`Voyager Two · ${t("profile.nms_profile_complete")}`)).toBeInTheDocument(),
    );
    expect(requests("PATCH", "/api/profile")[0].body).toMatchObject({ nmsName: "Voyager Two" });
  });

  it("treats a profile with an invalid friend code as incomplete and shows the in-game name", () => {
    renderPage(
      <PendingApproval member={makeMember({ membershipStatus: "pending", nmsName: "Voyager", nmsCode: "BAD" })} />,
    );

    expect(screen.getByRole("button", { name: t("profile.complete_nms_profile") })).toBeInTheDocument();
    expect(
      screen.getByText(`Voyager · ${t("profile.name_friend_code_platform_and_specialty_required")}`),
    ).toBeInTheDocument();
  });

  it("treats a profile without a specialty as incomplete", () => {
    renderPage(
      <PendingApproval member={makeMember({ membershipStatus: "pending", nmsName: "Voyager", specialty: "" })} />,
    );

    expect(screen.getByRole("button", { name: t("profile.complete_nms_profile") })).toBeInTheDocument();
  });

  it("does not open the profile panel for a member that is no longer pending", async () => {
    const { user } = renderPage(<PendingApproval member={makeMember({ membershipStatus: "approved" })} />);

    expect(screen.getByRole("heading", { name: `${t("auth.request_pending")}.` })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("profile.edit_nms_profile") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
