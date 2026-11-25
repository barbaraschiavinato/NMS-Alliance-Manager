import { describe, expect, it, vi } from "vitest";
import { signInAs } from "../helpers/auth";
import { makeMember, seedMembers, writeDataFile } from "../helpers/members";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);

const fileReads = vi.hoisted(() => new Map<string, number>());
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const readFile = (async (...args: Parameters<typeof actual.readFile>) => {
    const name = String(args[0]).split(/[\\/]/).pop() ?? "";
    fileReads.set(name, (fileReads.get(name) ?? 0) + 1);
    return actual.readFile(...args);
  }) as typeof actual.readFile;
  return { ...actual, default: { ...actual, readFile }, readFile };
});

function resetReads() {
  fileReads.clear();
}

describe("memoizedRead", () => {
  it("loads once per scope and gives every caller its own copy", async () => {
    const { memoizedRead, withRequestMemo } = await import("@/lib/storage/request-memo");
    const load = vi.fn(async () => ({ items: [1] }));
    const [first, second] = await withRequestMemo(async () =>
      Promise.all([memoizedRead("doc", load), memoizedRead("doc", load)]),
    )();
    expect(load).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ items: [1] });
    first.items.push(2);
    expect(second).toEqual({ items: [1] });
  });

  it("does not share reads between scopes or outside a scope", async () => {
    const { memoizedRead, withRequestMemo } = await import("@/lib/storage/request-memo");
    const load = vi.fn(async () => "value");
    const read = withRequestMemo(async () => memoizedRead("doc", load));
    await read();
    await read();
    await memoizedRead("doc", load);
    await memoizedRead("doc", load);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("reloads after clearRequestMemo and after a failed read", async () => {
    const { clearRequestMemo, memoizedRead, withRequestMemo } = await import("@/lib/storage/request-memo");
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("value");
    await withRequestMemo(async () => {
      await expect(memoizedRead("doc", load)).rejects.toThrow("offline");
      expect(await memoizedRead("doc", load)).toBe("value");
      expect(await memoizedRead("doc", load)).toBe("value");
      clearRequestMemo();
      expect(await memoizedRead("doc", load)).toBe("value");
    })();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("passes the handler arguments and result through", async () => {
    const { withRequestMemo } = await import("@/lib/storage/request-memo");
    const handler = withRequestMemo(async (left: number, right: number) => left + right);
    expect(await handler(2, 3)).toBe(5);
  });
});

describe("store reads inside a request", () => {
  it("never hands out the shared default documents", async () => {
    const { readAccessData } = await import("@/lib/members/access-store");
    const { readMissions } = await import("@/lib/missions/store");
    const access = await readAccessData();
    access.members.push(makeMember());
    access.alliance.name = "Changed";
    (await readMissions()).push({} as Awaited<ReturnType<typeof readMissions>>[number]);
    expect((await readAccessData()).members).toEqual([]);
    expect((await readAccessData()).alliance.name).not.toBe("Changed");
    expect(await readMissions()).toEqual((await import("@/lib/missions/seed")).initialMissions);
  });

  it("reads each document once per API request", async () => {
    const admin = makeMember({ role: "admin", simpleView: false });
    seedMembers([admin]);
    writeDataFile("missions.json", []);
    writeDataFile("stations-v2.json", []);
    writeDataFile("almanac.json", {});
    signInAs(admin);
    const { GET } = await import("@/app/api/stations/route");
    resetReads();
    expect((await GET(new Request("http://localhost/api/stations?cacheOnly=1"))).status).toBe(200);
    expect(Object.fromEntries(fileReads)).toEqual({
      "access.json": 1,
      "missions.json": 1,
      "stations-v2.json": 1,
      "almanac.json": 1,
    });
  });

  it("sees a write made earlier in the same request", async () => {
    const member = makeMember();
    seedMembers([member]);
    const { readAccessData, writeAccessData } = await import("@/lib/members/access-store");
    const { withRequestMemo } = await import("@/lib/storage/request-memo");
    const names = await withRequestMemo(async () => {
      const before = await readAccessData();
      before.members[0].nmsName = "Renamed";
      // Mutating a result must not change what the next reader gets.
      const untouched = (await readAccessData()).members[0].nmsName;
      await writeAccessData(before);
      return [untouched, (await readAccessData()).members[0].nmsName];
    })();
    expect(names).toEqual([member.nmsName, "Renamed"]);
  });
});
