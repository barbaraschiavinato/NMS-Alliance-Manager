// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuideAppPage } from "@/components/pages/guide-app-page";
import { defaultAlliance, makeMember } from "../helpers/members";
import { mockFetch, renderPage, t } from "./helpers";

vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationModule);
vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GuideAppPage", () => {
  it("renders the guide content inside the app shell with the guide section active", () => {
    mockFetch();
    renderPage(
      <GuideAppPage alliance={defaultAlliance} currentMember={makeMember()} missionCount={3} stationCount={2}>
        <p>Guide body</p>
      </GuideAppPage>,
    );

    expect(screen.getByText("Guide body")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("navigation.guide") })).toHaveClass("active");
    expect(screen.queryByRole("button", { name: t("admin.alliance_settings") })).not.toBeInTheDocument();
  });

  it("lets an admin edit the alliance settings and the own profile", async () => {
    const admin = makeMember({ role: "admin", nmsName: "Chief" });
    const { requests } = mockFetch({
      "GET /api/alliance": defaultAlliance,
      "PATCH /api/alliance": { ...defaultAlliance, name: "Renamed Alliance" },
      "PATCH /api/profile": { ...admin, nmsName: "Captain" },
    });
    const { user } = renderPage(
      <GuideAppPage
        alliance={defaultAlliance}
        currentMember={admin}
        missionCount={0}
        offlineCount={1}
        stationCount={0}
        userCount={4}
      >
        <p>Guide body</p>
      </GuideAppPage>,
    );

    await user.click(screen.getByRole("button", { name: t("admin.alliance_settings") }));
    const settings = screen.getByRole("dialog", { name: t("admin.alliance") });
    await waitFor(() =>
      expect(within(settings).getByRole("textbox", { name: t("admin.alliance_name") })).toHaveValue("Test Alliance"),
    );
    await user.click(within(settings).getByRole("button", { name: t("admin.save_settings") }));
    await waitFor(() => expect(screen.getByText("Renamed Alliance")).toBeInTheDocument());
    expect(requests("PATCH", "/api/alliance")).toHaveLength(1);
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
