import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAlliance, seedMembers } from "../../helpers/members";
import { resetData } from "../helpers/fixtures";

vi.mock("@/auth", async () => (await import("../../helpers/auth")).authMock);

beforeEach(() => {
  resetData();
});

async function route() {
  return import("@/app/api/alliance/app-icon/route");
}

describe("GET /api/alliance/app-icon", () => {
  it("returns 404 for unsupported icon sizes without requiring a session", async () => {
    seedMembers([], defaultAlliance);
    const response = await (await route()).GET(new Request("http://localhost/api/alliance/app-icon?size=64"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Icona non trovata." });
  });

  it("does not accept inherited property names as icon sizes", async () => {
    seedMembers([], defaultAlliance);
    const response = await (await route()).GET(new Request("http://localhost/api/alliance/app-icon?size=toString"));
    expect(response.status).toBe(404);
  });

  it("returns 404 when an icon is not configured", async () => {
    seedMembers([], defaultAlliance);
    const response = await (await route()).GET(new Request("http://localhost/api/alliance/app-icon?size=192"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Icona non configurata." });
  });
});
