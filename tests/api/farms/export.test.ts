import { strFromU8 } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../../helpers/auth";
import { makeMember, seedMembers, writeDataFile } from "../../helpers/members";
import { readWorkbook } from "../../helpers/xlsx";
import { castMembers, makeCast, resetData, writeRawDataFile, type Cast } from "../helpers/fixtures";

vi.mock("@/auth", async () => (await import("../../helpers/auth")).authMock);

const portal = "0123456789AB";
let cast: Cast;

function storedFarm(overrides: Record<string, unknown> = {}) {
  return {
    id: "farm-1",
    name: "Copper farm",
    portal,
    galaxy: 0,
    planetName: "Ruba",
    resources: ["Copper", "Frost Crystal"],
    ownerId: cast.user.publicId,
    createdByMemberId: cast.moderator.publicId,
    createdAt: "2026-05-01T12:00:00.000Z",
    ...overrides,
  };
}

async function exportFarms() {
  const { GET } = await import("@/app/api/farms/export/route");
  return GET();
}

beforeEach(() => {
  resetData();
  cast = makeCast();
  seedMembers(castMembers(cast));
});

describe("GET /api/farms/export", () => {
  it("requires a session and approved, non-offline membership", async () => {
    const pendingModerator = makeMember({ role: "moderator", membershipStatus: "pending", simpleView: false });
    const blockedAdmin = makeMember({ role: "admin", membershipStatus: "blocked", simpleView: false });
    seedMembers([...castMembers(cast), pendingModerator, blockedAdmin]);
    writeRawDataFile("farms.json", "{broken");

    for (const member of [null, cast.pending, cast.blocked, cast.offline, pendingModerator, blockedAdmin]) {
      signInAs(member);
      const response = await exportFarms();
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "farms.error_access_required" });
    }
  });

  it("rejects regular members and staff in simple view", async () => {
    const simpleModerator = makeMember({ role: "moderator", simpleView: true });
    seedMembers([...castMembers(cast), simpleModerator]);
    writeRawDataFile("farms.json", "{broken");

    for (const member of [cast.user, cast.simpleAdmin, simpleModerator]) {
      signInAs(member);
      const response = await exportFarms();
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "farms.error_moderator_permission_required" });
    }
  });

  it.each(["moderator", "admin"] as const)("allows an approved %s to export", async (role) => {
    signInAs(cast[role]);
    expect((await exportFarms()).status).toBe(200);
  });

  it("exports an empty workbook with the expected sheet, columns and download headers", async () => {
    signInAs(cast.moderator);
    const response = await exportFarms();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="farm-\d{4}-\d{2}-\d{2}\.xlsx"$/,
    );

    const { files, sheet, rows } = await readWorkbook(response);
    expect(Object.keys(files).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    expect(strFromU8(files["xl/workbook.xml"])).toContain('<sheet name="Farm"');
    expect(sheet.match(/<col /g)).toHaveLength(14);
    expect(rows).toEqual([
      [
        "Nome farm",
        "Nome sistema",
        "Nome pianeta",
        "Indirizzo portale",
        "Galassia",
        "Materiali",
        "Piante",
        "Coordinate",
        "Note",
        "Proprietario",
        "Nome NMS proprietario",
        "Registrata da",
        "Data registrazione",
        "Ultima modifica",
      ],
    ]);
  });

  it("exports all fields, translated resources and unassigned farms in newest-first order without Almanac requests", async () => {
    const externalFetch = vi.fn(async () => {
      throw new Error("Unexpected external request");
    });
    vi.stubGlobal("fetch", externalFetch);
    writeDataFile("farms.json", [
      storedFarm({
        id: "older",
        name: "Unassigned",
        resources: ["Gold"],
        ownerId: null,
        createdByMemberId: undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      storedFarm({
        id: "newer",
        name: "Farm <A&B>",
        systemName: "=SUM(1,1)",
        planetName: "Planet 'Ruba'",
        resources: ["Gamma Root", "Sodium", "Frost Crystal", "Copper"],
        coordinates: "+12.5, -8.0",
        note: 'First <line> & "safe"\nSecond\u0001 line',
        createdAt: "2026-06-02T03:04:05.000Z",
        updatedAt: "2026-06-03T03:04:05.000Z",
      }),
    ]);
    signInAs(cast.admin);

    const response = await exportFarms();
    expect(response.status).toBe(200);
    const { sheet, rows } = await readWorkbook(response);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual([
      "Farm <A&B>",
      "=SUM(1,1)",
      "Planet 'Ruba'",
      portal,
      "Euclide",
      "Rame, Sodio",
      "Cristallo gelido, Radice gamma",
      "+12.5, -8.0",
      'First <line> & "safe"\nSecond line',
      cast.user.nmsName,
      cast.user.nmsName,
      cast.moderator.nmsName,
      "2026-06-02T03:04:05.000Z",
      "2026-06-03T03:04:05.000Z",
    ]);
    expect(rows[2]).toEqual([
      "Unassigned",
      "",
      "Ruba",
      portal,
      "Euclide",
      "Oro",
      "",
      "",
      "",
      "Non assegnato",
      "",
      "",
      "2026-01-01T00:00:00.000Z",
      "",
    ]);
    expect(sheet).toContain("Farm &lt;A&amp;B&gt;");
    expect(sheet).toContain("First &lt;line&gt; &amp; &quot;safe&quot;\nSecond line");
    expect(sheet).toContain('<c r="B2" t="inlineStr"><is><t xml:space="preserve">=SUM(1,1)</t></is></c>');
    expect(sheet).not.toContain("<f>");
    expect(externalFetch).not.toHaveBeenCalled();
  });

  it("handles former members and account-name fallbacks without exporting member email addresses", async () => {
    const emailOnly = makeMember({
      email: "private-profile@example.com",
      name: "account@example.com",
      nmsName: "nms@example.com",
    });
    const namedAccount = makeMember({
      email: "private-owner@example.com",
      name: "Visible account name",
      nmsName: "fake-nms@example.com",
    });
    seedMembers([...castMembers(cast), emailOnly, namedAccount]);
    writeDataFile("farms.json", [
      storedFarm({ id: "former", name: "Former", ownerId: "removed", createdByMemberId: "removed" }),
      storedFarm({
        id: "email",
        name: "Email only",
        ownerId: emailOnly.publicId,
        createdByMemberId: emailOnly.publicId,
      }),
      storedFarm({
        id: "account",
        name: "Account name",
        ownerId: namedAccount.publicId,
        createdByMemberId: namedAccount.publicId,
      }),
    ]);
    signInAs(cast.moderator);

    const { sheet, rows } = await readWorkbook(await exportFarms());
    const byName = new Map(rows.slice(1).map((row) => [row[0], row]));
    expect(byName.get("Former")?.slice(9, 12)).toEqual(["Ex membro", "", "Ex membro"]);
    expect(byName.get("Email only")?.slice(9, 12)).toEqual(["Ex membro", "", "Ex membro"]);
    expect(byName.get("Account name")?.slice(9, 12)).toEqual(["Visible account name", "", "Visible account name"]);
    expect(sheet).not.toContain("@example.com");
  });

  it("reports a storage failure instead of returning an incomplete workbook", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    writeRawDataFile("farms.json", "{broken");
    signInAs(cast.moderator);

    const response = await exportFarms();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "farms.error_unable_to_export" });
    expect(log).toHaveBeenCalledWith("Unable to export farms", expect.any(SyntaxError));
  });
});
