// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { signIn, signOut } from "next-auth/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NotFound from "@/app/not-found";
import { GoogleLogin } from "@/components/pages/google-login";
import { LoginScreen } from "@/components/pages/login-screen";
import { PendingApproval } from "@/components/pages/pending-approval";
import { makeMember } from "../helpers/members";
import { mockFetch, renderPage, t } from "./helpers";

vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
vi.mock("next/link", async () => (await import("./helpers")).nextLinkModule);
vi.mock("next-auth/react", async () => (await import("./helpers")).nextAuthReactModule);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GoogleLogin", () => {
  it("signs in with Google when the configuration is complete", async () => {
    const { user } = renderPage(<GoogleLogin allianceName="Atlas Pact" />);

    expect(screen.getByText("Atlas Pact")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("auth.continue_with_google") }));
    expect(signIn).toHaveBeenCalledWith("google");
  });

  it("lists the missing configuration instead of the login button", () => {
    renderPage(<GoogleLogin missingConfiguration={["AUTH_SECRET", "AUTH_GOOGLE_ID"]} />);

    expect(screen.getByText("NMS ALLIANCE")).toBeInTheDocument();
    expect(screen.getByText(t("common.sign_in_needs_to_be_configured_for_this_project"))).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveTextContent("AUTH_SECRETAUTH_GOOGLE_ID");
    expect(screen.queryByRole("button", { name: t("auth.continue_with_google") })).not.toBeInTheDocument();
  });

  it("offers the local development accounts", async () => {
    const { user } = renderPage(
      <GoogleLogin
        localAccounts={[{ email: "admin@local", label: "Local Admin", role: "admin", specialty: "ranger" }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Local Admin" }));
    expect(signIn).toHaveBeenCalledWith("local", { email: "admin@local" });
    expect(screen.queryByRole("button", { name: t("auth.continue_with_google") })).not.toBeInTheDocument();
  });

  it("falls back to the default mark when the alliance logo fails", () => {
    const { container } = renderPage(<GoogleLogin allianceLogoUrl="/logo.png" />);

    const logo = container.querySelector("img")!;
    expect(logo).toHaveAttribute("src", "/api/alliance/login-logo");
    fireEvent.error(logo);
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("LoginScreen", () => {
  it("shows the local accounts only when local auth is enabled", () => {
    vi.stubEnv("LOCAL_AUTH", "true");
    vi.stubEnv("NODE_ENV", "development");
    renderPage(<LoginScreen allianceName="Atlas" />);
    expect(screen.getByRole("button", { name: "Local Admin" })).toBeInTheDocument();
  });

  it("shows the Google button otherwise", () => {
    renderPage(<LoginScreen allianceName="Atlas" />);
    expect(screen.getByRole("button", { name: t("auth.continue_with_google") })).toBeInTheDocument();
  });
});

describe("PendingApproval", () => {
  it("asks a pending member to complete the profile and saves it", async () => {
    const member = makeMember({ membershipStatus: "pending", nmsName: "", nmsCode: "", specialty: "" });
    mockFetch({
      "PATCH /api/profile": { ...member, nmsName: "Rookie", nmsCode: "ABCDEFGHJKLMN", specialty: "explorer" },
    });
    const { user } = renderPage(<PendingApproval member={member} />);

    expect(screen.getByRole("heading", { name: `${t("auth.request_pending")}.` })).toBeInTheDocument();
    expect(
      screen.getByText(`${member.name} · ${t("profile.name_friend_code_platform_and_specialty_required")}`),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("profile.complete_nms_profile") }));
    await user.type(screen.getByRole("textbox", { name: t("common.in_game_name") }), "Rookie");
    await user.type(screen.getByPlaceholderText("BMPE-S0B9-RCDMT"), "ABCDEFGHJKLMN");
    await user.click(screen.getByRole("radio", { name: t("common.explorer") }));
    await user.click(screen.getByRole("button", { name: t("profile.save_profile") }));

    await waitFor(() => expect(screen.getByText(`Rookie · ${t("profile.nms_profile_complete")}`)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: t("profile.edit_nms_profile") })).toBeInTheDocument();
  });

  it("tells a blocked member that access is blocked and signs out", async () => {
    const { user } = renderPage(<PendingApproval member={makeMember({ membershipStatus: "blocked" })} />);

    expect(screen.getByRole("heading", { name: `${t("auth.access_blocked")}.` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("profile.edit_nms_profile") })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("navigation.sign_out") }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });
});

describe("NotFound", () => {
  it("links back to the stations page", () => {
    renderPage(<NotFound />);

    expect(screen.getByRole("heading", { name: t("errors.page_not_found") })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("errors.return_to_first_page") })).toHaveAttribute("href", "/stations");
    expect(screen.getByText("Coordinates off course")).toBeInTheDocument();
    expect(screen.getByText("404 · Signal lost")).toBeInTheDocument();
  });

  it("is translated into Italian", () => {
    renderPage(<NotFound />, { locale: "it" });

    expect(screen.getByText("Coordinate fuori rotta")).toBeInTheDocument();
    expect(screen.getByText("404 · Segnale perso")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("errors.return_to_first_page", undefined, "it") })).toHaveAttribute(
      "href",
      "/stations",
    );
  });
});
