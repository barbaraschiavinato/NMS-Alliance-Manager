import { describe, expect, it } from "vitest";
import {
  canManageOwnedItem,
  findApprovedOwner,
  ownerDisplayName,
  reassignOwnedItems,
  resolveOwner,
} from "@/lib/members/owned-items";
import { hasRole } from "@/lib/members/member-types";
import { makeMember } from "../helpers/members";

const errors = { cannotAssignAnother: "test.cannot_assign", mustBeApproved: "test.must_be_approved" } as const;

describe("hasRole", () => {
  it("compares the effective role against the minimum", () => {
    expect(hasRole(makeMember({ role: "admin" }), "moderator")).toBe(true);
    expect(hasRole(makeMember({ role: "moderator" }), "moderator")).toBe(true);
    expect(hasRole(makeMember({ role: "moderator" }), "admin")).toBe(false);
    expect(hasRole(makeMember({ role: "user" }), "moderator")).toBe(false);
    expect(hasRole(null, "user")).toBe(false);
  });
});

describe("canManageOwnedItem", () => {
  const user = makeMember();
  const moderator = makeMember({ role: "moderator" });

  it("lets the owner and staff manage an item", () => {
    expect(canManageOwnedItem(user, { ownerId: user.publicId })).toBe(true);
    expect(canManageOwnedItem(moderator, { ownerId: user.publicId })).toBe(true);
  });

  it("keeps other members and unassigned items out of reach of regular users", () => {
    expect(canManageOwnedItem(user, { ownerId: makeMember().publicId })).toBe(false);
    expect(canManageOwnedItem(user, { ownerId: null })).toBe(false);
    expect(canManageOwnedItem(moderator, { ownerId: null })).toBe(true);
  });
});

describe("resolveOwner", () => {
  const user = makeMember();
  const moderator = makeMember({ role: "moderator" });
  const approved = makeMember();
  const pending = makeMember({ membershipStatus: "pending" });
  const members = [user, moderator, approved, pending];

  it("makes regular users own what they save", () => {
    expect(resolveOwner(user, members, undefined, user.publicId, errors)).toEqual({ ownerId: user.publicId });
    expect(resolveOwner(user, members, ` ${user.publicId} `, user.publicId, errors)).toEqual({
      ownerId: user.publicId,
    });
  });

  it("refuses another owner or an unassigned item from regular users", () => {
    expect(resolveOwner(user, members, approved.publicId, user.publicId, errors)).toEqual({
      error: "test.cannot_assign",
      status: 403,
    });
    expect(resolveOwner(user, members, null, user.publicId, errors)).toEqual({
      error: "test.cannot_assign",
      status: 403,
    });
  });

  it("lets staff pick an approved owner, clear it or keep the fallback", () => {
    expect(resolveOwner(moderator, members, approved.publicId, moderator.publicId, errors)).toEqual({
      ownerId: approved.publicId,
    });
    expect(resolveOwner(moderator, members, null, moderator.publicId, errors)).toEqual({ ownerId: null });
    expect(resolveOwner(moderator, members, "", approved.publicId, errors)).toEqual({ ownerId: approved.publicId });
  });

  it("keeps a stored owner even when it is no longer approved, but rejects new non-approved owners", () => {
    expect(resolveOwner(moderator, members, pending.publicId, pending.publicId, errors)).toEqual({
      ownerId: pending.publicId,
    });
    expect(resolveOwner(moderator, members, pending.publicId, null, errors)).toEqual({
      error: "test.must_be_approved",
      status: 400,
    });
    expect(resolveOwner(moderator, members, "missing", null, errors)).toEqual({
      error: "test.must_be_approved",
      status: 400,
    });
  });
});

describe("owner display", () => {
  it("finds only approved owners", () => {
    const approved = makeMember();
    const blocked = makeMember({ membershipStatus: "blocked" });
    expect(findApprovedOwner([approved, blocked], approved.publicId)).toBe(approved);
    expect(findApprovedOwner([approved, blocked], blocked.publicId)).toBeUndefined();
    expect(findApprovedOwner([approved, blocked], null)).toBeUndefined();
  });

  it("prefers the in-game name and never shows an email address", () => {
    expect(ownerDisplayName(makeMember({ nmsName: "Atlas", name: "Account" }))).toBe("Atlas");
    expect(ownerDisplayName(makeMember({ nmsName: "", name: "Account" }))).toBe("Account");
    expect(ownerDisplayName(makeMember({ nmsName: "", name: "someone@example.com" }))).toBe("");
    expect(ownerDisplayName(undefined)).toBe("");
  });
});

describe("reassignOwnedItems", () => {
  it("moves ownership and authorship to the target member", () => {
    const items = [
      { id: "a", ownerId: "offline", createdByMemberId: "offline" },
      { id: "b", ownerId: "other", createdByMemberId: "offline" },
      { id: "c", ownerId: "offline" },
      { id: "d", ownerId: null, createdByMemberId: "other" },
    ];
    expect(reassignOwnedItems(items, "offline", "target")).toEqual([
      { id: "a", ownerId: "target", createdByMemberId: "target" },
      { id: "b", ownerId: "other", createdByMemberId: "target" },
      { id: "c", ownerId: "target" },
      { id: "d", ownerId: null, createdByMemberId: "other" },
    ]);
  });

  it("returns null when no item references the member", () => {
    expect(reassignOwnedItems([{ ownerId: "other", createdByMemberId: "other" }], "offline", "target")).toBeNull();
    expect(reassignOwnedItems([], "offline", "target")).toBeNull();
  });
});
