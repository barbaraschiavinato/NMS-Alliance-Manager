import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const publicDir = path.resolve(__dirname, "../../public");

// Serve gli shard della letter map da public/, come farebbe il browser.
function stubLetterMaps() {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    return new Response(readFileSync(path.join(publicDir, url), "utf8"), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function loadModule() {
  return import("@/lib/planets/system-name");
}

function mockSystemName(
  implementation: (address: bigint, galaxy: number, letterMap: Record<string, unknown>) => unknown,
) {
  vi.doMock("@/lib/nms-core/system.js", () => ({ systemName: implementation }));
}

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.doUnmock("@/lib/nms-core/system.js");
  vi.unstubAllGlobals();
});

describe("generateSystemName", () => {
  it.each([
    ["short portal", "0123456789A", 0],
    ["non-hex portal", "0123456789AG", 0],
    ["negative galaxy", "0123456789AB", -1],
    ["galaxy above 255", "0123456789AB", 256],
    ["fractional galaxy", "0123456789AB", 1.5],
  ])("returns null for a %s without fetching", async (_label, portal, galaxy) => {
    const fetchMock = stubLetterMaps();
    const { generateSystemName } = await loadModule();
    await expect(generateSystemName(portal, galaxy)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("generates a deterministic name, downloading only the needed shards once", async () => {
    const fetchMock = stubLetterMaps();
    const { generateSystemName } = await loadModule();
    const name = await generateSystemName("0123456789ab", 0);
    expect(name).toMatch(/\S/);
    expect(name).toBe(name?.trim());
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    for (const [url] of fetchMock.mock.calls) expect(String(url)).toMatch(/^\/nms-core\/letter_map_[0-7]\.json$/);
    const downloads = fetchMock.mock.calls.length;

    await expect(generateSystemName("0123456789AB", 0)).resolves.toBe(name);
    expect(fetchMock).toHaveBeenCalledTimes(downloads);
  });

  it("returns null and logs when a shard cannot be downloaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    const { generateSystemName } = await loadModule();
    await expect(generateSystemName("0123456789AB", 0)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith("Unable to generate system name with nms-core", expect.any(Error));
  });

  it("returns null and logs when the generator fails", async () => {
    mockSystemName(() => {
      throw new Error("boom");
    });
    const { generateSystemName } = await loadModule();
    await expect(generateSystemName("0123456789AB", 0)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it.each([
    ["blank", "   "],
    ["non-string", 42],
  ])("returns null for a %s name", async (_label, value) => {
    mockSystemName(() => value);
    const { generateSystemName } = await loadModule();
    await expect(generateSystemName("0123456789AB", 0)).resolves.toBeNull();
  });

  it("ignores letter map keys that are not shard indexes", async () => {
    mockSystemName((_address, _galaxy, letterMap) =>
      [letterMap["8"], letterMap.a, letterMap[Symbol.iterator as unknown as string]].every(
        (value) => value === undefined,
      )
        ? "Ok"
        : "Bad",
    );
    const { generateSystemName } = await loadModule();
    await expect(generateSystemName("0123456789AB", 0)).resolves.toBe("Ok");
  });

  it("gives up after eight shard downloads", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    let call = 0;
    mockSystemName((_address, _galaxy, letterMap) => letterMap[String(call++ % 8)]);
    const { generateSystemName } = await loadModule();
    await expect(generateSystemName("0123456789AB", 0)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });
});
