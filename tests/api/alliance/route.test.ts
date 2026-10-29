import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../../helpers/auth";
import { jsonRequest } from "../../helpers/http";
import { defaultAlliance, seedMembers } from "../../helpers/members";
import { castMembers, makeCast, readDataFile, resetData, type Cast } from "../helpers/fixtures";

vi.mock("@/auth", async () => (await import("../../helpers/auth")).authMock);

const url = "/api/alliance";
let cast: Cast;
const storedAlliance = { ...defaultAlliance, name: "Stored Alliance", discordUrl: "https://discord.gg/abc" };

beforeEach(() => {
  resetData();
  cast = makeCast();
  seedMembers(castMembers(cast), storedAlliance);
});

async function routes() {
  return import("@/app/api/alliance/route");
}

function settings(overrides: Record<string, unknown> = {}) {
  return {
    name: "  New Name  ",
    logoUrl: "/api/alliance/image?path=alliance-manager%2Fbranding%2Flogo.png",
    bannerUrl: "",
    discordUrl: " https://discord.com/invite/xyz ",
    telegramUrl: "https://t.me/alliance",
    heroGradientMode: "left",
    faviconUrl: "",
    appleIconUrl: "",
    appIcon192Url: "",
    appIcon512Url: "",
    ...overrides,
  };
}

describe("GET /api/alliance", () => {
  it("returns 401 without a session or for pending/blocked members", async () => {
    signInAs(null);
    expect((await (await routes()).GET()).status).toBe(401);
    for (const member of [cast.pending, cast.blocked]) {
      signInAs(member);
      expect((await (await routes()).GET()).status).toBe(401);
    }
  });

  it("returns the alliance settings to every approved member", async () => {
    for (const member of [cast.user, cast.simpleAdmin, cast.moderator, cast.admin]) {
      signInAs(member);
      const response = await (await routes()).GET();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(storedAlliance);
    }
  });
});

describe("PATCH /api/alliance", () => {
  async function patch(body: unknown) {
    return (await routes()).PATCH(jsonRequest(url, "PATCH", body));
  }

  it("returns 401 without a session or for pending/blocked members", async () => {
    signInAs(null);
    expect((await patch(settings())).status).toBe(401);
    signInAs(cast.blocked);
    expect((await patch(settings())).status).toBe(401);
  });

  it("returns 403 for users, moderators and simple-view admins", async () => {
    for (const member of [cast.user, cast.moderator, cast.simpleAdmin]) {
      signInAs(member);
      expect((await patch(settings())).status).toBe(403);
    }
    expect(readDataFile<{ alliance: unknown }>("access.json").alliance).toEqual(storedAlliance);
  });

  it("rejects malformed bodies", async () => {
    signInAs(cast.admin);
    const response = await patch("{");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Impostazioni non valide." });
  });

  it.each([
    ["an empty name", { name: "   " }],
    ["a non-string name", { name: 5 }],
    ["a name over 80 characters", { name: "x".repeat(81) }],
    ["a missing logo URL", { logoUrl: undefined }],
    ["a missing banner URL", { bannerUrl: null }],
    ["a non-string Discord URL", { discordUrl: 1 }],
    ["an overly long Discord URL", { discordUrl: `https://discord.gg/${"a".repeat(300)}` }],
    ["a Discord URL on another host", { discordUrl: "https://evil.example/invite" }],
    ["a plain-http Discord URL", { discordUrl: "http://discord.gg/abc" }],
    ["a Discord URL with credentials", { discordUrl: "https://user:pass@discord.gg/abc" }],
    ["an unparsable Discord URL", { discordUrl: "discord.gg/abc" }],
    ["a non-string Telegram URL", { telegramUrl: false }],
    ["an overly long Telegram URL", { telegramUrl: `https://t.me/${"a".repeat(300)}` }],
    ["a Telegram URL on a Discord host", { telegramUrl: "https://discord.gg/abc" }],
    ["an unknown gradient mode", { heroGradientMode: "half" }],
    ["a non-string portal code", { portalCode: 123456789012 }],
    ["a portal code that is not 12 hex glyphs", { portalCode: "0123456789AG" }],
    ["a non-numeric galaxy", { galaxy: "1" }],
    ["a fractional galaxy", { galaxy: 1.5 }],
    ["a negative galaxy", { galaxy: -1 }],
    ["a galaxy above 255", { galaxy: 256 }],
  ])("rejects %s", async (_label, overrides) => {
    signInAs(cast.admin);
    const response = await patch(settings(overrides));
    expect(response.status).toBe(400);
    expect(readDataFile<{ alliance: unknown }>("access.json").alliance).toEqual(storedAlliance);
  });

  it("saves trimmed settings for an admin", async () => {
    signInAs(cast.admin);
    const response = await patch(settings());
    expect(response.status).toBe(200);
    const expected = {
      name: "New Name",
      logoUrl: "/api/alliance/image?path=alliance-manager%2Fbranding%2Flogo.png",
      bannerUrl: "",
      discordUrl: "https://discord.com/invite/xyz",
      telegramUrl: "https://t.me/alliance",
      heroGradientMode: "left",
      faviconUrl: "",
      appleIconUrl: "",
      appIcon192Url: "",
      appIcon512Url: "",
      portalCode: "",
      galaxy: 0,
    };
    expect(await response.json()).toEqual(expected);
    expect(readDataFile<{ alliance: unknown }>("access.json").alliance).toEqual(expected);
  });

  it("accepts empty invite links and t.co short links", async () => {
    signInAs(cast.admin);
    const response = await patch(
      settings({ discordUrl: "  ", telegramUrl: "https://T.CO/abc", heroGradientMode: "none" }),
    );
    expect(response.status).toBe(200);
    expect(readDataFile<{ alliance: Record<string, string> }>("access.json").alliance).toMatchObject({
      discordUrl: "",
      telegramUrl: "https://T.CO/abc",
      heroGradientMode: "none",
    });
  });

  it("saves the alliance portal code in upper case with its galaxy", async () => {
    signInAs(cast.admin);
    const response = await patch(settings({ portalCode: "0123456789ab", galaxy: 255 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ portalCode: "0123456789AB", galaxy: 255 });
    expect(readDataFile<{ alliance: Record<string, unknown> }>("access.json").alliance).toMatchObject({
      portalCode: "0123456789AB",
      galaxy: 255,
    });
  });

  it("saves generated app icon URLs", async () => {
    signInAs(cast.admin);
    const uploadId = "11111111-2222-4333-8444-555555555555";
    const iconUrls = {
      faviconUrl: `/api/alliance/image?path=alliance-manager%2Fbranding%2F${uploadId}-1.png`,
      appleIconUrl: `/api/alliance/image?path=alliance-manager%2Fbranding%2F${uploadId}-2.png`,
      appIcon192Url: `/api/alliance/image?path=alliance-manager%2Fbranding%2F${uploadId}-3.png`,
      appIcon512Url: `/api/alliance/image?path=alliance-manager%2Fbranding%2F${uploadId}-4.png`,
    };
    const response = await patch(settings(iconUrls));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject(iconUrls);
  });

  it("rejects non-string app icon URLs", async () => {
    signInAs(cast.admin);
    const response = await patch(settings({ appIcon192Url: null }));
    expect(response.status).toBe(400);
  });

  it("rejects app icon URLs outside the private alliance branding uploads", async () => {
    signInAs(cast.admin);
    const response = await patch(settings({ appIcon192Url: "https://example.com/icon.png" }));
    expect(response.status).toBe(400);
  });

  it("accepts an empty portal code", async () => {
    signInAs(cast.admin);
    const response = await patch(settings({ portalCode: "", galaxy: 0 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ portalCode: "", galaxy: 0 });
  });
});
