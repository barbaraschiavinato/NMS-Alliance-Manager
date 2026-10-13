import { strFromU8, unzipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../../helpers/auth";
import { makeMember, seedMembers, writeDataFile } from "../../helpers/members";
import { castMembers, makeCast, resetData, storedMission, writeRawDataFile, type Cast } from "../helpers/fixtures";

vi.mock("@/auth", async () => (await import("../../helpers/auth")).authMock);

const P0 = "0123456789AB";
const Q0 = "0124456789AB";
let cast: Cast;

beforeEach(() => {
  resetData();
  cast = makeCast();
  seedMembers(castMembers(cast));
  writeDataFile("missions.json", []);
  writeDataFile("stations-v2.json", []);
});

async function exportStations() {
  const { GET } = await import("@/app/api/stations/export/route");
  return GET();
}

function unescapeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

// Legge il workbook prodotto dalla route e restituisce le righe del primo foglio come matrice di stringhe.
async function readWorkbook(response: Response) {
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  const rows = [...sheet.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)].map(([, rowNumber, cells]) => {
    const values = [
      ...cells.matchAll(/<c r="([A-Z]+)(\d+)" t="inlineStr"><is><t xml:space="preserve">(.*?)<\/t><\/is><\/c>/g),
    ];
    for (const [, , cellRow] of values) expect(cellRow).toBe(rowNumber);
    return values.map(([, , , text]) => unescapeXml(text));
  });
  return { files, sheet, rows };
}

describe("GET /api/stations/export", () => {
  it("returns 401 without a session or for pending, blocked and offline members", async () => {
    signInAs(null);
    expect((await exportStations()).status).toBe(401);
    for (const member of [cast.pending, cast.blocked, cast.offline]) {
      signInAs(member);
      expect((await exportStations()).status).toBe(401);
    }
  });

  it("returns 403 for users and simple-view admins", async () => {
    for (const member of [cast.user, cast.simpleAdmin]) {
      signInAs(member);
      const response = await exportStations();
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "stations.error_moderator_permission_required" });
    }
  });

  it("exports a valid workbook with only the header row when there are no stations", async () => {
    signInAs(cast.moderator);
    const response = await exportStations();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="stazioni-\d{4}-\d{2}-\d{2}\.xlsx"$/,
    );
    const { files, rows } = await readWorkbook(response);
    expect(Object.keys(files).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    expect(strFromU8(files["xl/workbook.xml"])).toContain('<sheet name="Stazioni"');
    expect(rows).toEqual([
      [
        "Nome stazione",
        "Indirizzo portale",
        "Galassia",
        "Pianeta",
        "Tipo pianeta",
        "Meteo",
        "Acqua",
        "Stella",
        "Economia",
        "Razza",
        "Scopritore",
        "Nome NMS scopritore",
        "Registrata da",
        "Note dello scopritore",
        "Data registrazione",
        "Missioni presenti",
        "Numero missioni",
        "Tipo missione",
        "Stato missioni",
      ],
    ]);
  });

  it("exports one row per station with planet, people and mission details", async () => {
    const emailNamed = makeMember({ nmsName: "owner@example.com", name: "owner@example.com" });
    seedMembers([...castMembers(cast), emailNamed]);
    writeDataFile("stations-v2.json", [
      {
        portal: P0,
        galaxy: 0,
        ownerId: cast.user.publicId,
        name: "Base <A&B>",
        note: 'Line "one"\u0001',
        createdByMemberId: cast.moderator.publicId,
        createdAt: "2026-01-02T03:04:05.000Z",
      },
      { portal: Q0, galaxy: 1, ownerId: emailNamed.publicId },
      { portal: "0125456789AB", galaxy: 2, ownerId: "removed-member" },
    ]);
    writeDataFile("almanac.json", {
      [P0]: {
        0: {
          lines: {
            headline: { word: "Eden" },
            band: {
              type: { word: "Lush" },
              weather: { word: "Calm" },
              water: { word: "Yes" },
              star: { word: "Yellow" },
              economy: { word: "Trade" },
              race: { word: "Gek" },
            },
          },
        },
      },
      [Q0]: { 1: { lines: { band: { type: { word: "Barren" }, weather: "bad" } } } },
    });
    writeDataFile("missions.json", [
      storedMission({
        id: "M-1",
        systemAddress: P0.toLowerCase(),
        galaxy: 0,
        targetSpecialty: "builder",
        status: "pending",
      }),
      storedMission({ id: "M-2", systemAddress: P0, galaxy: 0, targetSpecialty: "builder", status: "completed" }),
      storedMission({ id: "M-3", systemAddress: P0, galaxy: 0, targetSpecialty: "all", status: "completed" }),
    ]);
    signInAs(cast.admin);
    const response = await exportStations();
    expect(response.status).toBe(200);
    const { rows } = await readWorkbook(response);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toEqual([
      "Base <A&B>",
      P0,
      "Euclide",
      "Eden",
      "Lush",
      "Calm",
      "Yes",
      "Yellow",
      "Trade",
      "Gek",
      cast.user.nmsName,
      cast.user.nmsName,
      cast.moderator.nmsName,
      'Line "one"',
      "2026-01-02T03:04:05.000Z",
      "Sì",
      "3",
      "Costruttore, Tutte",
      "In attesa, Completata",
    ]);
    expect(rows[2]).toEqual([
      "",
      Q0,
      "Hilbert Dimension",
      "Barren",
      "Barren",
      "",
      "",
      "",
      "",
      "",
      "Ex membro",
      "",
      "Ex membro",
      "",
      "",
      "No",
      "0",
      "",
      "",
    ]);
    expect(rows[3].slice(0, 4)).toEqual(["", "0125456789AB", expect.any(String), ""]);
    expect(rows[3].slice(10, 13)).toEqual(["Ex membro", "", "Ex membro"]);
  });

  it("keeps private-use and astral characters but drops XML-invalid ones", async () => {
    writeDataFile("stations-v2.json", [
      { portal: P0, galaxy: 0, ownerId: cast.user.publicId, name: "Base \uE000\uFFFE\u{1F680}\uD800" },
    ]);
    signInAs(cast.moderator);
    const { rows } = await readWorkbook(await exportStations());
    expect(rows[1][0]).toBe("Base \uE000\u{1F680}");
  });

  it("returns 503 when the data cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeRawDataFile("stations-v2.json", "{broken");
    signInAs(cast.moderator);
    expect((await exportStations()).status).toBe(503);
  });
});
