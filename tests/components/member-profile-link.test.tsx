// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberProfileLink } from "@/components/shared/member-profile-link";
import { renderWithLocale } from "./helpers";

describe("member profile links", () => {
  it("opens and closes a read-only profile without a message context", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        publicId: "pilot",
        name: "Pilot",
        nmsName: "Pilot NMS",
        platforms: ["PC"],
        specialty: "ranger",
        nmsCode: "ABCDEFGHJKLMN",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { user } = renderWithLocale(
      <p>
        <MemberProfileLink memberId="pilot" name="Pilot" current />
      </p>,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pilot" }).closest("strong")).toHaveClass("current-member");
    await user.click(screen.getByRole("button", { name: "Pilot" }));
    expect(await screen.findByText("Pilot NMS")).toBeInTheDocument();
    expect(screen.getByText("ABCD-EFGH-JKLMN")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leave a message" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/members?id=pilot", expect.objectContaining({ cache: "no-store" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps names without a member id as plain text", () => {
    renderWithLocale(<MemberProfileLink name="Former member" />);
    expect(screen.getByText("Former member")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
