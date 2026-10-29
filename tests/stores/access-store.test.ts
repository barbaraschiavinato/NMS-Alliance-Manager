import { readdirSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessData, MemberProfileInput } from "@/lib/members/access-store";
import { devLocalAccounts, testLocalAccounts } from "@/lib/auth/local-auth";
import { defaultAlliance, makeMember, seedMembers, writeDataFile } from "../helpers/members";
import {
  blobMock,
  blobReadOptions,
  blobWriteOptions,
  dataDir,
  dataFileExists,
  readBlobJson,
  readDataFile,
  resetStores,
  setBlobJson,
  useBlobBackend,
} from "./helpers";

vi.mock("@vercel/blob", async () => (await import("./helpers")).blobModule);

const load = () => import("@/lib/members/access-store");
const readAccessFile = () => readDataFile("access.json") as AccessData;
const validUuid = "11111111-2222-4333-8444-555555555555";
const adminEmail = "root-admin@example.com";

function profile(overrides: Partial<MemberProfileInput> = {}): MemberProfileInput {
  return {
    nmsName: "Atlas Walker",
    nmsCode: "abcd-efgh-ijklm",
    platforms: ["PC", "PC", "Xbox"],
    specialty: "builder",
    ...overrides,
  };
}

beforeEach(() => {
  resetStores();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("readAccessData (local filesystem)", () => {
  it("returns empty defaults when the file does not exist", async () => {
    const { readAccessData } = await load();
    expect(await readAccessData()).toEqual({
      members: [],
      alliance: {
        name: "",
        logoUrl: "",
        bannerUrl: "",
        discordUrl: "",
        telegramUrl: "",
        heroGradientMode: "full",
        faviconUrl: "",
        appleIconUrl: "",
        appIcon192Url: "",
        appIcon512Url: "",
        portalCode: "",
        galaxy: 0,
      },
    });
    expect(dataFileExists("access.json")).toBe(false);
  });

  it("round-trips data written with writeAccessData", async () => {
    const { readAccessData, writeAccessData } = await load();
    const member = makeMember({
      telegramName: "tg",
      discordName: "dc",
      offline: true,
      role: "moderator",
      simpleView: false,
    });
    await writeAccessData({ members: [member], alliance: defaultAlliance });
    expect(await readAccessData()).toEqual({ members: [member], alliance: defaultAlliance });
    // Scrittura atomica: nessun file temporaneo resta in data/.
    expect(readdirSync(dataDir())).toEqual(["access.json"]);
  });

  it("rethrows malformed JSON", async () => {
    writeDataFile("access.json", {});
    const { writeFileSync } = await import("node:fs");
    writeFileSync(`${dataDir()}/access.json`, "{ not json");
    const { readAccessData } = await load();
    await expect(readAccessData()).rejects.toThrow(SyntaxError);
  });

  it("rethrows filesystem errors other than ENOENT", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(`${dataDir()}/access.json`, { recursive: true });
    const { readAccessData } = await load();
    await expect(readAccessData()).rejects.toMatchObject({ code: "EISDIR" });
  });

  it.each([null, 42, "text"])("returns defaults for a non-object document (%s)", async (value) => {
    writeDataFile("access.json", value);
    const { readAccessData } = await load();
    expect(await readAccessData()).toEqual({ members: [], alliance: expect.objectContaining({ name: "" }) });
  });

  it("treats a missing members array and missing alliance as empty", async () => {
    writeDataFile("access.json", { members: "nope" });
    const { readAccessData } = await load();
    expect(await readAccessData()).toEqual({
      members: [],
      alliance: {
        name: "",
        logoUrl: "",
        bannerUrl: "",
        discordUrl: "",
        telegramUrl: "",
        heroGradientMode: "full",
        faviconUrl: "",
        appleIconUrl: "",
        appIcon192Url: "",
        appIcon512Url: "",
        portalCode: "",
        galaxy: 0,
      },
    });
  });

  it("drops invalid member entries and normalizes field types", async () => {
    writeDataFile("access.json", {
      members: [
        null,
        "string",
        { email: "a@example.com", name: "A" },
        { email: 1, name: "B", image: "" },
        {
          publicId: validUuid,
          email: "c@example.com",
          name: "C",
          image: "img",
          nmsName: 5,
          nmsCode: null,
          telegramName: "",
          discordName: 7,
          platforms: ["PC", "Amiga", "Mac"],
          specialty: "pilot",
          role: "superuser",
          membershipStatus: "weird",
          approvedBy: 1,
          approvedAt: 2,
          lastLogin: 3,
          offline: "yes",
          simpleView: "true",
        },
        {
          publicId: "22222222-3333-4444-9555-666666666666",
          email: "d@example.com",
          name: "D",
          image: "",
          platforms: "PC",
          role: "admin",
          simpleView: false,
          offline: true,
          specialty: "ranger",
          membershipStatus: "blocked",
          pulseEffectsEnabled: false,
        },
      ],
    });
    const { readAccessData } = await load();
    const { members } = await readAccessData();
    expect(members).toEqual([
      {
        publicId: validUuid,
        email: "c@example.com",
        name: "C",
        image: "img",
        nmsName: "",
        nmsCode: "",
        platforms: ["PC", "Mac"],
        specialty: "",
        role: "user",
        membershipStatus: "pending",
        approvedBy: "",
        approvedAt: "",
        lastLogin: "",
        simpleView: true,
      },
      {
        publicId: "22222222-3333-4444-9555-666666666666",
        email: "d@example.com",
        name: "D",
        image: "",
        nmsName: "",
        nmsCode: "",
        platforms: [],
        specialty: "ranger",
        role: "admin",
        membershipStatus: "blocked",
        approvedBy: "",
        approvedAt: "",
        lastLogin: "",
        offline: true,
        simpleView: false,
        pulseEffectsEnabled: false,
      },
    ]);
  });

  it("keeps simpleView for non-user roles only when it is literally true", async () => {
    seedMembers([makeMember({ publicId: validUuid, role: "moderator", simpleView: true })]);
    const { readAccessData } = await load();
    expect((await readAccessData()).members[0].simpleView).toBe(true);
  });

  it("migrates missing or malformed publicIds and writes the result back", async () => {
    const good = makeMember({ publicId: validUuid });
    const missing = makeMember();
    const { publicId: dropped, ...withoutId } = missing;
    void dropped;
    writeDataFile("access.json", {
      members: [good, withoutId, { ...makeMember(), publicId: "not-a-uuid" }, { ...makeMember(), publicId: 12 }],
      alliance: defaultAlliance,
    });
    const { readAccessData } = await load();
    const data = await readAccessData();
    expect(data.members[0].publicId).toBe(validUuid);
    for (const member of data.members.slice(1)) {
      expect(member.publicId).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    }
    expect(new Set(data.members.map((member) => member.publicId)).size).toBe(4);
    // Il file contiene ora gli stessi id generati: letture successive sono stabili.
    expect(readAccessFile()).toEqual(data);
    const again = await readAccessData();
    expect(again.members.map((member) => member.publicId)).toEqual(data.members.map((member) => member.publicId));
  });

  it("migrates publicIds when a member entry is not an object", async () => {
    writeDataFile("access.json", { members: [makeMember({ publicId: validUuid }), null], alliance: defaultAlliance });
    const { readAccessData } = await load();
    const data = await readAccessData();
    expect(data.members).toHaveLength(1);
    expect(readAccessFile().members).toHaveLength(1);
  });

  it("does not rewrite the file when no publicId migration is needed", async () => {
    // Alleanza con valori legacy: vengono normalizzati in lettura ma non riscritti.
    writeDataFile("access.json", {
      members: [makeMember({ publicId: validUuid })],
      alliance: { name: "Nomad Syndicate", heroGradientEnabled: false },
    });
    const { readFileSync } = await import("node:fs");
    const before = readFileSync(`${dataDir()}/access.json`, "utf8");
    const { readAccessData } = await load();
    await readAccessData();
    expect(readFileSync(`${dataDir()}/access.json`, "utf8")).toBe(before);
  });

  it("does not rewrite when members is not an array", async () => {
    writeDataFile("access.json", { alliance: defaultAlliance });
    const { readAccessData } = await load();
    await readAccessData();
    expect(readAccessFile()).toEqual({ alliance: defaultAlliance });
  });
});

describe("alliance settings normalization", () => {
  it.each([
    ["Nomad Syndicate", ""],
    ["  nomad syndicate ", ""],
    ["Other Alliance", "Other Alliance"],
  ])("maps the legacy default name %j to %j", async (name, expected) => {
    seedMembers([], { ...defaultAlliance, name });
    const { readAccessData } = await load();
    expect((await readAccessData()).alliance.name).toBe(expected);
  });

  it.each([
    [{ heroGradientMode: "none" }, "none"],
    [{ heroGradientMode: "left" }, "left"],
    [{ heroGradientMode: "full" }, "full"],
    [{ heroGradientEnabled: false }, "none"],
    [{ heroGradientEnabled: true }, "full"],
    [{ heroGradientMode: "diagonal" }, "full"],
    [{ heroGradientMode: "diagonal", heroGradientEnabled: false }, "none"],
    [{}, "full"],
  ])("migrates hero gradient settings %j to %s", async (alliance, expected) => {
    writeDataFile("access.json", { members: [], alliance });
    const { readAccessData } = await load();
    expect((await readAccessData()).alliance.heroGradientMode).toBe(expected);
  });

  it.each([
    [
      { portalCode: "0123456789ab", galaxy: 255 },
      { portalCode: "0123456789AB", galaxy: 255 },
    ],
    [
      { portalCode: "0123456789A", galaxy: 256 },
      { portalCode: "", galaxy: 0 },
    ],
    [
      { portalCode: 123, galaxy: 1.5 },
      { portalCode: "", galaxy: 0 },
    ],
    [
      { portalCode: "0123456789AB", galaxy: -1 },
      { portalCode: "0123456789AB", galaxy: 0 },
    ],
  ])("normalizes the alliance portal %j to %j", async (stored, expected) => {
    writeDataFile("access.json", { members: [], alliance: { ...defaultAlliance, ...stored } });
    const { readAccessData } = await load();
    expect((await readAccessData()).alliance).toMatchObject(expected);
  });

  it("drops non-string alliance fields", async () => {
    writeDataFile("access.json", {
      members: [],
      alliance: { name: 1, logoUrl: 2, bannerUrl: "b", discordUrl: null, telegramUrl: "t" },
    });
    const { readAccessData } = await load();
    expect((await readAccessData()).alliance).toEqual({
      name: "",
      logoUrl: "",
      bannerUrl: "b",
      discordUrl: "",
      telegramUrl: "t",
      heroGradientMode: "full",
      faviconUrl: "",
      appleIconUrl: "",
      appIcon192Url: "",
      appIcon512Url: "",
      portalCode: "",
      galaxy: 0,
    });
  });
});

describe("Blob backend", () => {
  beforeEach(() => {
    useBlobBackend();
  });

  it("returns defaults when the blob is missing", async () => {
    const { readAccessData } = await load();
    expect(await readAccessData()).toEqual({
      members: [],
      alliance: expect.objectContaining({ heroGradientMode: "full" }),
    });
    expect(blobMock.get).toHaveBeenCalledWith("alliance-manager/access.json", blobReadOptions());
    expect(dataFileExists("access.json")).toBe(false);
  });

  it("returns defaults on a 304 response", async () => {
    setBlobJson("alliance-manager/access.json", { members: [makeMember()], alliance: defaultAlliance });
    blobMock.get.mockResolvedValueOnce({ statusCode: 304, stream: null });
    const { readAccessData } = await load();
    expect((await readAccessData()).members).toEqual([]);
  });

  it("reads and writes private JSON with overwrite enabled", async () => {
    const member = makeMember({ publicId: validUuid });
    const { readAccessData, writeAccessData } = await load();
    await writeAccessData({ members: [member], alliance: defaultAlliance });
    expect(blobMock.put).toHaveBeenCalledWith("alliance-manager/access.json", expect.any(String), blobWriteOptions());
    expect(blobMock.put.mock.calls[0][1]).toBe(
      `${JSON.stringify({ members: [member], alliance: defaultAlliance }, null, 2)}\n`,
    );
    expect(await readAccessData()).toEqual({ members: [member], alliance: defaultAlliance });
    expect(dataFileExists("access.json")).toBe(false);
  });

  it("writes back after a publicId migration, and only then", async () => {
    setBlobJson("alliance-manager/access.json", {
      members: [{ ...makeMember(), publicId: "bad" }],
      alliance: defaultAlliance,
    });
    const { readAccessData } = await load();
    const data = await readAccessData();
    expect(blobMock.put).toHaveBeenCalledTimes(1);
    expect(readBlobJson("alliance-manager/access.json")).toEqual(data);
    await readAccessData();
    expect(blobMock.put).toHaveBeenCalledTimes(1);
  });

  it("uses the store id with OIDC on Vercel", async () => {
    vi.stubEnv("NMS_READ_WRITE_TOKEN", "");
    vi.stubEnv("NMS_STORE_ID", "store_123");
    vi.stubEnv("VERCEL", "1");
    const { writeAccessData } = await load();
    await writeAccessData({ members: [], alliance: defaultAlliance });
    expect(blobMock.put).toHaveBeenCalledWith(
      "alliance-manager/access.json",
      expect.any(String),
      expect.objectContaining({ storeId: "store_123", access: "private" }),
    );
  });

  it("never touches Blob when LOCAL_AUTH is enabled", async () => {
    vi.stubEnv("LOCAL_AUTH", "true");
    vi.stubEnv("NODE_ENV", "development");
    const { writeAccessData } = await load();
    await writeAccessData({ members: [], alliance: defaultAlliance });
    expect(blobMock.put).not.toHaveBeenCalled();
    expect(dataFileExists("access.json")).toBe(true);
  });
});

describe("registerMember", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
  });

  it("registers a new member as a pending user with a normalized email", async () => {
    const { registerMember } = await load();
    const { member, alliance } = await registerMember({ email: "  New@Example.COM ", name: "", image: "pic" });
    expect(member).toEqual({
      publicId: expect.stringMatching(/^[\da-f-]{36}$/),
      email: "new@example.com",
      name: "new@example.com",
      image: "pic",
      nmsName: "",
      nmsCode: "",
      platforms: [],
      specialty: "",
      role: "user",
      membershipStatus: "pending",
      simpleView: true,
      approvedBy: "",
      approvedAt: "",
      lastLogin: "2026-05-01T12:00:00.000Z",
    });
    expect(alliance).toEqual(expect.objectContaining({ name: "" }));
    expect(readAccessFile().members).toEqual([member]);
  });

  it("auto-approves the configured admin email as admin", async () => {
    vi.stubEnv("ALLIANCE_ADMIN_EMAIL", " Root-Admin@Example.com ");
    const { registerMember } = await load();
    const { member } = await registerMember({ email: adminEmail, name: "Root", image: "" });
    expect(member).toMatchObject({
      role: "admin",
      membershipStatus: "approved",
      approvedBy: adminEmail,
      approvedAt: "2026-05-01T12:00:00.000Z",
      simpleView: false,
    });
  });

  it("promotes an existing member whose email became the admin email", async () => {
    const existing = makeMember({
      email: adminEmail,
      role: "user",
      membershipStatus: "pending",
      approvedAt: "",
      approvedBy: "",
    });
    seedMembers([existing]);
    vi.stubEnv("ALLIANCE_ADMIN_EMAIL", adminEmail);
    const { registerMember } = await load();
    const { member } = await registerMember({ email: adminEmail, name: existing.name, image: existing.image });
    expect(member).toMatchObject({
      publicId: existing.publicId,
      role: "admin",
      membershipStatus: "approved",
      approvedBy: adminEmail,
    });
    expect(member.approvedAt).toBe("2026-05-01T12:00:00.000Z");
  });

  it("returns the stored member untouched when seen within 15 minutes with the same identity", async () => {
    const existing = makeMember({ lastLogin: "2026-05-01T11:46:00.000Z" });
    seedMembers([existing]);
    const { registerMember } = await load();
    const { readFileSync } = await import("node:fs");
    const before = readFileSync(`${dataDir()}/access.json`, "utf8");
    const { member } = await registerMember({ email: existing.email, name: existing.name, image: existing.image });
    expect(member).toEqual(existing);
    expect(readFileSync(`${dataDir()}/access.json`, "utf8")).toBe(before);
  });

  it("refreshes lastLogin after 15 minutes and preserves profile fields", async () => {
    const existing = makeMember({
      lastLogin: "2026-05-01T11:45:00.000Z",
      telegramName: "tg",
      discordName: "dc",
      role: "moderator",
      simpleView: true,
      approvedAt: "2026-01-02T00:00:00.000Z",
    });
    seedMembers([existing]);
    const { registerMember } = await load();
    const { member } = await registerMember({ email: existing.email, name: existing.name, image: existing.image });
    expect(member).toEqual({ ...existing, lastLogin: "2026-05-01T12:00:00.000Z" });
    expect(readAccessFile().members).toEqual([member]);
  });

  it.each([
    ["name", { name: "Renamed" }],
    ["image", { image: "new.png" }],
  ])("rewrites a recently seen member when the %s changes", async (_field, change) => {
    const existing = makeMember({ lastLogin: "2026-05-01T11:59:00.000Z" });
    seedMembers([existing]);
    const { registerMember } = await load();
    const { member } = await registerMember({
      email: existing.email,
      name: existing.name,
      image: existing.image,
      ...change,
    });
    expect(member).toMatchObject({ ...change, lastLogin: "2026-05-01T12:00:00.000Z" });
  });

  it("treats an empty session name as the email for the recently-seen check", async () => {
    const existing = makeMember({ lastLogin: "2026-05-01T11:59:00.000Z" });
    existing.name = existing.email;
    seedMembers([existing]);
    const { registerMember } = await load();
    const { member } = await registerMember({ email: existing.email, name: "", image: existing.image });
    expect(member.lastLogin).toBe(existing.lastLogin);
  });

  it("rewrites when the member has never logged in", async () => {
    const existing = makeMember({ lastLogin: "" });
    seedMembers([existing]);
    const { registerMember } = await load();
    const { member } = await registerMember({ email: existing.email, name: existing.name, image: existing.image });
    expect(member.lastLogin).toBe("2026-05-01T12:00:00.000Z");
  });

  it("keeps blocked status and clears approvedAt for non-approved members", async () => {
    const existing = makeMember({ membershipStatus: "blocked", approvedAt: "2026-01-01T00:00:00.000Z", lastLogin: "" });
    seedMembers([existing]);
    const { registerMember } = await load();
    const { member } = await registerMember({ email: existing.email, name: existing.name, image: existing.image });
    expect(member).toMatchObject({ membershipStatus: "blocked", approvedAt: "", approvedBy: existing.approvedBy });
  });

  it("fills a missing approvedAt for approved members", async () => {
    const existing = makeMember({ approvedAt: "", lastLogin: "" });
    seedMembers([existing]);
    const { registerMember } = await load();
    const { member } = await registerMember({ email: existing.email, name: existing.name, image: existing.image });
    expect(member.approvedAt).toBe("2026-05-01T12:00:00.000Z");
  });

  it("adds a new member alongside existing ones", async () => {
    const existing = makeMember();
    seedMembers([existing]);
    const { registerMember } = await load();
    await registerMember({ email: "other@example.com", name: "Other", image: "" });
    expect(readAccessFile().members.map((member) => member.email)).toEqual([existing.email, "other@example.com"]);
  });
});

describe("ensureLocalMember", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
  });

  it("creates the development account approved with its default profile", async () => {
    const account = devLocalAccounts[0];
    const { ensureLocalMember, readAccessData } = await load();
    await ensureLocalMember(account);
    const [member] = (await readAccessData()).members;
    expect(member).toEqual({
      publicId: expect.any(String),
      email: account.email,
      name: account.name,
      image: "",
      nmsName: account.nmsName,
      nmsCode: account.nmsCode,
      platforms: [...account.platforms],
      specialty: account.specialty,
      role: "admin",
      membershipStatus: "approved",
      simpleView: false,
      approvedBy: account.email,
      approvedAt: "2026-05-01T12:00:00.000Z",
      lastLogin: "2026-05-01T12:00:00.000Z",
    });
  });

  it("restores role and approval but keeps an edited profile", async () => {
    const account = devLocalAccounts.find((item) => item.role === "moderator")!;
    const existing = makeMember({
      email: account.email,
      role: "user",
      membershipStatus: "blocked",
      nmsName: "Custom",
      nmsCode: "CUSTOMCODE123",
      telegramName: "tg",
      discordName: "dc",
      platforms: ["Mac"],
      specialty: "builder",
      simpleView: true,
      approvedBy: "someone@example.com",
      approvedAt: "2026-02-02T00:00:00.000Z",
    });
    seedMembers([existing, makeMember()]);
    const { ensureLocalMember, readAccessData } = await load();
    await ensureLocalMember(account);
    const { members } = await readAccessData();
    expect(members).toHaveLength(2);
    expect(members[0]).toEqual({
      ...existing,
      name: account.name,
      image: "",
      role: "moderator",
      membershipStatus: "approved",
      simpleView: true,
      lastLogin: "2026-05-01T12:00:00.000Z",
    });
  });

  it("completes an empty existing profile from the account", async () => {
    const account = devLocalAccounts.find((item) => item.email === "user@local")!;
    seedMembers([
      makeMember({
        email: account.email,
        nmsName: "",
        nmsCode: "",
        platforms: [],
        specialty: "",
        approvedBy: "",
        approvedAt: "",
      }),
    ]);
    const { ensureLocalMember, readAccessData } = await load();
    await ensureLocalMember(account);
    expect((await readAccessData()).members[0]).toMatchObject({
      nmsName: account.nmsName,
      nmsCode: account.nmsCode,
      platforms: account.platforms,
      specialty: account.specialty,
      approvedBy: account.email,
      approvedAt: "2026-05-01T12:00:00.000Z",
      simpleView: true,
    });
  });

  it("resets the profile of a fixed test-set account on every login", async () => {
    vi.stubEnv("LOCAL_AUTH", "true");
    vi.stubEnv("LOCAL_AUTH_SET", "test");
    const account = testLocalAccounts.find((item) => item.role === "user" && item.specialty === "explorer")!;
    const existing = makeMember({
      email: account.email,
      nmsName: "Custom",
      nmsCode: "CUSTOMCODE123",
      telegramName: "tg",
      platforms: ["Mac"],
      specialty: "builder",
    });
    seedMembers([existing]);
    const { ensureLocalMember, readAccessData } = await load();
    await ensureLocalMember(account);
    const [member] = (await readAccessData()).members;
    expect(member).toMatchObject({
      publicId: existing.publicId,
      nmsName: account.nmsName,
      nmsCode: account.nmsCode,
      platforms: account.platforms,
      specialty: account.specialty,
      role: "user",
      membershipStatus: "approved",
    });
    expect(member.telegramName).toBeUndefined();
  });
});

describe("offline members", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
  });

  it("creates an approved offline profile with normalized values", async () => {
    const { createOfflineMember, readAccessData } = await load();
    const created = await createOfflineMember(
      profile({ nmsName: "  Atlas Walker ", telegramName: " tg ", discordName: "  " }),
      " Mod@Example.com ",
    );
    expect(created).toEqual({
      publicId: expect.any(String),
      email: expect.stringMatching(/^offline-[\da-f-]{36}@offline\.invalid$/),
      name: "Atlas Walker",
      image: "",
      nmsName: "Atlas Walker",
      nmsCode: "ABCDEFGHIJKLM",
      telegramName: "tg",
      platforms: ["PC", "Xbox"],
      specialty: "builder",
      role: "user",
      membershipStatus: "approved",
      approvedBy: "mod@example.com",
      approvedAt: "2026-05-01T12:00:00.000Z",
      lastLogin: "",
      offline: true,
    });
    const member = created as Exclude<typeof created, string>;
    expect(member.email).toBe(`offline-${member.publicId}@offline.invalid`);
    const [stored] = (await readAccessData()).members;
    expect(stored).toEqual({ ...member, simpleView: true });
  });

  it("allows creating an offline member without a friend code", async () => {
    seedMembers([makeMember({ nmsCode: "" })]);
    const { createOfflineMember } = await load();
    const created = await createOfflineMember(profile({ nmsCode: "" }), "mod@example.com");
    expect(created).toMatchObject({ nmsCode: "" });
  });

  it.each([
    ["name", { nmsName: "  atlas WALKER " }],
    ["code", { nmsName: "Different", nmsCode: "ABCD EFGH IJKLM" }],
  ])("reports a %s conflict without writing", async (expected, overrides) => {
    seedMembers([makeMember({ nmsName: "Atlas Walker", nmsCode: "ABCDEFGHIJKLM" })]);
    const { createOfflineMember, readAccessData } = await load();
    expect(await createOfflineMember(profile(overrides), "mod@example.com")).toBe(expected);
    expect((await readAccessData()).members).toHaveLength(1);
  });

  it("updates an offline member, replacing contact fields", async () => {
    const offline = makeMember({
      offline: true,
      telegramName: "old-tg",
      discordName: "old-dc",
      nmsCode: "OLDCODE000001",
    });
    seedMembers([offline]);
    const { updateOfflineMember, readAccessData } = await load();
    expect(await updateOfflineMember(offline.publicId, profile({ telegramName: " new-tg " }))).toMatchObject({
      telegramName: "new-tg",
    });
    const updated = await updateOfflineMember(
      offline.publicId,
      profile({ nmsName: " New Name ", discordName: "new-dc" }),
    );
    expect(updated).toMatchObject({
      name: "New Name",
      nmsName: "New Name",
      nmsCode: "ABCDEFGHIJKLM",
      discordName: "new-dc",
      platforms: ["PC", "Xbox"],
      specialty: "builder",
    });
    expect(updated).not.toHaveProperty("telegramName");
    expect((await readAccessData()).members[0]).toEqual(updated);
  });

  it("lets an offline member keep its own name and code", async () => {
    const offline = makeMember({ offline: true, nmsName: "Atlas Walker", nmsCode: "ABCDEFGHIJKLM" });
    seedMembers([offline]);
    const { updateOfflineMember } = await load();
    expect(await updateOfflineMember(offline.publicId, profile())).toMatchObject({ nmsName: "Atlas Walker" });
  });

  it("returns a conflict when another member owns the name", async () => {
    const offline = makeMember({ offline: true });
    seedMembers([offline, makeMember({ nmsName: "Atlas Walker" })]);
    const { updateOfflineMember } = await load();
    expect(await updateOfflineMember(offline.publicId, profile())).toBe("name");
  });

  it("returns null for unknown or online members", async () => {
    const online = makeMember();
    seedMembers([online]);
    const { updateOfflineMember } = await load();
    expect(await updateOfflineMember(online.publicId, profile())).toBeNull();
    expect(await updateOfflineMember("missing", profile())).toBeNull();
  });
});

describe("updateMemberApproval", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    vi.stubEnv("ALLIANCE_ADMIN_EMAIL", adminEmail);
  });

  it("approves a pending user and records who approved", async () => {
    const pending = makeMember({ membershipStatus: "pending", approvedBy: "", approvedAt: "" });
    seedMembers([pending]);
    const { updateMemberApproval, readAccessData } = await load();
    const updated = await updateMemberApproval(
      ` ${pending.email.toUpperCase()} `,
      " Mod@Example.com ",
      "approved",
      "moderator",
    );
    expect(updated).toMatchObject({
      membershipStatus: "approved",
      approvedBy: "mod@example.com",
      approvedAt: "2026-05-01T12:00:00.000Z",
    });
    expect((await readAccessData()).members[0]).toEqual(updated);
  });

  it.each(["blocked", "pending"] as const)("clears approval data when setting %s", async (status) => {
    const member = makeMember();
    seedMembers([member]);
    const { updateMemberApproval } = await load();
    expect(await updateMemberApproval(member.email, "admin@example.com", status, "admin")).toMatchObject({
      membershipStatus: status,
      approvedBy: "",
      approvedAt: "",
    });
  });

  it("lets an admin change a moderator but not a moderator", async () => {
    const moderator = makeMember({ role: "moderator" });
    seedMembers([moderator]);
    const { updateMemberApproval } = await load();
    expect(await updateMemberApproval(moderator.email, "m@example.com", "blocked", "moderator")).toBeNull();
    expect(await updateMemberApproval(moderator.email, "a@example.com", "blocked", "admin")).toMatchObject({
      membershipStatus: "blocked",
    });
  });

  it("refuses admins, the configured admin, unknown members, empty emails and invalid statuses", async () => {
    const admin = makeMember({ role: "admin" });
    const configured = makeMember({ email: adminEmail });
    const user = makeMember();
    seedMembers([admin, configured, user]);
    const { updateMemberApproval, readAccessData } = await load();
    expect(await updateMemberApproval(admin.email, "a@example.com", "blocked", "admin")).toBeNull();
    expect(await updateMemberApproval(adminEmail.toUpperCase(), "a@example.com", "blocked", "admin")).toBeNull();
    expect(await updateMemberApproval("ghost@example.com", "a@example.com", "blocked", "admin")).toBeNull();
    expect(await updateMemberApproval("   ", "a@example.com", "blocked", "admin")).toBeNull();
    expect(await updateMemberApproval(user.email, "a@example.com", "kicked" as never, "admin")).toBeNull();
    expect((await readAccessData()).members.map((member) => member.membershipStatus)).toEqual([
      "approved",
      "approved",
      "approved",
    ]);
  });
});

describe("deleteMember", () => {
  beforeEach(() => {
    vi.stubEnv("ALLIANCE_ADMIN_EMAIL", adminEmail);
  });

  it("deletes a user", async () => {
    const user = makeMember();
    const other = makeMember();
    seedMembers([user, other]);
    const { deleteMember, readAccessData } = await load();
    expect(await deleteMember(` ${user.email.toUpperCase()}`, "moderator", "mod@example.com")).toBe(true);
    expect((await readAccessData()).members).toEqual([other]);
  });

  it("refuses empty, configured admin, self and unknown targets", async () => {
    const self = makeMember({ role: "admin" });
    seedMembers([self, makeMember({ email: adminEmail, role: "admin" })]);
    const { deleteMember, readAccessData } = await load();
    expect(await deleteMember("", "admin", self.email)).toBe(false);
    expect(await deleteMember(adminEmail, "admin", self.email)).toBe(false);
    expect(await deleteMember(self.email, "admin", ` ${self.email.toUpperCase()} `)).toBe(false);
    expect(await deleteMember("ghost@example.com", "admin", self.email)).toBe(false);
    expect((await readAccessData()).members).toHaveLength(2);
  });

  it("only lets moderators delete users", async () => {
    const moderator = makeMember({ role: "moderator" });
    const admin = makeMember({ role: "admin" });
    seedMembers([moderator, admin]);
    const { deleteMember } = await load();
    expect(await deleteMember(moderator.email, "moderator", "mod@example.com")).toBe(false);
    expect(await deleteMember(admin.email, "moderator", "mod@example.com")).toBe(false);
    expect(await deleteMember(moderator.email, "admin", "boss@example.com")).toBe(true);
  });

  it("only lets admins delete other admins", async () => {
    const admin = makeMember({ role: "admin" });
    seedMembers([admin]);
    const { deleteMember } = await load();
    expect(await deleteMember(admin.email, "user", "someone@example.com")).toBe(false);
    expect(await deleteMember(admin.email, "admin", "boss@example.com")).toBe(true);
  });
});

describe("isMemberProfileInput", () => {
  it("accepts a valid profile with optional fields", async () => {
    const { isMemberProfileInput } = await load();
    expect(isMemberProfileInput(profile())).toBe(true);
    expect(isMemberProfileInput(profile({ telegramName: "t", discordName: "d", simpleView: false }))).toBe(true);
    expect(isMemberProfileInput(profile({ pulseEffectsEnabled: false }))).toBe(true);
    expect(isMemberProfileInput({ ...profile(), platforms: [] })).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "profile"],
    ["a missing name", { ...profile(), nmsName: undefined }],
    ["a blank name", { ...profile(), nmsName: "   " }],
    ["a name over 40 characters", { ...profile(), nmsName: "x".repeat(41) }],
    ["a non-string code", { ...profile(), nmsCode: 123 }],
    ["an invalid code", { ...profile(), nmsCode: "SHORT" }],
    ["an empty code", { ...profile(), nmsCode: "" }],
    ["non-array platforms", { ...profile(), platforms: "PC" }],
    ["an unknown platform", { ...profile(), platforms: ["Dreamcast"] }],
    ["a non-string telegram name", { ...profile(), telegramName: 1 }],
    ["a telegram name over 40 characters", { ...profile(), telegramName: "t".repeat(41) }],
    ["a non-string discord name", { ...profile(), discordName: false }],
    ["a discord name over 40 characters", { ...profile(), discordName: "d".repeat(41) }],
    ["an unknown specialty", { ...profile(), specialty: "pilot" }],
    ["a non-boolean simpleView", { ...profile(), simpleView: "yes" }],
    ["a non-boolean pulseEffectsEnabled", { ...profile(), pulseEffectsEnabled: "yes" }],
  ])("rejects %s", async (_label, value) => {
    const { isMemberProfileInput } = await load();
    expect(isMemberProfileInput(value)).toBe(false);
  });

  it("accepts a 40-character name and contact names after trimming", async () => {
    const { isMemberProfileInput } = await load();
    expect(
      isMemberProfileInput({ ...profile(), nmsName: ` ${"x".repeat(40)} `, telegramName: ` ${"t".repeat(40)} ` }),
    ).toBe(true);
  });

  it("accepts an empty code only when allowed", async () => {
    const { isMemberProfileInput } = await load();
    expect(isMemberProfileInput({ ...profile(), nmsCode: "  " }, true)).toBe(true);
    expect(isMemberProfileInput({ ...profile(), nmsCode: "BAD" }, true)).toBe(false);
  });
});

describe("updateMemberProfile", () => {
  it("updates profile fields with normalization", async () => {
    const member = makeMember({ telegramName: "old" });
    seedMembers([member]);
    const { updateMemberProfile, readAccessData } = await load();
    const updated = await updateMemberProfile(
      member.email.toUpperCase(),
      profile({ nmsName: " Nova ", discordName: " dc " }),
    );
    expect(updated).toEqual({
      ...member,
      telegramName: undefined,
      nmsName: "Nova",
      nmsCode: "ABCDEFGHIJKLM",
      discordName: "dc",
      platforms: ["PC", "Xbox"],
      specialty: "builder",
    });
    expect(updated).not.toHaveProperty("telegramName");
    expect((await readAccessData()).members[0]).toEqual(updated);
  });

  it("returns null for unknown members", async () => {
    seedMembers([makeMember()]);
    const { updateMemberProfile } = await load();
    expect(await updateMemberProfile("ghost@example.com", profile())).toBeNull();
  });

  it("returns name and code conflicts with other members", async () => {
    const member = makeMember();
    seedMembers([member, makeMember({ nmsName: "Taken", nmsCode: "ABCDEFGHIJKLM" })]);
    const { updateMemberProfile } = await load();
    expect(await updateMemberProfile(member.email, profile({ nmsName: "taken" }))).toBe("name");
    expect(await updateMemberProfile(member.email, profile({ nmsName: "Free" }))).toBe("code");
  });

  it("changes simpleView only for moderators and admins", async () => {
    const user = makeMember({ role: "user", simpleView: true });
    const moderator = makeMember({ role: "moderator", simpleView: false });
    const admin = makeMember({ role: "admin", simpleView: true });
    seedMembers([user, moderator, admin]);
    const { updateMemberProfile } = await load();
    expect(
      await updateMemberProfile(user.email, profile({ nmsName: "U", nmsCode: user.nmsCode, simpleView: false })),
    ).toMatchObject({ simpleView: true });
    expect(
      await updateMemberProfile(
        moderator.email,
        profile({ nmsName: "M", nmsCode: moderator.nmsCode, simpleView: true }),
      ),
    ).toMatchObject({ simpleView: true });
    expect(await updateMemberProfile(admin.email, profile({ nmsName: "A", nmsCode: admin.nmsCode }))).toMatchObject({
      simpleView: true,
    });
  });

  it("stores disabled pulse effects and restores the enabled default", async () => {
    const member = makeMember();
    seedMembers([member]);
    const { updateMemberProfile } = await load();

    const disabled = await updateMemberProfile(
      member.email,
      profile({ nmsName: member.nmsName, nmsCode: member.nmsCode, pulseEffectsEnabled: false }),
    );
    expect(disabled).toMatchObject({ pulseEffectsEnabled: false });

    const enabled = await updateMemberProfile(
      member.email,
      profile({ nmsName: member.nmsName, nmsCode: member.nmsCode, pulseEffectsEnabled: true }),
    );
    expect(enabled).not.toHaveProperty("pulseEffectsEnabled");
  });
});

describe("updateMemberRole", () => {
  beforeEach(() => {
    vi.stubEnv("ALLIANCE_ADMIN_EMAIL", adminEmail);
  });

  it("changes the role of a member", async () => {
    const member = makeMember();
    seedMembers([member]);
    const { updateMemberRole, readAccessData } = await load();
    expect(await updateMemberRole(` ${member.email.toUpperCase()} `, "moderator")).toBe(true);
    expect((await readAccessData()).members[0].role).toBe("moderator");
  });

  it("refuses empty emails, invalid roles, the configured admin and unknown members", async () => {
    const member = makeMember({ email: adminEmail, role: "admin" });
    seedMembers([member]);
    const { updateMemberRole, readAccessData } = await load();
    expect(await updateMemberRole("", "moderator")).toBe(false);
    expect(await updateMemberRole("x@example.com", "owner" as never)).toBe(false);
    expect(await updateMemberRole(adminEmail, "user")).toBe(false);
    expect(await updateMemberRole("ghost@example.com", "user")).toBe(false);
    expect((await readAccessData()).members[0].role).toBe("admin");
  });
});

describe("updateAllianceSettings", () => {
  it("replaces the alliance settings and keeps members", async () => {
    const member = makeMember();
    seedMembers([member]);
    const { updateAllianceSettings, readAccessData } = await load();
    const settings = { ...defaultAlliance, name: "New Name", heroGradientMode: "left" as const };
    expect(await updateAllianceSettings(settings)).toEqual(settings);
    expect(await readAccessData()).toEqual({ members: [member], alliance: settings });
  });
});
