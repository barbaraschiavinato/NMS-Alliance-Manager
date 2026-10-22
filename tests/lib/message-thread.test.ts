import { describe, expect, it } from "vitest";
import { findMessageRoot } from "@/lib/message-thread";

describe("findMessageRoot", () => {
  it("resolves nested replies to the root and rejects missing IDs", () => {
    const root = { id: "root" };
    const messages = [root, { id: "reply", replyToId: "root" }, { id: "nested", replyToId: "reply" }];
    expect(findMessageRoot(messages, "root")).toBe(root);
    expect(findMessageRoot(messages, "nested")).toBe(root);
    expect(findMessageRoot(messages, "missing")).toBeUndefined();
  });

  it("uses the visible branch root when its parent is inaccessible", () => {
    const visible = { id: "reply", replyToId: "hidden" };
    expect(findMessageRoot([visible], "reply")).toBe(visible);
  });

  it("rejects circular ancestry", () => {
    expect(
      findMessageRoot(
        [
          { id: "a", replyToId: "b" },
          { id: "b", replyToId: "a" },
        ],
        "a",
      ),
    ).toBeUndefined();
    expect(findMessageRoot([{ id: "a", replyToId: "a" }], "a")).toBeUndefined();
  });
});
