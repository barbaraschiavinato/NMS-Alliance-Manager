// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  MemberCard,
  roleLabels,
  specialtyLabels,
  statusLabels,
  type ManagedMember,
} from "@/components/cards/member-card";
import { makeMember } from "../../helpers/members";
import { renderWithLocale } from "../helpers";

vi.mock("next/link", async () => (await import("../helpers")).nextLinkModule);

function managed(overrides: Partial<ManagedMember> = {}): ManagedMember {
  return {
    ...makeMember({ email: "nova@example.com", nmsName: "Nova", nmsCode: "ABCD1234EFGH5", ...overrides }),
    protectedAdmin: false,
    ...overrides,
  };
}

function renderCard(
  member: ManagedMember,
  options: {
    canChangeRole?: boolean;
    currentMemberEmail?: string;
    activity?: { missionOwnerIds: string[]; stationOwnerIds: string[] };
    locale?: "it" | "en";
  } = {},
) {
  const handlers = { onStatus: vi.fn(), onRole: vi.fn(), onDelete: vi.fn(), onEdit: vi.fn() };
  const result = renderWithLocale(
    <MemberCard
      canChangeRole={options.canChangeRole ?? false}
      currentMemberEmail={options.currentMemberEmail ?? "me@example.com"}
      member={member}
      memberActivity={options.activity ?? { missionOwnerIds: [], stationOwnerIds: [] }}
      {...handlers}
    />,
    { locale: options.locale },
  );
  return { ...result, ...handlers };
}

describe("MemberCard", () => {
  it("exports label keys for roles, statuses and specialties", () => {
    expect(roleLabels.admin).toBe("admin.administrator");
    expect(statusLabels.blocked).toBe("common.blocked_status_label");
    expect(specialtyLabels.ranger).toBe("common.ranger");
  });

  it("shows the profile details", () => {
    renderCard(
      managed({ telegramName: "nova_tg", platforms: ["PC", "PlayStation"], specialty: "explorer", role: "moderator" }),
    );
    const card = screen.getByRole("article");
    expect(within(card).getByText("Nova")).toBeInTheDocument();
    expect(within(card).getByText("nova@example.com")).toBeInTheDocument();
    expect(within(card).getByText("Approved")).toBeInTheDocument();
    expect(within(card).getByText("Friend code").nextSibling).toHaveTextContent("ABCD-1234-EFGH5");
    expect(within(card).getByText("nova_tg")).toBeInTheDocument();
    expect(within(card).getByText("PC, PlayStation")).toBeInTheDocument();
    expect(within(card).getByText("Explorer")).toBeInTheDocument();
    expect(within(card).getByText("Moderator")).toBeInTheDocument();
    expect(within(card).getByText("-")).toBeInTheDocument();
    expect(within(card).getByText("N")).toBeInTheDocument();
  });

  it("shows the profile picture instead of the initial", () => {
    const { container } = renderCard(managed({ image: "https://example.com/nova.png" }));
    const avatar = container.querySelector(".member-admin-avatar");
    expect(avatar?.querySelector("span")).toHaveStyle({ backgroundImage: 'url("https://example.com/nova.png")' });
    expect(avatar).not.toHaveTextContent("N");
  });

  it("marks an incomplete profile, in Italian", () => {
    renderCard(
      managed({ nmsName: "", name: "zed", nmsCode: "", platforms: [], specialty: "", membershipStatus: "blocked" }),
      { locale: "it" },
    );
    expect(screen.getByText("Nome NMS da completare")).toBeInTheDocument();
    expect(screen.getByText("Da completare")).toBeInTheDocument();
    expect(screen.getAllByText("Da selezionare")).toHaveLength(2);
    expect(screen.getByText("Bloccato")).toBeInTheDocument();
    expect(screen.getByText("Z")).toBeInTheDocument();
  });

  it("shows a protected badge and no actions for the protected admin", () => {
    renderCard(managed({ role: "admin", protectedAdmin: true }), { canChangeRole: true });
    expect(screen.getByText("Protected")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("hides actions on the viewer's own card", () => {
    renderCard(managed(), { canChangeRole: true, currentMemberEmail: "NOVA@example.com" });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("hides actions on staff members when the viewer cannot change roles", () => {
    renderCard(managed({ role: "moderator" }));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("links to the member's missions and stations when they have some", () => {
    const member = managed({ nmsName: "Nova Star" });
    renderCard(member, { activity: { missionOwnerIds: [member.publicId], stationOwnerIds: [member.publicId] } });
    expect(screen.getByRole("link", { name: "Find Nova Star's missions" })).toHaveAttribute(
      "href",
      "/missions?search=Nova%20Star",
    );
    expect(screen.getByRole("link", { name: "Find Nova Star's stations" })).toHaveAttribute(
      "href",
      "/stations?search=Nova%20Star",
    );
  });

  it("omits activity links without activity or NMS name", () => {
    const member = managed({ nmsName: "" });
    renderCard(member, { activity: { missionOwnerIds: [member.publicId], stationOwnerIds: [member.publicId] } });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("lets a moderator approve, block, edit and delete a pending user", async () => {
    const member = managed({ membershipStatus: "pending" });
    const { user, onStatus, onEdit, onDelete } = renderCard(member);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revoke approval/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Approve nova@example.com" }));
    expect(onStatus).toHaveBeenCalledWith("nova@example.com", "approved");
    await user.click(screen.getByRole("button", { name: "Block nova@example.com" }));
    expect(onStatus).toHaveBeenCalledWith("nova@example.com", "blocked");
    await user.click(screen.getByRole("button", { name: "Edit user profile" }));
    expect(onEdit).toHaveBeenCalledWith(member);
    await user.click(screen.getByRole("button", { name: "Delete nova@example.com" }));
    expect(onDelete).toHaveBeenCalledWith(member);
  });

  it("offers revoking approval for approved users", async () => {
    const { user, onStatus } = renderCard(managed({ membershipStatus: "approved" }));
    await user.click(screen.getByRole("button", { name: "Revoke approval for nova@example.com" }));
    expect(onStatus).toHaveBeenCalledWith("nova@example.com", "pending");
    expect(screen.queryByRole("button", { name: /^Approve/ })).not.toBeInTheDocument();
  });

  it("offers unblocking for blocked users", async () => {
    const { user, onStatus } = renderCard(managed({ membershipStatus: "blocked" }));
    expect(screen.queryByRole("button", { name: /^Block/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Unblock nova@example.com" }));
    expect(onStatus).toHaveBeenCalledWith("nova@example.com", "pending");
  });

  it("lets an admin change the role of a user", async () => {
    const { user, onRole } = renderCard(managed({ role: "user" }), { canChangeRole: true });
    const select = screen.getByRole("combobox", { name: "Role for nova@example.com" });
    expect(select).toHaveValue("user");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Member", "Moderator", "Administrator"]);
    await user.selectOptions(select, "moderator");
    expect(onRole).toHaveBeenCalledWith("nova@example.com", "moderator");
  });

  it("gives only role, edit and delete actions on another admin", async () => {
    const member = managed({ role: "admin" });
    const { user, onRole, onDelete } = renderCard(member, { canChangeRole: true });
    expect(screen.getAllByRole("button")).toHaveLength(2);
    await user.selectOptions(screen.getByRole("combobox", { name: "Role for nova@example.com" }), "user");
    expect(onRole).toHaveBeenCalledWith("nova@example.com", "user");
    await user.click(screen.getByRole("button", { name: "Delete nova@example.com" }));
    expect(onDelete).toHaveBeenCalledWith(member);
    expect(screen.getByRole("button", { name: "Edit user profile" })).toBeInTheDocument();
  });
});
